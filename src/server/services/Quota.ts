import { and, count, eq, gte, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import { QuotaExceeded } from "~/shared/api/errors"
import { getPlan, type Plan } from "~/shared/plans"
import { agents, domains, inboxes, usageDaily, user } from "../db/schema"
import { Db } from "./Db"

export const utcDay = (date = new Date()) => date.toISOString().slice(0, 10)
export const utcMonthStart = (date = new Date()) => `${date.toISOString().slice(0, 7)}-01`

export interface SendUsage {
  readonly sentToday: number
  readonly sentThisMonth: number
  readonly receivedThisMonth: number
}

/**
 * Plan enforcement. Every check reads the plan fresh from the database so
 * upgrades apply instantly, and send reservations take a per-account advisory
 * lock so concurrent sends can't overshoot the quota.
 */
export class Quota extends Context.Service<Quota, {
  planFor(userId: string): Effect.Effect<Plan>
  usage(userId: string): Effect.Effect<SendUsage>
  checkAgents(userId: string): Effect.Effect<void, QuotaExceeded>
  checkInboxes(userId: string, agentId: string): Effect.Effect<void, QuotaExceeded>
  checkDomains(userId: string): Effect.Effect<void, QuotaExceeded>
  checkMessageSize(userId: string, bytes: number): Effect.Effect<void, QuotaExceeded>
  /** Must run inside a transaction. Reserves `recipients` sends or fails. */
  reserveSends(userId: string, recipients: number): Effect.Effect<void, QuotaExceeded>
  refundSends(userId: string, recipients: number): Effect.Effect<void>
  recordReceived(userId: string, count: number): Effect.Effect<void>
}>()("agmx/services/Quota") {
  static readonly layer = Layer.effect(
    Quota,
    Effect.gen(function* () {
      const db = yield* Db

      const planFor = (userId: string) =>
        db
          .use((d) => d.select({ plan: user.plan }).from(user).where(eq(user.id, userId)).limit(1))
          .pipe(Effect.map((rows) => getPlan(rows[0]?.plan)))

      const usage = (userId: string) =>
        db
          .use((d) =>
            d
              .select({
                sentToday: sql<number>`coalesce(sum(case when ${usageDaily.day} = ${utcDay()} then ${usageDaily.sent} else 0 end), 0)::int`,
                sentThisMonth: sql<number>`coalesce(sum(${usageDaily.sent}), 0)::int`,
                receivedThisMonth: sql<number>`coalesce(sum(${usageDaily.received}), 0)::int`
              })
              .from(usageDaily)
              .where(and(eq(usageDaily.userId, userId), gte(usageDaily.day, utcMonthStart())))
          )
          .pipe(Effect.map((rows) => rows[0] ?? { sentToday: 0, sentThisMonth: 0, receivedThisMonth: 0 }))

      const exceeded = (limit: QuotaExceeded["limit"], max: number, used: number, message: string) =>
        Effect.fail(new QuotaExceeded({ limit, max, used, message }))

      return Quota.of({
        planFor,
        usage,

        checkAgents: Effect.fn("Quota.checkAgents")(function* (userId) {
          const plan = yield* planFor(userId)
          if (plan.maxAgents === null) return
          const [row] = yield* db.use((d) => d.select({ n: count() }).from(agents).where(eq(agents.userId, userId)))
          const used = row?.n ?? 0
          if (used >= plan.maxAgents)
            return yield* exceeded("agents", plan.maxAgents, used, `The ${plan.name} plan allows ${plan.maxAgents} agents. Upgrade to add more.`)
        }),

        checkInboxes: Effect.fn("Quota.checkInboxes")(function* (userId, agentId) {
          const plan = yield* planFor(userId)
          if (plan.inboxesPerAgent === null) return
          const [row] = yield* db.use((d) => d.select({ n: count() }).from(inboxes).where(eq(inboxes.agentId, agentId)))
          const used = row?.n ?? 0
          if (used >= plan.inboxesPerAgent)
            return yield* exceeded(
              "inboxes_per_agent",
              plan.inboxesPerAgent,
              used,
              `The ${plan.name} plan allows ${plan.inboxesPerAgent} inbox${plan.inboxesPerAgent === 1 ? "" : "es"} per agent.`
            )
        }),

        checkDomains: Effect.fn("Quota.checkDomains")(function* (userId) {
          const plan = yield* planFor(userId)
          if (plan.customDomains === null) return
          const [row] = yield* db.use((d) => d.select({ n: count() }).from(domains).where(eq(domains.userId, userId)))
          const used = row?.n ?? 0
          if (used >= plan.customDomains)
            return yield* exceeded(
              "custom_domains",
              plan.customDomains,
              used,
              plan.customDomains === 0
                ? `Custom domains are not included in the ${plan.name} plan.`
                : `The ${plan.name} plan allows ${plan.customDomains} custom domains.`
            )
        }),

        checkMessageSize: Effect.fn("Quota.checkMessageSize")(function* (userId, bytes) {
          const plan = yield* planFor(userId)
          const max = plan.maxMessageMb * 1024 * 1024
          if (bytes > max)
            return yield* exceeded("message_size", max, bytes, `Messages on the ${plan.name} plan can be at most ${plan.maxMessageMb} MB.`)
        }),

        reserveSends: Effect.fn("Quota.reserveSends")(function* (userId, recipients) {
          yield* db.use((d) => d.execute(sql`select pg_advisory_xact_lock(hashtext(${`sends:${userId}`}))`))
          const plan = yield* planFor(userId)
          const current = yield* usage(userId)
          if (plan.dailySends !== null && current.sentToday + recipients > plan.dailySends)
            return yield* exceeded(
              "daily_sends",
              plan.dailySends,
              current.sentToday,
              `Daily send limit reached (${plan.dailySends.toLocaleString()} on ${plan.name}). Resets at 00:00 UTC.`
            )
          if (plan.monthlySends !== null && current.sentThisMonth + recipients > plan.monthlySends)
            return yield* exceeded(
              "monthly_sends",
              plan.monthlySends,
              current.sentThisMonth,
              `Monthly send limit reached (${plan.monthlySends.toLocaleString()} on ${plan.name}). Upgrade or wait for the next month.`
            )
          yield* db.use((d) =>
            d
              .insert(usageDaily)
              .values({ userId, day: utcDay(), sent: recipients })
              .onConflictDoUpdate({ target: [usageDaily.userId, usageDaily.day], set: { sent: sql`${usageDaily.sent} + ${recipients}` } })
          )
        }),

        refundSends: (userId, recipients) =>
          db
            .use((d) =>
              d
                .update(usageDaily)
                .set({ sent: sql`greatest(${usageDaily.sent} - ${recipients}, 0)` })
                .where(and(eq(usageDaily.userId, userId), eq(usageDaily.day, utcDay())))
            )
            .pipe(Effect.asVoid),

        recordReceived: (userId, n) =>
          db
            .use((d) =>
              d
                .insert(usageDaily)
                .values({ userId, day: utcDay(), received: n })
                .onConflictDoUpdate({ target: [usageDaily.userId, usageDaily.day], set: { received: sql`${usageDaily.received} + ${n}` } })
            )
            .pipe(Effect.asVoid)
      })
    })
  )
}
