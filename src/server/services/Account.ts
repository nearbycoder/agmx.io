import { and, asc, desc, eq, getTableColumns, gte, inArray, sql } from "drizzle-orm"
import { Context, Effect, Layer, Schedule } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import type * as D from "~/shared/api/domain"
import { Forbidden, InvalidRequest, NotFound } from "~/shared/api/errors"
import { PLANS, getPlan, type Plan } from "~/shared/plans"
import {
  agentSignups,
  agents,
  apiKeys,
  attachments,
  domains,
  inboxRules,
  inboxes,
  messages,
  session,
  storageDeletions,
  threads,
  usageDaily,
  user,
  webhookDeliveries
} from "../db/schema"
import { env } from "../env"
import { newId, randomToken } from "../ids"
import { requireAccount, requireAdmin } from "./access"
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

export interface AccountExport {
  readonly format: "agmx-export"
  readonly version: 1
  readonly exportedAt: string
  readonly profile: Record<string, unknown>
  readonly agents: ReadonlyArray<Record<string, unknown>>
  readonly inboxes: ReadonlyArray<Record<string, unknown>>
  readonly rules: ReadonlyArray<Record<string, unknown>>
  readonly domains: ReadonlyArray<Record<string, unknown>>
  readonly apiKeys: ReadonlyArray<Record<string, unknown>>
  readonly threads: ReadonlyArray<Record<string, unknown>>
  readonly messages: ReadonlyArray<Record<string, unknown>>
  readonly attachments: ReadonlyArray<Record<string, unknown>>
  readonly usage: ReadonlyArray<Record<string, unknown>>
}

