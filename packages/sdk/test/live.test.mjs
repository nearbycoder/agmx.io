// End-to-end test against a running AGMX server.
//   AGMX_API_KEY=agmx_acc_… AGMX_BASE_URL=http://localhost:3100 node --test test/
// Needs an account key and a server with ENABLE_DEV_INBOUND (any non-production server).
import assert from "node:assert/strict"
import { test } from "node:test"
import { Agmx, AgmxError } from "../dist/index.js"

const baseUrl = process.env.AGMX_BASE_URL ?? "http://localhost:3100"
const apiKey = process.env.AGMX_API_KEY
const skip = !apiKey && "set AGMX_API_KEY to run live tests"
const agmx = apiKey ? new Agmx({ apiKey, baseUrl }) : null
const inject = (body) => fetch(`${baseUrl}/api/dev/inbound`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const suffix = Date.now().toString(36)

test("me and typed errors", { skip }, async () => {
  const me = await agmx.me()
  assert.equal(me.auth.kind, "account_key")
  await assert.rejects(agmx.messages.get("msg_nope"), (e) => e instanceof AgmxError && e.tag === "NotFound" && e.status === 404)
  await assert.rejects(new Agmx({ apiKey: "agmx_acc_bad", baseUrl }).me(), (e) => e.tag === "Unauthorized")
})

test("agents, temp inbox, rules, send, wait for code", { skip }, async () => {
  const { agent, apiKey: agentKey } = await agmx.agents.create({ name: `SDK ${suffix}`, username: `sdk-${suffix}`, createApiKey: true })
  assert.ok(agentKey?.startsWith("agmx_agt_"))
  const bot = new Agmx({ apiKey: agentKey, baseUrl })
  const tmp = await bot.inboxes.create({ expiresIn: 600, maxMessages: 2, acceptFrom: ["github.com"] })
  assert.equal(tmp.temporary, true)
  const rules = await bot.rules.list(tmp.id)
  assert.equal(rules[0].action, "allow")

  const waiting = bot.waitForCode({ inboxId: tmp.id, timeout: 20 })
  await new Promise((r) => setTimeout(r, 300))
  await inject({ from: "GitHub <noreply@github.com>", to: tmp.address, subject: "Your code", text: "Your verification code is 482913" })
  const got = await waiting
  assert.equal(got?.code, "482913")
  assert.equal(got?.message.security?.risk, "low")

  const payload = { from: agent.inboxes[0].address, to: tmp.address, subject: "Idem", text: "once" }
  const a = await bot.messages.send({ ...payload, idempotencyKey: `k-${suffix}` })
  const b = await bot.messages.send({ ...payload, idempotencyKey: `k-${suffix}` })
  assert.equal(a.id, b.id)
  await agmx.agents.delete(agent.id)
})

test("drafts, scheduling and approvals", { skip }, async () => {
  const { agent, apiKey: agentKey } = await agmx.agents.create({ name: `Policy ${suffix}`, username: `policy-${suffix}`, createApiKey: true, sendPolicy: "all" })
  const bot = new Agmx({ apiKey: agentKey, baseUrl })
  const from = agent.inboxes[0].address
  const draft = await bot.drafts.create({ from, subject: "Draft" })
  await bot.drafts.update(draft.id, { to: "nobody@example.com", text: "hello" })
  const held = await bot.drafts.send(draft.id)
  assert.equal(held.status, "pending_approval")
  assert.ok((await agmx.approvals.list()).some((m) => m.id === held.id))
  const rejected = await agmx.approvals.reject(held.id, { reason: "test" })
  assert.equal(rejected.status, "rejected")

  await agmx.agents.update(agent.id, { sendPolicy: "auto" })
  const scheduled = await bot.messages.send({ from, to: "nobody@example.com", subject: "Later", text: "x", sendAt: new Date(Date.now() + 3600_000).toISOString() })
  assert.equal(scheduled.status, "scheduled")
  assert.equal((await bot.messages.cancel(scheduled.id)).status, "draft")
  await agmx.agents.delete(agent.id)
})
