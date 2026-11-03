import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { Effect } from "effect"

/**
 * Account data rights: export and deletion, plus the operator's RFC 2142 role mailboxes.
 * Signs up through Better Auth so deletion runs with a real dashboard session.
 */
process.env.ADMIN_EMAILS = "owner@example.com"

const url = process.env.DATABASE_URL!
const EMAIL = "owner@example.com"
let handler: (req: Request) => Promise<Response>
let sql: ReturnType<typeof postgres>
let cookie = ""
let userId = ""
let accountKey = ""
let agentKey = ""

const call = async (method: string, path: string, opts: { body?: unknown; key?: string; cookie?: string } = {}) => {
  const res = await handler(
    new Request(`http://agmx.test/api/v1${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(opts.key ? { authorization: `Bearer ${opts.key}` } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {})
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    })
  )
  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  return { status: res.status, headers: res.headers, body }
}

beforeAll(async () => {
  const admin = postgres(url, { max: 1, onnotice: () => {} })
  await admin.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;")
  await migrate(drizzle(admin), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname })
  await admin.end()
  sql = postgres(url, { max: 2, onnotice: () => {} })

  const [{ apiHandler }, { auth }] = await Promise.all([import("~/server/http/web-handler"), import("~/server/auth")])
  handler = (req) => apiHandler.handler(req)

  const signUp = await auth.handler(
    new Request("http://agmx.test/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://agmx.test" },
      body: JSON.stringify({ email: EMAIL, password: "correct horse battery", name: "Owner" })
    })
  )
  expect(signUp.status).toBe(200)
  cookie = signUp.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
  const me = await call("GET", "/me", { cookie })
  expect(me.status).toBe(200)
  userId = me.body.user.id

  const [{ runtime }, { Agents }] = await Promise.all([import("~/server/runtime"), import("~/server/services/Agents")])
  accountKey = (await runtime.runPromise(Effect.flatMap(Effect.service(Agents), (a) => a.mintKey(userId, null, "test")))).key
  const created = await call("POST", "/agents", { key: accountKey, body: { name: "Scout", username: "scout", createApiKey: true } })
  expect(created.status).toBe(200)
  agentKey = created.body.apiKey
  const address = created.body.agent.inboxes[0].address as string

  const { composeMime } = await import("~/server/mail/compose")
  const { Mail } = await import("~/server/services/Mail")
  const raw = await composeMime({
    from: { name: "Sender", address: "someone@example.com" },
    to: [{ name: null, address }],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: "Your receipt",
    text: "Thanks for your order.",
    html: null,
    messageId: `<${crypto.randomUUID()}@example.com>`,
    attachments: [{ filename: "notes.txt", contentType: "text/plain", content: Buffer.from("hello attachment") }]
  })
  await runtime.runPromise(Effect.flatMap(Effect.service(Mail), (m) => m.ingestRaw(raw, [address], {})))
})

afterAll(async () => {
  await sql?.end()
  const { runtime } = await import("~/server/runtime")
  await runtime.dispose()
})

describe("system inboxes", () => {
  it("creates abuse@, postmaster@ and privacy@ for the first operator, idempotently", async () => {
    const [{ runtime }, { Db }, { ensureSystemInboxes }] = await Promise.all([
      import("~/server/runtime"),
      import("~/server/services/Db"),
      import("~/server/services/Account")
    ])
    const run = () => runtime.runPromise(Effect.flatMap(Effect.service(Db), (db) => ensureSystemInboxes(db)))
    await run()
    await run()
    const rows = await sql<{ address: string; name: string }[]>`
      select i.address, a.name from inboxes i join agents a on a.id = i.agent_id
      where i.user_id = ${userId} and a.name = 'Operator' order by i.address`
    expect(rows.map((r) => r.address)).toEqual(["abuse@ops.test", "postmaster@ops.test", "privacy@ops.test"])
  })
})

describe("export", () => {
  it("downloads everything as JSON without secrets or attachment bytes", async () => {
    const res = await call("GET", "/account/export", { cookie })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="agmx-export-\d{4}-\d{2}-\d{2}\.json"$/)
    const data = res.body
    expect(data.format).toBe("agmx-export")
    expect(data.profile.email).toBe(EMAIL)
    expect(data.agents.map((a: any) => a.name)).toContain("Scout")
    expect(data.agents.every((a: any) => !("webhookSecret" in a))).toBe(true)
    expect(data.inboxes.length).toBeGreaterThanOrEqual(1)
    expect(data.apiKeys.length).toBe(2)
    expect(data.apiKeys.every((k: any) => !("keyHash" in k) && typeof k.prefix === "string")).toBe(true)
    const message = data.messages.find((m: any) => m.subject === "Your receipt")
    expect(message.text).toContain("Thanks for your order")
    expect(data.attachments).toHaveLength(1)
    expect(data.attachments[0].filename).toBe("notes.txt")
    expect("content" in data.attachments[0]).toBe(false)
    expect("storageKey" in data.attachments[0]).toBe(false)
    expect(Array.isArray(data.usage)).toBe(true)
  })

  it("works with an account key but not an agent key", async () => {
    expect((await call("GET", "/account/export", { key: accountKey })).status).toBe(200)
    const denied = await call("GET", "/account/export", { key: agentKey })
    expect(denied.status).toBe(403)
    expect(denied.body._tag).toBe("Forbidden")
  })
})

describe("deletion", () => {
  it("refuses API keys, even account keys", async () => {
    for (const key of [accountKey, agentKey]) {
      const res = await call("DELETE", "/account", { key, body: { confirm: EMAIL } })
      expect(res.status).toBe(403)
    }
  })

  it("requires the exact account email", async () => {
    const res = await call("DELETE", "/account", { cookie, body: { confirm: "someone@else.com" } })
    expect(res.status).toBe(422)
    expect(res.body._tag).toBe("InvalidRequest")
  })

  it("removes every row and queues stored attachment files for deletion", async () => {
    // Simulate an attachment kept in object storage so the cascade trigger has a key to queue.
    const [msg] = await sql<{ id: string }[]>`select id from messages where user_id = ${userId} limit 1`
    await sql`insert into attachments (id, user_id, message_id, filename, content_type, size, storage_key)
              values ('att_s3', ${userId}, ${msg!.id}, 'big.pdf', 'application/pdf', 10, 'attachments/test/big.pdf')`

    const res = await call("DELETE", "/account", { cookie, body: { confirm: "  OWNER@example.com " } })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    // Session cookies are expired in the same response.
    expect(res.headers.getSetCookie().some((c) => /^agmx\.session_data=;.*Max-Age=0/.test(c))).toBe(true)

    for (const table of ["user", "session", "account", "agents", "inboxes", "threads", "messages", "attachments", "api_keys", "usage_daily", "inbox_rules"]) {
      const [row] = await sql.unsafe(`select count(*)::int as n from "${table}"`)
      expect({ table, n: row!.n }).toEqual({ table, n: 0 })
    }
    const queued = await sql<{ key: string }[]>`select key from storage_deletions`
    expect(queued.map((q) => q.key)).toContain("attachments/test/big.pdf")

    // The old session and keys no longer work.
    const sessionToken = cookie.split("; ").filter((c) => c.startsWith("agmx.session_token=")).join("; ")
    expect((await call("GET", "/me", { cookie: sessionToken })).status).toBe(401)
    expect((await call("GET", "/me", { key: accountKey })).status).toBe(401)
  })
})