export class Account extends Context.Service<Account, {
  me(principal: Principal): Effect.Effect<typeof D.Me.Type>
  usage(principal: Principal, days: number): Effect.Effect<typeof D.UsageSeries.Type>
  adminUsers(principal: Principal): Effect.Effect<Array<typeof D.AdminUser.Type>, Forbidden>
  adminUpdateUser(principal: Principal, userId: string, patch: typeof D.UpdateAdminUserPayload.Type): Effect.Effect<typeof D.AdminUser.Type, Forbidden | NotFound>
  system(principal: Principal): Effect.Effect<typeof D.SystemStatus.Type, Forbidden>
  /** Everything stored for the account, minus secrets and attachment bytes. */
  exportData(principal: Principal): Effect.Effect<AccountExport, Forbidden>
  /** Permanently deletes the account and all of its data. Dashboard sessions only. */
  deleteAccount(principal: Principal, confirm: string): Effect.Effect<void, Forbidden | InvalidRequest>
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
          if (patch.role === "user" && userId === principal.userId)
            return yield* new Forbidden({ message: "You can't remove your own operator role. Ask another operator to do it." })
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
            inboundTopics: env.aws.inboundTopicArns.length,
            production: env.isProduction,
            allowedEmails: env.allowedEmails.length ? env.allowedEmails : ["* (open sign-ups)"],
            sesAccount: account._tag === "Success" ? account.success : null,
            sesError: account._tag === "Failure" ? account.failure.message : null
          }
        }),

        exportData: Effect.fn("Account.exportData")(function* (principal) {
          yield* requireAccount(principal, "export account data")
          const userId = principal.userId
          const [profile] = yield* db.use((d) =>
            d
              .select({ id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan, createdAt: user.createdAt })
              .from(user)
              .where(eq(user.id, userId))
          )
          // Secrets (webhook signing secrets, key hashes) and attachment bytes are deliberately left out.
          const { webhookSecret: _secret, ...agentColumns } = getTableColumns(agents)
          const { keyHash: _hash, ...keyColumns } = getTableColumns(apiKeys)
          const { content: _content, storageKey: _key, ...attachmentColumns } = getTableColumns(attachments)
          const [agentRows, inboxRows, ruleRows, domainRows, keyRows, threadRows, messageRows, attachmentRows, usageRows] = yield* Effect.all(
            [
              db.use((d) => d.select(agentColumns).from(agents).where(eq(agents.userId, userId)).orderBy(asc(agents.createdAt))),
              db.use((d) => d.select().from(inboxes).where(eq(inboxes.userId, userId)).orderBy(asc(inboxes.createdAt))),
              db.use((d) => d.select().from(inboxRules).where(eq(inboxRules.userId, userId)).orderBy(asc(inboxRules.inboxId), asc(inboxRules.position))),
              db.use((d) => d.select().from(domains).where(eq(domains.userId, userId)).orderBy(asc(domains.createdAt))),
              db.use((d) => d.select(keyColumns).from(apiKeys).where(eq(apiKeys.userId, userId)).orderBy(asc(apiKeys.createdAt))),
              db.use((d) => d.select().from(threads).where(eq(threads.userId, userId)).orderBy(asc(threads.createdAt))),
              db.use((d) => d.select().from(messages).where(eq(messages.userId, userId)).orderBy(asc(messages.createdAt))),
              db.use((d) => d.select(attachmentColumns).from(attachments).where(eq(attachments.userId, userId)).orderBy(asc(attachments.createdAt))),
              db.use((d) => d.select().from(usageDaily).where(eq(usageDaily.userId, userId)).orderBy(asc(usageDaily.day)))
            ],
            { concurrency: 3 }
          )
          return {
            format: "agmx-export",
            version: 1,
            exportedAt: new Date().toISOString(),
            profile: profile ?? { id: userId, email: principal.email },
            agents: agentRows,
            inboxes: inboxRows,
            rules: ruleRows,
            domains: domainRows,
            apiKeys: keyRows,
            threads: threadRows,
            messages: messageRows,
            attachments: attachmentRows,
            usage: usageRows
          } satisfies AccountExport
        }),

        deleteAccount: Effect.fn("Account.deleteAccount")(function* (principal, confirm) {
          if (principal.kind !== "session")
            return yield* new Forbidden({ message: "Only a signed-in human can delete an account. Use the dashboard: Settings → Your data." })
          const [row] = yield* db.use((d) => d.select({ email: user.email }).from(user).where(eq(user.id, principal.userId)))
          if (!row) return yield* new Forbidden({ message: "Account not found." })
          if (confirm.trim().toLowerCase() !== row.email.toLowerCase())
            return yield* new InvalidRequest({ message: "Type your account email exactly to confirm.", field: "confirm" })

          // Stop receiving and sending for custom domains before their rows go away.
          const domainRows = yield* db.use((d) => d.select({ name: domains.name }).from(domains).where(eq(domains.userId, principal.userId)))
          for (const domain of domainRows) {
            yield* transport.setReceiving(domain.name, false).pipe(
              Effect.catchCause((cause) => Effect.logWarning(`Could not stop receiving for ${domain.name}`, cause))
            )
            yield* transport.deleteDomainIdentity(domain.name).pipe(
              Effect.catchCause((cause) => Effect.logWarning(`Could not delete SES identity ${domain.name}`, cause))
            )
          }

          // Everything else cascades from the user row: agents, inboxes, mail, attachments (whose
          // object-storage keys are queued by a trigger), keys, usage, rules, sessions and logins.
          yield* db.transaction(
            Effect.gen(function* () {
              yield* db.use((d) => d.delete(session).where(eq(session.userId, principal.userId)))
              yield* db.use((d) => d.delete(user).where(eq(user.id, principal.userId)))
            })
          )
          yield* Effect.logInfo(`Deleted account ${principal.userId} (${domainRows.length} custom domain(s))`)
        })
      })
    })
  )

  /** Hourly housekeeping: plan retention, stale sign-up requests and the operator's role mailboxes. */
  static readonly maintenance = Layer.effectDiscard(
    Effect.gen(function* () {
      const db = yield* Db

      yield* ensureSystemInboxes(db).pipe(
        Effect.catchCause((cause) => Effect.logError("Could not ensure system inboxes", cause)),
        Effect.repeat(Schedule.spaced("1 hour")),
        Effect.delay("10 seconds"),
        Effect.forkScoped
      )
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
        // The dashboard shows an agent's last 50 webhook deliveries; finished ones older than a month are just weight.
        yield* db.use((d) =>
          d.delete(webhookDeliveries).where(sql`${webhookDeliveries.status} in ('success', 'failed') and ${webhookDeliveries.createdAt} < now() - interval '30 days'`)
        )
      })
      yield* tick.pipe(
        Effect.catchCause((cause) => Effect.logError("Maintenance tick failed", cause)),
        Effect.repeat(Schedule.spaced("1 hour")),
        Effect.delay("30 seconds"),
        Effect.forkScoped
      )

      // Temporary inboxes: delete expired ones (messages and attachments cascade).
      yield* db
        .use((d) => d.delete(inboxes).where(sql`${inboxes.expiresAt} is not null and ${inboxes.expiresAt} < now()`))
        .pipe(
          Effect.catchCause((cause) => Effect.logError("Temporary inbox cleanup failed", cause)),
          Effect.repeat(Schedule.spaced("1 minute")),
          Effect.delay("15 seconds"),
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


/**
 * RFC 2142 role mailboxes (abuse@, postmaster@, privacy@) on the operator domain, owned by the
 * first operator in an "Operator" agent so reports land in the dashboard like any other mail.
 * Idempotent: creates only what's missing and never touches existing inboxes.
 */
export const ensureSystemInboxes = Effect.fn("Account.ensureSystemInboxes")(function* (db: typeof Db.Service) {
  if (env.systemInboxes.length === 0 || env.adminEmails.length === 0) return
  const [owner] = yield* db.use((d) =>
    d
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, "admin"), inArray(sql`lower(${user.email})`, env.adminEmails)))
      .orderBy(asc(user.createdAt))
      .limit(1)
  )
  if (!owner) return
  const domain = env.contactDomain
  const wanted = env.systemInboxes.map((local) => `${local}@${domain}`)
  const existing = yield* db.use((d) => d.select({ address: inboxes.address }).from(inboxes).where(inArray(inboxes.address, wanted)))
  const missing = wanted.filter((address) => !existing.some((row) => row.address === address))
  if (missing.length === 0) return

  let [agent] = yield* db.use((d) =>
    d.select({ id: agents.id }).from(agents).where(and(eq(agents.userId, owner.id), eq(agents.name, SYSTEM_AGENT_NAME))).limit(1)
  )
  if (!agent) {
    ;[agent] = yield* db.use((d) =>
      d
        .insert(agents)
        .values({
          id: newId("agt"),
          userId: owner.id,
          name: SYSTEM_AGENT_NAME,
          description: "Role mailboxes for this AGMX instance (abuse, postmaster, privacy). Created automatically.",
          color: "slate",
          webhookSecret: `whsec_${randomToken(32)}`
        })
        .returning({ id: agents.id })
    )
  }
  for (const address of missing) {
    const localPart = address.slice(0, address.indexOf("@"))
    yield* db.use((d) =>
      d
        .insert(inboxes)
        .values({
          id: newId("inb"),
          userId: owner.id,
          agentId: agent!.id,
          localPart,
          domain,
          address,
          displayName: `${env.operatorName} ${localPart}`
        })
        .onConflictDoNothing({ target: inboxes.address })
    )
  }
  yield* Effect.logInfo(`Created system inboxes: ${missing.join(", ")}`)
})

const SYSTEM_AGENT_NAME = "Operator"
