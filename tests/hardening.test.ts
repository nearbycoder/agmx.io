import { afterAll, beforeAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { Effect } from "effect"
import { senderAuthentication, withholdSensitive, withSenderAuth } from "~/server/mail/security"
import { pauseReason } from "~/server/services/Reputation"
import { callerKey, checkRequest, clientIp, hit, resetRateLimits, RULES } from "~/server/rate-limit"

/** Sender authentication, malware quarantine, per-agent reputation pauses and rate limiting. */
const url = process.env.DATABASE_URL!
let handler: (req: Request) => Promise<Response>
let sql: ReturnType<typeof postgres>
let ownerKey = ""
const ownerId = "usr_hardening"
let agent: { id: string; key: string; address: string }

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

const services = async () => {
  const [{ runtime }, { Mail }, { Agents }] = await Promise.all([import("~/server/runtime"), import("~/server/services/Mail"), import("~/server/services/Agents")])
  return { runtime, Mail, Agents }
}

const inject = async (
  to: string,
  verdicts: Record<string, string>,
  opts: { from?: string; subject?: string; text?: string; attachments?: Array<{ filename: string; contentType: string; content: Buffer }> } = {}
) => {
  const { composeMime } = await import("~/server/mail/compose")
  const raw = await composeMime({
    from: { name: "GitHub", address: opts.from ?? "noreply@github.com" },
    to: [{ name: null, address: to }],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: opts.subject ?? "Your code",
    text: opts.text ?? "Your verification code is 482913. Or sign in: https://github.com/login/verify?token=abc",
    html: null,
    messageId: `<${crypto.randomUUID()}@example.com>`,
    attachments: opts.attachments ?? []
  })
  const { runtime, Mail } = await services()
  return runtime.runPromise(Effect.flatMap(Effect.service(Mail), (m) => m.ingestRaw(raw, [to], verdicts)))
}

const latest = async (subject: string, folder = "inbox") => {
  const list = await call("GET", `/messages?folder=${folder}&q=${encodeURIComponent(subject)}`)
  return (await call("GET", `/messages/${list.body.messages[0].id}`)).body
}

beforeAll(async () => {
  sql = postgres(url, { max: 1, onnotice: () => {} })
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;")
  await migrate(drizzle(sql), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname })
  await sql`insert into "user" (id, name, email, plan) values (${ownerId}, 'Owner', 'owner@example.com', 'pro')`
  const [{ apiHandler }, { runtime, Agents }] = await Promise.all([import("~/server/http/web-handler"), services()])
  handler = (req) => apiHandler.handler(req)
  ownerKey = (await runtime.runPromise(Effect.flatMap(Effect.service(Agents), (a) => a.mintKey(ownerId, null, "test")))).key
  const created = await call("POST", "/agents", { name: "Herald", username: "herald", createApiKey: true })
  agent = { id: created.body.agent.id, key: created.body.apiKey, address: created.body.agent.inboxes[0].address }
})

afterAll(async () => {
  await sql.end()
  const { runtime } = await import("~/server/runtime")
  await runtime.dispose()
})

