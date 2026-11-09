import { createHmac } from "node:crypto"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schedule } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import type * as D from "~/shared/api/domain"
import { InvalidRequest, NotFound } from "~/shared/api/errors"
import { agents, webhookDeliveries } from "../db/schema"
import type { WebhookDeliveryRow } from "../db/types"
import { env } from "../env"
import { newId } from "../ids"
import { toWebhookDelivery } from "../serialize"
import { Agents } from "./Agents"
import { Db } from "./Db"

export type WebhookEvent =
  | "message.received"
  | "message.sent"
  | "message.bounced"
  | "message.complained"
  | "message.delivered"
  | "message.held"
  | "message.approved"
  | "message.rejected"
  | "agent.sending_paused"
  | "agent.sending_resumed"
  | "webhook.test"

const MAX_ATTEMPTS = 8

export const isPrivateAddress = (address: string) => {
  // IPv4 written inside IPv6 (::ffff:10.0.0.1) is judged as the IPv4 address it is.
  const ip = address.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, "")
  return (
    /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|2[3-5]\d\.)/.test(ip) ||
    /^(::1?$|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:|ff[0-9a-f]{2}:|::ffff:)/i.test(ip)
  )
}

/** Blocks webhook delivery to loopback, private and link-local (cloud metadata) addresses in production. */
const assertPublicTarget = async (url: string) => {
  if (!env.isProduction) return
  const { hostname } = new URL(url)
  const host = hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address)
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) throw new Error("Webhook URL resolves to a private or reserved address")
}
const backoffSeconds = (attempt: number) => Math.min(30 * 2 ** (attempt - 1), 6 * 60 * 60)

/** `t=<unix>,v1=<hex hmac-sha256 of "t.body">` — same scheme as Stripe, easy to verify. */
export const signPayload = (secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) =>
  `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`

