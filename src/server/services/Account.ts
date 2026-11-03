import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schedule } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import type * as D from "~/shared/api/domain"
import { Forbidden, NotFound } from "~/shared/api/errors"
import { PLANS, getPlan, type Plan } from "~/shared/plans"
import { agentSignups, agents, domains, inboxes, messages, storageDeletions, threads, usageDaily, user } from "../db/schema"
import { env } from "../env"
import { requireAdmin } from "./access"
import { Db } from "./Db"
import { MailTransport } from "./MailTransport"
import { Storage } from "./Storage"
import { Quota, utcMonthStart } from "./Quota"

const planLimits = (plan: Plan): typeof D.PlanLimits.Type => ({
  id: plan.id,
  name: plan.name,
  priceMonthly: plan.priceMonthly,
  maxAgents: plan.maxAgents,
  inboxesPerAgent: plan.inboxesPerAgent,
  monthlySends: plan.monthlySends,
  dailySends: plan.dailySends,
  monthlyReceives: plan.monthlyReceives,
  maxInboundMb: plan.maxInboundMb,
  customDomains: plan.customDomains,
  retentionDays: plan.retentionDays,
  maxMessageMb: plan.maxMessageMb
})

export class Account extends Context.Service<Account, {
  me(principal: Principal): Effect.Effect<typeof D.Me.Type>
  usage(principal: Principal, days: number): Effect.Effect<typeof D.UsageSeries.Type>
  adminUsers(principal: Principal): Effect.Effect<Array<typeof D.AdminUser.Type>, Forbidden>
  adminUpdateUser(principal: Principal, userId: string, patch: typeof D.UpdateAdminUserPayload.Type): Effect.Effect<typeof D.AdminUser.Type, Forbidden | NotFound>
  system(principal: Principal): Effect.Effect<typeof D.SystemStatus.Type, Forbidden>
}>()("agmx/services/Account") {
  static readonly layer = Layer.effect(
    Account,
    Effect.gen(function* () {
      const db = yield* Db
      const quota = yield* Quota
      const transport = yield* MailTransport

      const adminRows = (userId?: string) =>
        db.use((d) =>
          d
            .select({
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              plan: user.plan,
              createdAt: user.createdAt,
              agents: sql<number>`(select count(*)::int from ${agents} where ${agents.userId} = "user"."id")`,
              inboxes: sql<number>`(select count(*)::int from ${inboxes} where ${inboxes.userId} = "user"."id")`,
              sentThisMonth: sql<number>`(select coalesce(sum(${usageDaily.sent}), 0)::int from ${usageDaily} where ${usageDaily.userId} = "user"."id" and ${usageDaily.day} >= ${utcMonthStart()})`
            })
            .from(user)
            .where(userId ? eq(user.id, userId) : undefined)
            .orderBy(desc(user.createdAt))
            .limit(500)
        )

      const toAdminUser = (row: {
        id: string
        email: string
        name: string
        role: string
        plan: string
        createdAt: Date
        agents: number
        inboxes: number
        sentThisMonth: number
      }): typeof D.AdminUser.Type => ({
        ...row,
        createdAt: row.createdAt.toISOString()
      })

      return Account.of({
        me: Effect.fn("Account.me")(function* (principal) {
          const [row] = yield* db.use((d) => d.select().from(user).where(eq(user.id, principal.userId)).limit(1))
          const plan = getPlan(row?.plan)
          const usage = yield* quota.usage(principal.userId)
          const scopeAgent = principal.agentId
          const [counts] = yield* db.use((d) =>
            d
              .select({
                agents: sql<number>`(select count(*)::int from ${agents} where ${agents.userId} = ${principal.userId} ${scopeAgent ? sql`and ${agents.id} = ${scopeAgent}` : sql``})`,
                inboxes: sql<number>`(select count(*)::int from ${inboxes} where ${inboxes.userId} = ${principal.userId} ${scopeAgent ? sql`and ${inboxes.agentId} = ${scopeAgent}` : sql``})`,
                domains: sql<number>`(select count(*)::int from ${domains} where ${domains.userId} = ${principal.userId})`,
                messagesStored: sql<number>`(select count(*)::int from ${messages} where ${messages.userId} = ${principal.userId})`
              })
              .from(sql`(select 1) as one`)
          )
          return {
            user: {
              id: principal.userId,
              email: row?.email ?? principal.email,
              name: row?.name ?? "",
              role: row?.role ?? "user",
              image: row?.image ?? null,
              createdAt: (row?.createdAt ?? new Date()).toISOString()
            },
            auth: { kind: principal.kind, agentId: principal.agentId },
            plan: planLimits(plan),
            usage: {
              agents: counts?.agents ?? 0,
              inboxes: counts?.inboxes ?? 0,
              domains: counts?.domains ?? 0,
              sentToday: usage.sentToday,
              sentThisMonth: usage.sentThisMonth,
              receivedThisMonth: usage.receivedThisMonth,
              droppedThisMonth: usage.droppedThisMonth,
              messagesStored: counts?.messagesStored ?? 0
            },
            mailDomain: env.mailDomain,
            operatorDomain: row?.role === "admin" && principal.kind !== "agent_key" ? env.operatorDomain : null,
            sendingEnabled: transport.name === "ses",
            devTools: env.devInbound
          }
        }),

        usage: Effect.fn("Account.usage")(function* (principal, days) {
          const span = Math.min(Math.max(days, 1), 365)
          const start = new Date(Date.now() - (span - 1) * 86_400_000)
          const startDay = start.toISOString().slice(0, 10)
          const rows = yield* db.use((d) =>
            d
              .select()
              .from(usageDaily)
              .where(and(eq(usageDaily.userId, principal.userId), gte(usageDaily.day, startDay)))
          )
          const byDay = new Map(rows.map((r) => [r.day, r]))
          const series = Array.from({ length: span }, (_, i) => {
            const day = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)
            const row = byDay.get(day)
            return { day, sent: row?.sent ?? 0, received: row?.received ?? 0 }
          })
          return { days: series }
        }),

        adminUsers: Effect.fn("Account.adminUsers")(function* (principal) {
          yield* requireAdmin(principal)
          return (yield* adminRows()).map(toAdminUser)
        }),

        adminUpdateUser: Effect.fn("Account.adminUpdateUser")(function* (principal, userId, patch) {
          yield* requireAdmin(principal)
          const set: Partial<typeof user.$inferInsert> = {}
          if (patch.plan) set.plan = patch.plan
          if (patch.role) set.role = patch.role
          if (Object.keys(set).length) yield* db.use((d) => d.update(user).set(set).where(eq(user.id, userId)))
          const [row] = yield* adminRows(userId)
          if (!row) return yield* new NotFound({ message: "User not found.", resource: "user" })
          return toAdminUser(row)
        }),

        system: Effect.fn("Account.system")(function* (principal) {
          yield* requireAdmin(principal)
          const account = yield* transport.account().pipe(Effect.result)
          return {
            mailTransport: transport.name,
            mailDomain: env.mailDomain,
            awsRegion: env.aws.region,
            sesConfigured: transport.name === "ses",
            inboundWebhookUrl: `${env.appUrl}/api/inbound/ses`,
            allowedEmails: env.allowedEmails.length ? env.allowedEmails : ["* (open sign-ups)"],
            sesAccount: account._tag === "Success" ? account.success : null,
            sesError: account._tag === "Failure" ? account.failure.message : null
          }
        })
      })
    })
  )

  /** Hourly housekeeping: plan retention and stale sign-up requests. */
  static readonly maintenance = Layer.effectDiscard(
    Effect.gen(function* () {
      const db = yield* Db
      const tick = Effect.gen(function* () {
        for (const plan of Object.values(PLANS)) {
          if (plan.retentionDays === null) continue
          const cutoff = new Date(Date.now() - plan.retentionDays * 86_400_000)
          yield* db.use((d) =>
            d.execute(sql`
              delete from ${threads} t using ${user} u
              where t.user_id = u.id and u.plan = ${plan.id} and t.last_message_at < ${cutoff.toISOString()}::timestamptz
            `)
          )
        }
        yield* db.use((d) =>
          d.delete(agentSignups).where(sql`${agentSignups.expiresAt} < now() - interval '7 days' and ${agentSignups.status} in ('pending', 'denied')`)
        )
      })
      yield* tick.pipe(
        Effect.catchCause((cause) => Effect.logError("Maintenance tick failed", cause)),
        Effect.repeat(Schedule.spaced("1 hour")),
        Effect.delay("30 seconds"),
        Effect.forkScoped
      )

      // Delete object-storage files for attachments removed from the database (queued by a trigger).
      const storage = yield* Storage
      const drain = Effect.gen(function* () {
        while (true) {
          const batch = yield* db.use((d) => d.select({ key: storageDeletions.key }).from(storageDeletions).limit(500))
          if (batch.length === 0) return
          const keys = batch.map((b) => b.key)
          yield* storage.remove(keys)
          yield* db.use((d) => d.delete(storageDeletions).where(inArray(storageDeletions.key, keys)))
          if (batch.length < 500) return
        }
      })
      if (storage.driver === "s3") {
        yield* drain.pipe(
          Effect.catchCause((cause) => Effect.logError("Storage cleanup failed", cause)),
          Effect.repeat(Schedule.spaced("1 minute")),
          Effect.delay("20 seconds"),
          Effect.forkScoped
        )
      }
    })
  )
}

