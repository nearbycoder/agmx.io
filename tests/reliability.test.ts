import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { Effect } from "effect"

/**
 * Things that only go wrong under retries, races, crashes and misbehaving peers:
 * duplicate deliveries, forward loops, interrupted sends, out-of-order delivery
 * events, and an agent undoing a human's pause.
 */
const url = process.env.DATABASE_URL!
let handler: (req: Request) => Promise<Response>
let sql: ReturnType<typeof postgres>
let ownerKey = ""
const ownerId = "usr_reliability"

const call = async (method: string, path: string, body?: unknown, key = ownerKey, headers: Record<string, string> = {}) => {
  const res = await handler(
    new Request(`http://agmx.test/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  )
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

const mail = async <A = any>(f: (m: any) => Effect.Effect<A, any, any>): Promise<A> => {
  const [{ runtime }, { Mail }] = await Promise.all([import("~/server/runtime"), import("~/server/services/Mail")])
  return runtime.runPromise(Effect.flatMap(Effect.service(Mail), f) as Effect.Effect<A, never, never>)
}

const compose = async (to: string, opts: { from?: string; subject?: string; text?: string; headers?: Record<string, string>; messageId?: string } = {}) => {
  const { composeMime } = await import("~/server/mail/compose")
  return composeMime({
    from: { name: "Sender", address: opts.from ?? "someone@example.com" },
    to: [{ name: null, address: to }],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: opts.subject ?? "Hello",
    text: opts.text ?? "Hi there",
    html: null,
    messageId: opts.messageId ?? `<${crypto.randomUUID()}@example.com>`,
    headers: opts.headers,
    attachments: []
  })
}

const ingest = async (to: string, opts: Parameters<typeof compose>[1] = {}) => {
  const raw = await compose(to, opts)
  return mail<{ delivered: number }>((m) => m.ingestRaw(raw, [to], {}))
}

const until = async (check: () => Promise<boolean>, ms = 5000) => {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await check()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return false
}

interface TestAgent { id: string; key: string; inbox: string; address: string }
let scout: TestAgent
let ledger: TestAgent

beforeAll(async () => {
  const admin = postgres(url, { max: 1, onnotice: () => {} })
  await admin.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;")
  await migrate(drizzle(admin), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname })
  await admin`insert into "user" (id, name, email, plan) values (${ownerId}, 'Owner', 'owner@example.com', 'pro')`
  await admin.end()
  sql = postgres(url, { max: 2, onnotice: () => {} })
  const [{ apiHandler }, { runtime }, { Agents }] = await Promise.all([
    import("~/server/http/web-handler"),
    import("~/server/runtime"),
    import("~/server/services/Agents")
  ])
  handler = (req) => apiHandler.handler(req)
  ownerKey = (await runtime.runPromise(Effect.flatMap(Effect.service(Agents), (a) => a.mintKey(ownerId, null, "test")))).key
  const make = async (name: string): Promise<TestAgent> => {
    const created = await call("POST", "/agents", { name, username: name.toLowerCase(), createApiKey: true })
    expect(created.status).toBe(200)
    return { id: created.body.agent.id, key: created.body.apiKey, inbox: created.body.agent.inboxes[0].id, address: created.body.agent.inboxes[0].address }
  }
  scout = await make("Scout")
  ledger = await make("Ledger")
})

afterAll(async () => {
  await sql?.end()
  const { runtime } = await import("~/server/runtime")
  await runtime.dispose()
})

describe("idempotency under concurrency", () => {
  it("sends once when the same key arrives several times at once", async () => {
    const payload = { from: scout.address, to: "someone@example.com", subject: "Race", text: "only once" }
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call("POST", "/messages", payload, scout.key, { "idempotency-key": "race-1" }))
    )
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200])
    expect(new Set(results.map((r) => r.body.id)).size).toBe(1)
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from messages where subject = 'Race'`
    expect(row!.n).toBe(1)
    // The losers' threads were rolled back with them.
    const [threads] = await sql<{ n: number }[]>`select count(*)::int as n from threads where subject = 'Race'`
    expect(threads!.n).toBe(1)
  })

  it("won't let one agent read another agent's message through its key", async () => {
    const mine = await call("POST", "/messages", { from: scout.address, to: "someone@example.com", subject: "Private", text: "for scout only" }, scout.key, { "idempotency-key": "shared-key" })
    expect(mine.status).toBe(200)
    const theirs = await call("POST", "/messages", { from: ledger.address, to: "someone@example.com", subject: "Other", text: "x" }, ledger.key, { "idempotency-key": "shared-key" })
    expect(theirs.status).toBe(409)
    expect(JSON.stringify(theirs.body)).not.toContain("for scout only")
  })
})