export class Webhooks extends Context.Service<Webhooks, {
  /** Queue an event for the agent's webhook, or for `url` instead (inbox webhook rules). */
  enqueue(agentId: string, event: WebhookEvent, data: unknown, url?: string): Effect.Effect<void>
  test(principal: Principal, agentId: string): Effect.Effect<typeof D.WebhookDelivery.Type, NotFound | InvalidRequest>
  list(principal: Principal, agentId: string): Effect.Effect<Array<typeof D.WebhookDelivery.Type>, NotFound>
  /** Deliver everything that's due. Safe to run concurrently across instances. */
  readonly processDue: Effect.Effect<number>
}>()("agmx/services/Webhooks") {
  static readonly layer = Layer.effect(
    Webhooks,
    Effect.gen(function* () {
      const db = yield* Db
      const agentsService = yield* Agents

      const attempt = Effect.fn("Webhooks.attempt")(function* (delivery: WebhookDeliveryRow) {
        const [agent] = yield* db.use((d) => d.select().from(agents).where(eq(agents.id, delivery.agentId)).limit(1))
        if (!agent) return
        const body = JSON.stringify(delivery.payload)
        const attempts = delivery.attempts + 1
        const result = yield* Effect.tryPromise({
          try: async (signal) => {
            await assertPublicTarget(delivery.url)
            const response = await fetch(delivery.url, {
              redirect: "manual",
              method: "POST",
              headers: {
                "content-type": "application/json",
                "user-agent": "AGMX-Webhooks/1.0",
                "x-agmx-event": delivery.event,
                "x-agmx-delivery": delivery.id,
                "x-agmx-signature": signPayload(agent.webhookSecret, body)
              },
              body,
              signal
            })
            const text = await response.text().catch(() => "")
            return { status: response.status, ok: response.ok, text: text.slice(0, 500) }
          },
          catch: (cause) => (cause instanceof Error ? cause.message : String(cause))
        }).pipe(
          Effect.timeoutOrElse({ duration: "10 seconds", orElse: () => Effect.fail("Timed out after 10s") }),
          Effect.result
        )

        const now = new Date()
        if (result._tag === "Success" && result.success.ok) {
          yield* db.use((d) =>
            d
              .update(webhookDeliveries)
              .set({ status: "success", attempts, responseStatus: result.success.status, lastError: null, deliveredAt: now })
              .where(eq(webhookDeliveries.id, delivery.id))
          )
          return
        }
        const error = result._tag === "Success" ? `HTTP ${result.success.status}: ${result.success.text}` : result.failure
        const giveUp = attempts >= MAX_ATTEMPTS || delivery.event === "webhook.test"
        yield* db.use((d) =>
          d
            .update(webhookDeliveries)
            .set({
              status: giveUp ? "failed" : "pending",
              attempts,
              responseStatus: result._tag === "Success" ? result.success.status : null,
              lastError: error.slice(0, 500),
              nextAttemptAt: new Date(now.getTime() + backoffSeconds(attempts) * 1000)
            })
            .where(eq(webhookDeliveries.id, delivery.id))
        )
      })

      const processDue = Effect.gen(function* () {
        // Claim a batch by pushing its next attempt out (a lease), so other
        // instances skip it while we deliver.
        const claimed = yield* db.transaction(
          db.use(async (d) => {
            const due = await d
              .select({ id: webhookDeliveries.id })
              .from(webhookDeliveries)
              .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, new Date())))
              .orderBy(webhookDeliveries.nextAttemptAt)
              .limit(25)
              .for("update", { skipLocked: true })
            if (due.length === 0) return []
            return d
              .update(webhookDeliveries)
              .set({ nextAttemptAt: sql`now() + interval '2 minutes'` })
              .where(inArray(webhookDeliveries.id, due.map((r) => r.id)))
              .returning()
          })
        )
        yield* Effect.forEach(claimed, attempt, { concurrency: 8, discard: true })
        return claimed.length
      })

      return Webhooks.of({
        enqueue: (agentId, event, data, urlOverride) =>
          Effect.gen(function* () {
            const [row] = yield* db.use((d) =>
              d.select({ url: agents.webhookUrl, userId: agents.userId, status: agents.status }).from(agents).where(eq(agents.id, agentId)).limit(1)
            )
            if (!row) return
            const agent = { ...row, url: urlOverride ?? row.url }
            if (!agent.url) return
            const id = newId("evt")
            yield* db.use((d) =>
              d.insert(webhookDeliveries).values({
                id,
                userId: agent.userId,
                agentId,
                event,
                url: agent.url!,
                payload: { id, type: event, createdAt: new Date().toISOString(), agentId, data }
              })
            )
          }),

        test: Effect.fn("Webhooks.test")(function* (principal, agentId) {
          const agent = yield* agentsService.requireAgent(principal, agentId)
          if (!agent.webhookUrl) return yield* new InvalidRequest({ message: "Set a webhook URL on this agent first.", field: "webhookUrl" })
          const id = newId("evt")
          const [row] = yield* db.use((d) =>
            d
              .insert(webhookDeliveries)
              .values({
                id,
                userId: agent.userId,
                agentId,
                event: "webhook.test",
                url: agent.webhookUrl!,
                payload: {
                  id,
                  type: "webhook.test",
                  createdAt: new Date().toISOString(),
                  agentId,
                  data: { message: "Hello from AGMX! Your webhook endpoint is wired up correctly." }
                }
              })
              .returning()
          )
          yield* attempt(row!)
          const [updated] = yield* db.use((d) => d.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id)))
          return toWebhookDelivery(updated!)
        }),

        list: Effect.fn("Webhooks.list")(function* (principal, agentId) {
          yield* agentsService.requireAgent(principal, agentId)
          const rows = yield* db.use((d) =>
            d.select().from(webhookDeliveries).where(eq(webhookDeliveries.agentId, agentId)).orderBy(desc(webhookDeliveries.createdAt)).limit(50)
          )
          return rows.map(toWebhookDelivery)
        }),

        processDue
      })
    })
  )

  /** Background worker that drains the delivery queue every few seconds. */
  static readonly worker = Layer.effectDiscard(
    Effect.gen(function* () {
      const webhooks = yield* Webhooks
      yield* webhooks.processDue.pipe(
        Effect.catchCause((cause) => Effect.logError("Webhook worker tick failed", cause)),
        Effect.repeat(Schedule.spaced("3 seconds")),
        Effect.forkScoped
      )
    })
  )
}
