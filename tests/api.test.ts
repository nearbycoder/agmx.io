import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { Effect } from "effect"

/**
 * End-to-end tests through the real Effect HttpApi web handler and Postgres.
 * Uses the agmx_test database (TEST_DATABASE_URL) with the console mail transport.
 */
const url = process.env.DATABASE_URL!
let handler: (req: Request) => Promise<Response>
let ownerKey = ""
let ownerId = ""

const call = async (method: string, path: string, body?: unknown, key = ownerKey) => {
  const res = await handler(
    new Request(`http://agmx.test/api/v1${path}`, {
      method,
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  )
  const text = await res.text()
  return { status: res.status, body: text ? JSON.parse(text) : null }
}

beforeAll(async () => {
  const admin = postgres(url, { max: 1, onnotice: () => {} })
  await admin.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;")
  await migrate(drizzle(admin), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname })
  await admin`insert into "user" (id, name, email, plan) values ('usr_owner', 'Owner', 'owner@example.com', 'free')`
  await admin.end()
  ownerId = "usr_owner"

  const [{ apiHandler }, { runtime }, { Agents }] = await Promise.all([
    import("~/server/http/web-handler"),
    import("~/server/runtime"),
    import("~/server/services/Agents")
  ])
  handler = (req) => apiHandler.handler(req)
  ownerKey = (await runtime.runPromise(Effect.flatMap(Effect.service(Agents), (a) => a.mintKey(ownerId, null, "test")))).key
})

afterAll(async () => {
  const { runtime } = await import("~/server/runtime")
  await runtime.dispose()
})

describe("auth", () => {
  it("rejects missing and bad keys with tagged errors", async () => {
    expect((await call("GET", "/me", undefined, "")).body._tag).toBe("Unauthorized")
    const bad = await call("GET", "/me", undefined, "agmx_acc_nope")
    expect(bad.status).toBe(401)
    expect(bad.body.message).toMatch(/invalid/i)
  })
  it("returns the account with plan limits", async () => {
    const me = await call("GET", "/me")
    expect(me.status).toBe(200)
    expect(me.body.plan.id).toBe("free")
    expect(me.body.auth.kind).toBe("account_key")
  })
})

describe("agents, inboxes and mail", () => {
  let scout: { agentId: string; key: string; inboxId: string }
  let ledger: { agentId: string; key: string; inboxId: string }

  it("creates agents with inboxes and scoped keys", async () => {
    const a = await call("POST", "/agents", { name: "Scout", username: "scout", createApiKey: true })
    expect(a.status).toBe(200)
    expect(a.body.agent.inboxes[0].address).toBe("scout@agmx.test")
    scout = { agentId: a.body.agent.id, key: a.body.apiKey, inboxId: a.body.agent.inboxes[0].id }
    const b = await call("POST", "/agents", { name: "Ledger", username: "ledger", createApiKey: true })
    ledger = { agentId: b.body.agent.id, key: b.body.apiKey, inboxId: b.body.agent.inboxes[0].id }
  })

  it("enforces plan limits (free = 2 agents, 1 inbox per agent)", async () => {
    const third = await call("POST", "/agents", { name: "Third" })
    expect(third.status).toBe(402)
    expect(third.body).toMatchObject({ _tag: "QuotaExceeded", limit: "agents", max: 2 })
    const inbox = await call("POST", "/inboxes", { username: "scout2" }, scout.key)
    expect(inbox.body).toMatchObject({ _tag: "QuotaExceeded", limit: "inboxes_per_agent" })
  })

  it("validates usernames and conflicts", async () => {
    const reserved = await call("POST", "/agents", { name: "X", username: "postmaster" })
    expect(reserved.status).toBe(402) // agent quota is checked first on free
  })

  it("isolates agent keys from each other", async () => {
    const list = await call("GET", "/inboxes", undefined, scout.key)
    expect(list.body.map((i: { address: string }) => i.address)).toEqual(["scout@agmx.test"])
    const peek = await call("GET", `/inboxes/${ledger.inboxId}`, undefined, scout.key)
    expect(peek.status).toBe(404)
    const create = await call("POST", "/agents", { name: "Nope" }, scout.key)
    expect(create.body._tag).toBe("Forbidden")
    expect((await call("GET", "/domains", undefined, scout.key)).status).toBe(403)
  })

  it("searches HTML-only email bodies via safeText and updates draft thread subjects", async () => {
    const { runtime } = await import("~/server/runtime")
    const { Mail } = await import("~/server/services/Mail")
    const raw = Buffer.from(
      [
        "From: Billing <billing@example.com>",
        "To: scout@agmx.test",
        "Subject: Statement",
        "Message-ID: <html-only-search@example.com>",
        "MIME-Version: 1.0",
        "Content-Type: text/html; charset=utf-8",
        "",
        "<p>Your unique quarterly reference is <strong>QRT-9941-ZEBRA</strong>.</p>"
      ].join("\r\n")
    )
    await runtime.runPromise(Effect.flatMap(Effect.service(Mail), (m) => m.ingestRaw(raw, ["scout@agmx.test"], { dmarc: "PASS" })))
    const found = await call("GET", "/messages?q=QRT-9941-ZEBRA", undefined, scout.key)
    expect(found.status).toBe(200)
    expect(found.body.messages.length).toBeGreaterThanOrEqual(1)

    const draft = await call("POST", "/drafts", { to: "someone@example.com", subject: "Initial draft", text: "Hello" }, scout.key)
    expect(draft.status).toBe(200)
    const updated = await call("PATCH", `/drafts/${draft.body.id}`, { subject: "Renamed draft" }, scout.key)
    expect(updated.status).toBe(200)
    const thread = await call("GET", `/threads/${draft.body.threadId}`, undefined, scout.key)
    expect(thread.body.subject).toBe("Renamed draft")
    await call("DELETE", `/drafts/${draft.body.id}`, undefined, scout.key)
  })

  it("delivers internally, threads replies and extracts codes", async () => {
    const sent = await call("POST", "/messages", { to: "ledger@agmx.test", subject: "Your code", text: "Your verification code is 731942" }, scout.key)
    expect(sent.status).toBe(200)
    expect(sent.body.status).toBe("sent")

    const inbox = await call("GET", "/messages?folder=inbox", undefined, ledger.key)
    expect(inbox.body.messages).toHaveLength(1)
    const msg = inbox.body.messages[0]
    expect(msg.extracted.codes).toEqual(["731942"])
    expect(msg.isRead).toBe(false)

    const reply = await call("POST", `/messages/${msg.id}/reply`, { text: "Got it, thanks" }, ledger.key)
    expect(reply.body.subject).toBe("Re: Your code")

    const threads = await call("GET", "/threads", undefined, scout.key)
    expect(threads.body.threads[0]).toMatchObject({ messageCount: 2, unreadCount: 1 })

    const read = await call("GET", `/messages/${msg.id}?markRead=true`, undefined, ledger.key)
    expect(read.body.isRead).toBe(true)
  })

  it("long-polls for new mail", async () => {
    const waiting = call("GET", `/messages/wait?timeout=10&inboxId=${scout.inboxId}`, undefined, scout.key)
    await new Promise((r) => setTimeout(r, 300))
    await call("POST", "/messages", { to: "scout@agmx.test", subject: "Ping", text: "Login code: 555123" }, ledger.key)
    const result = await waiting
    expect(result.body.timedOut).toBe(false)
    expect(result.body.message.subject).toBe("Ping")
  })

  it("times out cleanly", async () => {
    const result = await call("GET", "/messages/wait?timeout=1&subject=never-gonna-happen", undefined, scout.key)
    expect(result.body).toEqual({ message: null, timedOut: true })
  })

  it("rejects invalid recipients", async () => {
    const bad = await call("POST", "/messages", { to: "not-an-email", subject: "x", text: "y" }, scout.key)
    expect(bad.status).toBe(422)
    expect(bad.body._tag).toBe("InvalidRequest")
  })

  it("enforces the daily send quota", async () => {
    const pg = postgres(url, { max: 1 })
    await pg`update usage_daily set sent = 50 where user_id = ${ownerId}`
    await pg.end()
    const blocked = await call("POST", "/messages", { to: "ledger@agmx.test", subject: "x", text: "y" }, scout.key)
    expect(blocked.body).toMatchObject({ _tag: "QuotaExceeded", limit: "daily_sends" })
  })
})

describe("agent self sign-up", () => {
  it("runs the device flow and hands out the key exactly once", async () => {
    const pg = postgres(url, { max: 1 })
    await pg`update "user" set plan = 'pro' where id = ${ownerId}`
    await pg.end()

    const start = await call("POST", "/signup", { name: "Helper", username: "helper", ownerEmail: "owner@example.com" }, "")
    expect(start.status).toBe(200)
    const { signupId, pollToken, userCode } = start.body
    expect((await call("GET", `/signup/${signupId}?token=${pollToken}`, undefined, "")).body.status).toBe("pending")
    expect((await call("GET", `/signup/${signupId}?token=wrong`, undefined, "")).status).toBe(401)

    const pending = await call("GET", "/signup-requests")
    expect(pending.body.map((p: { userCode: string }) => p.userCode)).toContain(userCode)

    const approved = await call("POST", `/signup-requests/${userCode}/approve`, {})
    expect(approved.body.inboxes[0].address).toBe("helper@agmx.test")

    const first = await call("GET", `/signup/${signupId}?token=${pollToken}`, undefined, "")
    expect(first.body.status).toBe("approved")
    expect(first.body.apiKey).toMatch(/^agmx_agt_/)
    const second = await call("GET", `/signup/${signupId}?token=${pollToken}`, undefined, "")
    expect(second.body).toMatchObject({ status: "completed", apiKey: null })

    const me = await call("GET", "/me", undefined, first.body.apiKey)
    expect(me.body.auth).toMatchObject({ kind: "agent_key", agentId: approved.body.id })
  })

  it("blocks another account from viewing or deciding a signup addressed to ownerEmail", async () => {
    const pg = postgres(url, { max: 1 })
    await pg`insert into "user" (id, name, email, plan) values ('usr_other', 'Other', 'other@example.com', 'pro') on conflict (id) do nothing`
    await pg.end()
    const [{ runtime }, { Agents }] = await Promise.all([import("~/server/runtime"), import("~/server/services/Agents")])
    const otherKey = (await runtime.runPromise(Effect.flatMap(Effect.service(Agents), (a) => a.mintKey("usr_other", null, "other")))).key

    const addressed = await call("POST", "/signup", { name: "PrivateBot", ownerEmail: "owner@example.com" }, "")
    expect(addressed.status).toBe(200)
    const code = addressed.body.userCode as string

    expect((await call("GET", `/signup-requests/${code}`, undefined, otherKey)).status).toBe(403)
    expect((await call("POST", `/signup-requests/${code}/approve`, {}, otherKey)).status).toBe(403)
    expect((await call("POST", `/signup-requests/${code}/deny`, undefined, otherKey)).status).toBe(403)

    // The intended owner can still inspect and deny it.
    expect((await call("GET", `/signup-requests/${code}`, undefined, ownerKey)).status).toBe(200)
    expect((await call("POST", `/signup-requests/${code}/deny`, undefined, ownerKey)).status).toBe(200)

    // Without ownerEmail, any human with the code can still review/deny it.
    const open = await call("POST", "/signup", { name: "OpenBot" }, "")
    expect(open.status).toBe(200)
    expect((await call("GET", `/signup-requests/${open.body.userCode}`, undefined, otherKey)).status).toBe(200)
    expect((await call("POST", `/signup-requests/${open.body.userCode}/deny`, undefined, otherKey)).status).toBe(200)
  })
})

describe("webhooks", () => {
  it("records failed test deliveries", async () => {
    const agents = await call("GET", "/agents")
    const id = agents.body[0].id
    await call("PATCH", `/agents/${id}`, { webhookUrl: "http://127.0.0.1:9/nothing-here" })
    const delivery = await call("POST", `/agents/${id}/webhook-test`)
    expect(delivery.body).toMatchObject({ event: "webhook.test", status: "failed", attempts: 1 })
  })
})

describe("operator domain", () => {
  it("only lets operators claim addresses on the brand domain, including reserved names", async () => {
    const agents = await call("GET", "/agents")
    const agentId = agents.body[0].id
    const denied = await call("POST", "/inboxes", { agentId, username: "admin", domain: "ops.test" })
    expect(denied.body).toMatchObject({ _tag: "InvalidRequest", field: "domain" })
    expect((await call("GET", "/me")).body.operatorDomain).toBeNull()

    const pg = postgres(url, { max: 1 })
    await pg`update "user" set role = 'admin' where id = ${ownerId}`
    await pg.end()
    expect((await call("GET", "/me")).body.operatorDomain).toBe("ops.test")
    const created = await call("POST", "/inboxes", { agentId, username: "admin", domain: "ops.test" })
    expect(created.body.address).toBe("admin@ops.test")
  })

  it("refuses the server's own domains as custom domains", async () => {
    for (const name of ["ops.test", "mail.agmx.test"]) {
      const res = await call("POST", "/domains", { name })
      expect(res.body._tag).toBe("InvalidRequest")
    }
  })
})

describe("inbound limits", () => {
  it("drops mail over the monthly receive limit and counts it", async () => {
    const inboxes = (await call("GET", "/inboxes")).body as Array<{ address: string; id: string }>
    const [from, to] = inboxes
    const pg = postgres(url, { max: 1 })
    await pg`update usage_daily set received = 100000, sent = 0 where user_id = ${ownerId}`
    await pg.end()
    const before = (await call("GET", `/messages?inboxId=${to!.id}&folder=inbox`)).body.messages.length
    const sent = await call("POST", "/messages", { from: from!.address, to: to!.address, subject: "Over the limit", text: "hi" })
    expect(sent.body.status).toBe("sent")
    const after = (await call("GET", `/messages?inboxId=${to!.id}&folder=inbox`)).body.messages.length
    expect(after).toBe(before)
    const me = await call("GET", "/me")
    expect(me.body.usage.droppedThisMonth).toBe(1)
    expect(me.body.plan.monthlyReceives).toBe(100_000)
  })

  it("rejects messages larger than the plan's inbound size", async () => {
    const [{ runtime }, { Quota }] = await Promise.all([import("~/server/runtime"), import("~/server/services/Quota")])
    const result = await runtime.runPromise(Effect.flatMap(Effect.service(Quota), (q) => q.admitInbound(ownerId, 60 * 1024 * 1024)))
    expect(result.ok).toBe(false)
  })
})

describe("attachment storage cleanup", () => {
  it("queues object keys for deletion when attachment rows disappear", async () => {
    const pg = postgres(url, { max: 1 })
    const [msg] = await pg`select id from messages where user_id = ${ownerId} limit 1`
    await pg`insert into attachments (id, user_id, message_id, filename, content_type, size, storage_key) values ('att_t', ${ownerId}, ${msg!.id}, 'a.txt', 'text/plain', 1, 'attachments/test/key')`
    await call("DELETE", `/messages/${msg!.id}`)
    const [queued] = await pg`select key from storage_deletions where key = 'attachments/test/key'`
    expect(queued?.key).toBe("attachments/test/key")
    await pg.end()
  })
})

describe("mcp server", () => {
  it("lists all 22 tools with object schemas and surfaces tagged errors", async () => {
    const [{ runtime }, { Agents }, { handleRpc }] = await Promise.all([
      import("~/server/runtime"),
      import("~/server/services/Agents"),
      import("~/server/mcp")
    ])
    const principal = await runtime.runPromise(Effect.flatMap(Effect.service(Agents), (a) => a.authenticate(ownerKey)))
    expect(principal).not.toBeNull()

    const init = (await runtime.runPromise(handleRpc(principal!, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }))) as {
      result: { protocolVersion: string; serverInfo: { name: string } }
    }
    expect(init.result.protocolVersion).toBe("2025-06-18")
    expect(init.result.serverInfo.name).toBe("agmx")

    const listed = (await runtime.runPromise(handleRpc(principal!, { jsonrpc: "2.0", id: 2, method: "tools/list" }))) as {
      result: { tools: Array<{ name: string; inputSchema: { type: string } }> }
    }
    expect(listed.result.tools).toHaveLength(22)
    for (const t of listed.result.tools) expect(t.inputSchema.type).toBe("object")

    const missing = (await runtime.runPromise(
      handleRpc(principal!, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_message", arguments: { messageId: "msg_does_not_exist" } } })
    )) as { result: { isError: boolean; content: Array<{ text: string }> } }
    expect(missing.result.isError).toBe(true)
    expect(JSON.parse(missing.result.content[0]!.text)).toMatchObject({ _tag: "NotFound", error: "NotFound" })
  })
})