describe("timestamps round-trip through the API", () => {
  it("`since` set to a message's createdAt excludes that message", async () => {
    const raw = await compose(scout.address, { subject: "Since check" })
    await mail((m) => m.ingestRaw(raw, [scout.address], {}))
    const list = await call("GET", "/messages?q=Since%20check", undefined, scout.key)
    const message = list.body.messages[0]
    expect(message.subject).toBe("Since check")
    const after = await call("GET", `/messages?q=Since%20check&since=${encodeURIComponent(message.createdAt)}`, undefined, scout.key)
    expect(after.body.messages).toHaveLength(0)
  })

  it("pages through messages without skipping or repeating any", async () => {
    for (let i = 0; i < 7; i++) await ingest(ledger.address, { subject: `Page ${i}` })
    const seen: Array<string> = []
    let cursor: string | null = null
    do {
      const page: { body: { messages: Array<{ subject: string }>; nextCursor: string | null } } = await call(
        "GET",
        `/messages?q=Page&limit=3${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        undefined,
        ledger.key
      )
      seen.push(...page.body.messages.map((m) => m.subject))
      cursor = page.body.nextCursor
    } while (cursor)
    expect(seen.sort()).toEqual(["Page 0", "Page 1", "Page 2", "Page 3", "Page 4", "Page 5", "Page 6"])
  })
})

describe("duplicate inbound deliveries", () => {
  it("stores a redelivered message once", async () => {
    const raw = await compose(scout.address, { subject: "Delivered twice" })
    const first = await mail((m) => m.ingestRaw(raw, [scout.address], {}))
    const second = await mail((m) => m.ingestRaw(raw, [scout.address], {}))
    expect(first.delivered).toBe(1)
    expect(second.delivered).toBe(1)
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from messages where subject = 'Delivered twice'`
    expect(row!.n).toBe(1)
  })
})

describe("forward rules", () => {
  it("stops two inboxes that forward to each other", async () => {
    const a = await call("POST", `/inboxes/${scout.inbox}/rules`, { field: "subject", value: "loop", action: "forward", target: ledger.address })
    const b = await call("POST", `/inboxes/${ledger.inbox}/rules`, { field: "subject", value: "loop", action: "forward", target: scout.address })
    expect([a.status, b.status]).toEqual([200, 200])

    await ingest(scout.address, { subject: "Loop test" })
    const count = async () => (await sql<{ n: number }[]>`select count(*)::int as n from messages where subject ilike '%loop test%'`)[0]!.n
    // Wait for the chain to run, then check it has settled instead of growing forever.
    await until(async () => (await count()) >= 4)
    await new Promise((r) => setTimeout(r, 700))
    const settled = await count()
    await new Promise((r) => setTimeout(r, 700))
    expect(await count()).toBe(settled)
    // 1 original, then at most three forwards, each stored as an outbound and an inbound copy.
    expect(settled).toBeLessThanOrEqual(7)

    await call("DELETE", `/rules/${a.body.id}`)
    await call("DELETE", `/rules/${b.body.id}`)
  })

  it("doesn't forward an auto-responder's reply", async () => {
    const rule = await call("POST", `/inboxes/${scout.inbox}/rules`, { field: "subject", value: "away", action: "forward", target: "boss@example.com" })
    await ingest(scout.address, { subject: "Away until Monday", headers: { "Auto-Submitted": "auto-replied" } })
    await ingest(scout.address, { subject: "Away day plans" })
    await until(async () => (await sql`select 1 from messages where subject = 'Fwd: Away day plans'`).length === 1)
    expect(await sql`select 1 from messages where subject = 'Fwd: Away until Monday'`).toHaveLength(0)
    await call("DELETE", `/rules/${rule.body.id}`)
  })
})

describe("pausing is a human's decision", () => {
  it("lets an agent pause itself but not resume", async () => {
    const paused = await call("PATCH", `/agents/${ledger.id}`, { status: "paused" }, ledger.key)
    expect(paused.body.status).toBe("paused")
    const resumed = await call("PATCH", `/agents/${ledger.id}`, { status: "active" }, ledger.key)
    expect(resumed.status).toBe(403)
    expect((await call("PATCH", `/agents/${ledger.id}`, { status: "active" })).body.status).toBe("active")
  })

  it("applies the same rule to inboxes", async () => {
    expect((await call("PATCH", `/inboxes/${ledger.inbox}`, { status: "paused" }, ledger.key)).body.status).toBe("paused")
    expect((await call("PATCH", `/inboxes/${ledger.inbox}`, { status: "active" }, ledger.key)).status).toBe(403)
    expect((await call("PATCH", `/inboxes/${ledger.inbox}`, { status: "active" })).body.status).toBe("active")
  })

  it("holds scheduled mail while the agent is paused, then releases it", async () => {
    const later = new Date(Date.now() + 3_600_000).toISOString()
    const scheduled = await call("POST", "/messages", { from: ledger.address, to: "someone@example.com", subject: "Paused later", text: "hi", sendAt: later }, ledger.key)
    expect(scheduled.body.status).toBe("scheduled")
    await sql`update messages set send_at = now() - interval '1 second' where id = ${scheduled.body.id}`
    await call("PATCH", `/agents/${ledger.id}`, { status: "paused" })
    expect(await mail((m) => m.processScheduled)).toBe(0)
    expect((await call("GET", `/messages/${scheduled.body.id}`)).body.status).toBe("scheduled")

    await call("PATCH", `/agents/${ledger.id}`, { status: "active" })
    expect(await mail((m) => m.processScheduled)).toBe(1)
    expect((await call("GET", `/messages/${scheduled.body.id}`)).body.status).toBe("sent")
  })
})

describe("interrupted sends", () => {
  it("fails messages stuck in sending and says whether a resend is safe", async () => {
    const a = await call("POST", "/messages", { from: scout.address, to: "someone@example.com", subject: "Stuck early", text: "x" }, scout.key)
    const b = await call("POST", "/messages", { from: scout.address, to: "someone@example.com", subject: "Stuck late", text: "x" }, scout.key)
    const fresh = await call("POST", "/messages", { from: scout.address, to: "someone@example.com", subject: "Just started", text: "x" }, scout.key)
    await sql`update messages set status = 'sending', rfc_message_id = null, sending_at = now() - interval '20 minutes' where id = ${a.body.id}`
    await sql`update messages set status = 'sending', sending_at = now() - interval '20 minutes' where id = ${b.body.id}`
    await sql`update messages set status = 'sending', sending_at = now() where id = ${fresh.body.id}`

    expect(await mail((m) => m.recoverInterrupted)).toBe(2)
    const early = await call("GET", `/messages/${a.body.id}`, undefined, scout.key)
    const late = await call("GET", `/messages/${b.body.id}`, undefined, scout.key)
    expect(early.body.status).toBe("failed")
    expect(early.body.error).toMatch(/safe to send it again/)
    expect(late.body.status).toBe("failed")
    expect(late.body.error).toMatch(/may already have been delivered/)
    expect((await call("GET", `/messages/${fresh.body.id}`, undefined, scout.key)).body.status).toBe("sending")
  })
})

describe("delivery events arriving out of order", () => {
  it("keeps a bounce when a delivery for another recipient arrives later", async () => {
    const sent = await call("POST", "/messages", { from: scout.address, to: ["a@example.com", "b@example.com"], subject: "Two people", text: "x" }, scout.key)
    const [row] = await sql<{ provider_message_id: string }[]>`select provider_message_id from messages where id = ${sent.body.id}`
    const id = row!.provider_message_id
    await mail((m) => m.applyDeliveryEvent(id, "bounced", "Permanent/General: a@example.com"))
    await mail((m) => m.applyDeliveryEvent(id, "delivered", null))
    const after = await call("GET", `/messages/${sent.body.id}`, undefined, scout.key)
    expect(after.body.status).toBe("bounced")
    await mail((m) => m.applyDeliveryEvent(id, "complained", "abuse"))
    expect((await call("GET", `/messages/${sent.body.id}`, undefined, scout.key)).body.status).toBe("complained")
  })
})

describe("limits on what a message can carry", () => {
  const base = () => ({ from: scout.address, to: "someone@example.com", subject: "Limits", text: "x" })

  it("rejects headers that would misrepresent the message", async () => {
    for (const headers of [{ Sender: "ceo@bank.com" }, { Bcc: "hidden@example.com" }, { "X-Ok": "line\r\nBcc: sneaky@example.com" }, { "Bad Name": "x" }]) {
      const res = await call("POST", "/messages", { ...base(), headers }, scout.key)
      expect({ headers, status: res.status }).toEqual({ headers, status: 422 })
    }
    const ok = await call("POST", "/messages", { ...base(), headers: { "X-Campaign": "welcome", "List-Unsubscribe": "<mailto:stop@example.com>" } }, scout.key)
    expect(ok.status).toBe(200)
  })

  it("rejects too many attachments and oversized drafts before storing anything", async () => {
    const small = { filename: "a.txt", contentType: "text/plain", content: Buffer.from("hi").toString("base64") }
    const many = await call("POST", "/messages", { ...base(), attachments: Array.from({ length: 26 }, () => small) }, scout.key)
    expect(many.status).toBe(422)

    // Pro allows 25 MB per message.
    const big = { filename: "big.bin", contentType: "application/octet-stream", content: Buffer.alloc(26 * 1024 * 1024).toString("base64") }
    const draft = await call("POST", "/drafts", { from: scout.address, subject: "Big draft", attachments: [big] }, scout.key)
    expect(draft.status).toBe(402)
    const [row] = await sql<{ n: number }[]>`select count(*)::int as n from messages where subject = 'Big draft'`
    expect(row!.n).toBe(0)
  })
})

describe("moving a draft to another inbox", () => {
  it("takes a new draft's thread along", async () => {
    const draft = await call("POST", "/drafts", { from: scout.address, to: "someone@example.com", subject: "Moving", text: "x" })
    const moved = await call("PATCH", `/drafts/${draft.body.id}`, { from: ledger.address })
    expect(moved.body.inboxId).toBe(ledger.inbox)
    expect(moved.body.threadId).toBe(draft.body.threadId)
    const [thread] = await sql<{ inbox_id: string }[]>`select inbox_id from threads where id = ${moved.body.threadId}`
    expect(thread!.inbox_id).toBe(ledger.inbox)
  })

  it("starts a new thread when the draft was a reply, so the old conversation stays private", async () => {
    await ingest(scout.address, { subject: "Question for Scout" })
    const original = (await call("GET", "/messages?q=Question%20for%20Scout", undefined, scout.key)).body.messages[0]
    const draft = await call("POST", "/drafts", { replyToMessageId: original.id, text: "answer" })
    expect(draft.body.threadId).toBe(original.threadId)
    const moved = await call("PATCH", `/drafts/${draft.body.id}`, { from: ledger.address })
    expect(moved.body.threadId).not.toBe(original.threadId)
    const sent = await call("POST", `/drafts/${draft.body.id}/send`, {})
    expect(sent.body.status).toBe("sent")
    // Scout's thread holds only Scout's mail; Ledger can't open it.
    const thread = await call("GET", `/threads/${original.threadId}`, undefined, scout.key)
    expect(thread.body.messages.map((m: { id: string }) => m.id)).toEqual([original.id])
    expect((await call("GET", `/threads/${original.threadId}`, undefined, ledger.key)).status).toBe(404)
  })
})