describe("sender authentication", () => {
  it("classifies verdicts", () => {
    expect(senderAuthentication({ dmarc: "PASS" })).toBe("verified")
    expect(senderAuthentication({ dmarc: "FAIL", spf: "PASS", dkim: "PASS" })).toBe("failed")
    expect(senderAuthentication({ spf: "FAIL", dkim: "FAIL", dmarc: "GRAY" })).toBe("failed")
    expect(senderAuthentication({ spf: "PASS", dkim: "GRAY", dmarc: "GRAY" })).toBe("unknown")
    expect(senderAuthentication({})).toBe("unknown")
    expect(senderAuthentication({}, true)).toBe("verified")
  })

  it("raises risk and withholds codes and sign-in links for forged senders", () => {
    const security = withSenderAuth({ risk: "low", score: 0, reasons: [], hiddenContent: false }, "failed")
    expect(security.risk).toBe("medium")
    expect(security.sender).toBe("failed")
    const kept = withholdSensitive({
      codes: ["482913"],
      links: [
        { url: "https://a/verify", kind: "verify" },
        { url: "https://a/unsub", kind: "unsubscribe" }
      ]
    })
    expect(kept.codes).toEqual([])
    expect(kept.links.map((l) => l.kind)).toEqual(["unsubscribe"])
  })

  it("stores the verdict on inbound mail and keeps codes only from verified senders", async () => {
    await inject(agent.address, { spf: "FAIL", dkim: "FAIL", dmarc: "FAIL", spam: "PASS", virus: "PASS" }, { subject: "Forged code" })
    const forged = await latest("Forged code")
    expect(forged.security.sender).toBe("failed")
    expect(forged.security.risk).not.toBe("low")
    expect(forged.extracted.codes).toEqual([])

    await inject(agent.address, { spf: "PASS", dkim: "PASS", dmarc: "PASS", spam: "PASS", virus: "PASS" }, { subject: "Real code" })
    const real = await latest("Real code")
    expect(real.security.sender).toBe("verified")
    expect(real.extracted.codes).toContain("482913")
  })

  it("marks mail between AGMX inboxes as verified", async () => {
    await call("POST", "/agents", { name: "Peer", username: "peer" })
    const sent = await call("POST", "/messages", { from: "peer@agmx.test", to: agent.address, subject: "Internal hello", text: "hi" })
    expect(sent.status).toBe(200)
    const received = await latest("Internal hello")
    expect(received.direction).toBe("inbound")
    expect(received.security.sender).toBe("verified")
  })
})

describe("malware quarantine", () => {
  it("keeps attachment names but never stores or serves the bytes", async () => {
    await inject(agent.address, { virus: "FAIL", spam: "PASS", dmarc: "PASS" }, {
      subject: "Invoice attached",
      attachments: [{ filename: "invoice.pdf.exe", contentType: "application/octet-stream", content: Buffer.from("MZ-not-really") }]
    })
    const message = await latest("Invoice attached", "spam")
    expect(message.isSpam).toBe(true)
    expect(message.security.risk).toBe("high")
    expect(message.attachments).toHaveLength(1)
    const [row] = await sql`select content, storage_key from attachments where id = ${message.attachments[0].id}`
    expect(row!.content).toBeNull()
    expect(row!.storage_key).toBeNull()
    const download = await call("GET", `/messages/${message.id}/attachments/${message.attachments[0].id}`)
    expect(download.status).toBe(404)
    expect(download.body.message).toMatch(/quarantined/)
  })
})

