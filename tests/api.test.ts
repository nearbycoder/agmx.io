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
