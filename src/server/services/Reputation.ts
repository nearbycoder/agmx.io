import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { agents, inboxes, messages, user } from "../db/schema"
import { env } from "../env"
import { sendSystemEmail, buttonEmail } from "../system-mail"
import { Db } from "./Db"
import { MailTransport } from "./MailTransport"
import { Webhooks } from "./Webhooks"

/**
 * Sending reputation per agent.
 *
 * Every agent shares the operator's SES account. AWS puts an account under review at roughly a
 * 5% bounce rate or 0.1% complaint rate and can suspend it beyond that, so one misbehaving agent
 * could stop mail for everyone. When an agent crosses these thresholds its *sending* is paused
 * (receiving keeps working) until a human resumes it, which also starts a fresh measuring window.
 */
export const REPUTATION = {
  windowDays: 30,
  /** Pause when at least `minBounces` hard bounces make up `bounceRate` or more of sends. */
  minBounces: 5,
  bounceRate: 0.05,
  /** Pause when at least `minComplaints` complaints make up `complaintRate` or more of sends. */
  minComplaints: 2,
  complaintRate: 0.001
} as const

export interface ReputationStats {
  since: Date
  sent: number
  bounced: number
  complained: number
  bounceRate: number
  complaintRate: number
}

/** Pure threshold check, exported for tests. Returns why sending should pause, or null. */
export const pauseReason = (s: Pick<ReputationStats, "sent" | "bounced" | "complained">): string | null => {
  if (s.sent === 0) return null
  const pct = (n: number) => `${(n * 100).toFixed(n < 0.01 ? 2 : 1)}%`
  if (s.complained >= REPUTATION.minComplaints && s.complained / s.sent >= REPUTATION.complaintRate)
    return `${s.complained} spam complaints in ${s.sent} sends (${pct(s.complained / s.sent)}). Recipients are marking this agent's mail as spam.`
  if (s.bounced >= REPUTATION.minBounces && s.bounced / s.sent >= REPUTATION.bounceRate)
    return `${s.bounced} hard bounces in ${s.sent} sends (${pct(s.bounced / s.sent)}). This agent is mailing addresses that don't exist.`
  return null
}

export class Reputation extends Context.Service<Reputation, {
  stats(agentId: string): Effect.Effect<ReputationStats>
  /** Re-check an agent after a bounce or complaint; pauses sending when over the thresholds. */
  evaluate(agentId: string): Effect.Effect<{ paused: boolean }>
  pause(agentId: string, reason: string, by: "system" | "human"): Effect.Effect<void>
  resume(agentId: string): Effect.Effect<void>
}>()("agmx/services/Reputation") {
  static readonly layer = Layer.effect(
    Reputation,
    Effect.gen(function* () {
      const db = yield* Db
      const webhooks = yield* Webhooks
      const transport = yield* MailTransport

      const stats = Effect.fn("Reputation.stats")(function* (agentId: string) {
        const [agent] = yield* db.use((d) => d.select({ since: agents.reputationSince }).from(agents).where(eq(agents.id, agentId)))
        const windowStart = new Date(Date.now() - REPUTATION.windowDays * 86_400_000)
        const since = agent?.since && agent.since > windowStart ? agent.since : windowStart
        const [row] = yield* db.use((d) =>
          d
            .select({
              sent: sql<number>`count(*)::int`,
              bounced: sql<number>`count(*) filter (where ${messages.status} = 'bounced' and ${messages.error} like 'Permanent/%')::int`,
              complained: sql<number>`count(*) filter (where ${messages.status} = 'complained')::int`
            })
            .from(messages)
            .innerJoin(inboxes, eq(inboxes.id, messages.inboxId))
            .where(
              and(
                eq(inboxes.agentId, agentId),
                eq(messages.direction, "outbound"),
                // Only mail that actually left through SES counts; internal AGMX deliveries can't bounce.
                isNotNull(messages.providerMessageId),
                inArray(messages.status, ["sent", "delivered", "bounced", "complained"]),
                gte(messages.createdAt, since)
              )
            )
        )
        const sent = row?.sent ?? 0
        const bounced = row?.bounced ?? 0
        const complained = row?.complained ?? 0
        return {
          since,
          sent,
          bounced,
          complained,
          bounceRate: sent ? bounced / sent : 0,
          complaintRate: sent ? complained / sent : 0
        } satisfies ReputationStats
      })

      const notifyOwner = (agentId: string, name: string, reason: string) =>
        Effect.gen(function* () {
          const [owner] = yield* db.use((d) =>
            d.select({ email: user.email }).from(agents).innerJoin(user, eq(user.id, agents.userId)).where(eq(agents.id, agentId))
          )
          if (!owner) return
          yield* sendSystemEmail({
            to: owner.email,
            subject: `Sending paused for ${name}`,
            ...buttonEmail({
              heading: `We paused sending for ${name}`,
              body: `${reason} To protect delivery for every agent, AGMX paused this agent's outgoing mail. It can still receive mail. Check what it's been sending, fix the cause (usually a bad address list or unwanted mail), then resume sending from the agent page.`,
              cta: "Review agent",
              url: `${env.appUrl}/app/agents/${agentId}`,
              footer: "You're receiving this because you own this agent on AGMX."
            })
          }).pipe(Effect.provideService(MailTransport, transport), Effect.catchCause((cause) => Effect.logWarning("Could not send pause notice", cause)))
        })

      const pause = Effect.fn("Reputation.pause")(function* (agentId: string, reason: string, by: "system" | "human") {
        const [row] = yield* db.use((d) =>
          d
            .update(agents)
            .set({ sendingPausedAt: new Date(), sendingPausedReason: reason.slice(0, 500), updatedAt: new Date() })
            .where(and(eq(agents.id, agentId), sql`${agents.sendingPausedAt} is null`))
            .returning({ name: agents.name })
        )
        if (!row) return // already paused
        yield* webhooks.enqueue(agentId, "agent.sending_paused", { agentId, reason, by })
        yield* Effect.logWarning(`Sending paused for agent ${agentId} (${by}): ${reason}`)
        if (by === "system") yield* notifyOwner(agentId, row.name, reason)
      })

      return Reputation.of({
        stats,
        evaluate: Effect.fn("Reputation.evaluate")(function* (agentId: string) {
          const [agent] = yield* db.use((d) => d.select({ pausedAt: agents.sendingPausedAt }).from(agents).where(eq(agents.id, agentId)))
          if (!agent || agent.pausedAt) return { paused: Boolean(agent?.pausedAt) }
          const reason = pauseReason(yield* stats(agentId))
          if (!reason) return { paused: false }
          yield* pause(agentId, reason, "system")
          return { paused: true }
        }),
        pause,
        resume: Effect.fn("Reputation.resume")(function* (agentId: string) {
          const [row] = yield* db.use((d) =>
            d
              .update(agents)
              .set({ sendingPausedAt: null, sendingPausedReason: null, reputationSince: new Date(), updatedAt: new Date() })
              .where(and(eq(agents.id, agentId), sql`${agents.sendingPausedAt} is not null`))
              .returning({ id: agents.id })
          )
          if (row) yield* webhooks.enqueue(agentId, "agent.sending_resumed", { agentId })
        })
      })
    })
  )
}