describe("sending reputation", () => {
  it("applies the thresholds", () => {
    expect(pauseReason({ sent: 0, bounced: 0, complained: 0 })).toBeNull()
    expect(pauseReason({ sent: 10, bounced: 4, complained: 0 })).toBeNull() // fewer than 5 bounces
    expect(pauseReason({ sent: 200, bounced: 5, complained: 0 })).toBeNull() // 2.5%
    expect(pauseReason({ sent: 100, bounced: 5, complained: 0 })).toMatch(/hard bounces/)
    expect(pauseReason({ sent: 3000, bounced: 0, complained: 2 })).toBeNull() // 0.07%
    expect(pauseReason({ sent: 500, bounced: 0, complained: 2 })).toMatch(/complaints/)
  })

  it("pauses an agent that keeps bouncing, blocks its sends and lets only a human resume", async () => {
    // Six external sends; the log transport hands back provider ids like SES would.
    for (let i = 0; i < 6; i++) {
      const r = await call("POST", "/messages", { from: agent.address, to: `nobody${i}@example.com`, subject: `Bulk ${i}`, text: "hi" }, agent.key)
      expect(r.status).toBe(200)
    }
    const rows = await sql`select provider_message_id from messages where subject like 'Bulk %' and provider_message_id is not null`
    expect(rows.length).toBe(6)

    const { runtime, Mail } = await services()
    for (const row of rows.slice(0, 5))
      await runtime.runPromise(
        Effect.flatMap(Effect.service(Mail), (m) => m.applyDeliveryEvent(row.provider_message_id, "bounced", "Permanent/General: user unknown"))
      )

    const reputation = await call("GET", `/agents/${agent.id}/reputation`, undefined, agent.key)
    expect(reputation.body.bounced).toBe(5)
    expect(reputation.body.sendingPaused?.reason).toMatch(/hard bounces/)

    const listed = await call("GET", `/agents/${agent.id}`)
    expect(listed.body.sendingPaused).not.toBeNull()

    const blocked = await call("POST", "/messages", { from: agent.address, to: "someone@example.com", subject: "Again", text: "hi" }, agent.key)
    expect(blocked.status).toBe(403)
    expect(blocked.body.message).toMatch(/Sending is paused/)

    // Receiving still works while sending is paused.
    expect((await inject(agent.address, { dmarc: "PASS" }, { subject: "Still receiving" })).delivered).toBe(1)

    const selfResume = await call("POST", `/agents/${agent.id}/sending/resume`, undefined, agent.key)
    expect(selfResume.status).toBe(403)

    const resumed = await call("POST", `/agents/${agent.id}/sending/resume`)
    expect(resumed.status).toBe(200)
    expect(resumed.body.sendingPaused).toBeNull()
    expect(resumed.body.bounced).toBe(0) // fresh window
    const ok = await call("POST", "/messages", { from: agent.address, to: "someone@example.com", subject: "After resume", text: "hi" }, agent.key)
    expect(ok.status).toBe(200)
  })

  it("lets a human pause sending manually", async () => {
    const paused = await call("POST", `/agents/${agent.id}/sending/pause`, { reason: "Investigating" })
    expect(paused.body.sendingPaused.reason).toBe("Investigating")
    await call("POST", `/agents/${agent.id}/sending/resume`)
  })
})

describe("rate limiting", () => {
  const req = (headers: Record<string, string>) => new Request("http://agmx.test/api/v1/me", { headers })

  it("identifies callers by key, session or the proxy-appended IP", () => {
    expect(clientIp(req({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9, 5.6.7.8" }))).toBe("1.2.3.4")
    expect(clientIp(req({ "x-forwarded-for": "9.9.9.9, 5.6.7.8" }))).toBe("5.6.7.8")
    expect(callerKey(req({ authorization: "Bearer agmx_x" })).authenticated).toBe(true)
    expect(callerKey(req({ cookie: "agmx.session_token=abc" })).authenticated).toBe(true)
    expect(callerKey(req({ "x-real-ip": "1.2.3.4" })).key).toBe("ip:1.2.3.4")
  })

  it("counts hits in a fixed window", () => {
    resetRateLimits()
    const rule = { name: "t", limit: 2, windowMs: 1000 }
    expect(hit(rule, "a", 0).ok).toBe(true)
    expect(hit(rule, "a", 10).ok).toBe(true)
    const third = hit(rule, "a", 20)
    expect(third.ok).toBe(false)
    expect(third.retryAfter).toBe(1)
    expect(hit(rule, "a", 1001).ok).toBe(true)
  })

  it("returns 429 with Retry-After once a sign-up budget is spent", async () => {
    resetRateLimits()
    const signup = () => new Request("http://agmx.test/api/v1/signup", { method: "POST", headers: { "x-real-ip": "7.7.7.7" } })
    for (let i = 0; i < RULES.signup.limit; i++) expect(checkRequest(signup(), { signup: true })).toBeNull()
    const limited = checkRequest(signup(), { signup: true })
    expect(limited?.status).toBe(429)
    expect(Number(limited?.headers.get("retry-after"))).toBeGreaterThan(0)
    expect((await limited!.json())._tag).toBe("RateLimited")
    resetRateLimits()
  })
})
