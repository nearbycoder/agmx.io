import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import type * as D from "~/shared/api/domain"
import { Conflict, Forbidden, InvalidRequest, NotFound, QuotaExceeded } from "~/shared/api/errors"
import { isValidEmail, normalizeUsername, RESERVED_USERNAMES, USERNAME_RE } from "~/shared/address"
import { agents, apiKeys, domains, inboxes, inboxRules, messages, user } from "../db/schema"
import type { AgentRow, InboxRow, InboxRuleRow } from "../db/types"
import { env, isSystemAddress } from "../env"
import { newId, randomToken, sha256 } from "../ids"
import { toAgent, toInbox, type InboxStats } from "../serialize"
import { canAccessAgent, requireAccount } from "./access"
import { Db } from "./Db"
import { Quota } from "./Quota"

const ADJECTIVES = ["swift", "quiet", "bright", "clever", "brave", "lucid", "nimble", "steady", "keen", "calm", "bold", "witty", "sunny", "cosmic", "amber", "silver", "neon", "polar", "rapid", "zesty"]
const NOUNS = ["otter", "falcon", "lynx", "heron", "fox", "badger", "orca", "raven", "gecko", "panda", "koala", "wren", "bison", "manta", "puffin", "tapir", "ibis", "yak", "newt", "owl"]

const randomUsername = () => {
  const pick = <T,>(list: ReadonlyArray<T>) => list[Math.floor(Math.random() * list.length)]!
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${Math.floor(1000 + Math.random() * 9000)}`
}

const validateWebhookUrl = (url: string | null | undefined) => {
  if (url === undefined || url === null || url.trim() === "") return Effect.succeed(url === undefined ? undefined : null)
  try {
    const parsed = new URL(url.trim())
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("bad protocol")
    if (env.isProduction && parsed.protocol !== "https:")
      return Effect.fail(new InvalidRequest({ message: "Webhook URLs must use https.", field: "webhookUrl" }))
    return Effect.succeed(parsed.toString())
  } catch {
    return Effect.fail(new InvalidRequest({ message: "Webhook URL is not a valid URL.", field: "webhookUrl" }))
  }
}

export interface CreateInboxInput {
  agentId: string
  username?: string | undefined
  domain?: string | undefined
  displayName?: string | null | undefined
  expiresIn?: number | undefined
  maxMessages?: number | undefined
  acceptFrom?: ReadonlyArray<string> | undefined
}

const MAX_TEMPORARY_PER_AGENT = 10
const MIN_TTL = 60
const MAX_TTL = 7 * 86_400

const toRule = (row: InboxRuleRow): typeof D.InboxRule.Type => ({
  id: row.id,
  inboxId: row.inboxId,
  position: row.position,
  field: row.field,
  value: row.value,
  action: row.action,
  target: row.target,
  enabled: row.enabled,
  createdAt: row.createdAt.toISOString()
})

const validateRule = (principal: Principal, rule: { field: string; value: string; action: string; target?: string | null | undefined }) => {
  const value = rule.value.trim().toLowerCase()
  if (rule.field === "sender" && !value.includes("@"))
    return Effect.fail(new InvalidRequest({ message: "Sender rules need a full address, e.g. noreply@github.com. Use a domain rule for github.com.", field: "value" }))
  if (rule.field === "domain" && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(value.replace(/^@/, "")))
    return Effect.fail(new InvalidRequest({ message: "Domain rules need a domain such as github.com.", field: "value" }))
  if ((rule.action === "forward" || rule.action === "webhook") && principal.kind === "agent_key")
    return Effect.fail(new InvalidRequest({ message: "Forward and webhook rules can only be created by a human or an account key.", field: "action" }))
  const target = rule.target?.trim() || null
  if (rule.action === "label" && !target) return Effect.fail(new InvalidRequest({ message: "Label rules need a label name in `target`.", field: "target" }))
  if (rule.action === "forward" && !(target && isValidEmail(target)))
    return Effect.fail(new InvalidRequest({ message: "Forward rules need an email address in `target`.", field: "target" }))
  if (rule.action === "webhook") {
    try {
      const url = new URL(target ?? "")
      if (!["http:", "https:"].includes(url.protocol) || (env.isProduction && url.protocol !== "https:")) throw new Error("protocol")
    } catch {
      return Effect.fail(new InvalidRequest({ message: "Webhook rules need an https URL in `target`.", field: "target" }))
    }
  }
  return Effect.succeed({
    value: rule.field === "domain" ? value.replace(/^@/, "") : rule.field === "subject" ? rule.value.trim() : value,
    target: rule.action === "label" ? target!.toLowerCase().slice(0, 40) : target
  })
}

export class Agents extends Context.Service<Agents, {
  list(principal: Principal): Effect.Effect<Array<typeof D.Agent.Type>>
  get(principal: Principal, agentId: string): Effect.Effect<typeof D.AgentWithSecret.Type, NotFound>
  create(
    principal: Principal,
    input: typeof D.CreateAgentPayload.Type
  ): Effect.Effect<typeof D.CreateAgentResult.Type, QuotaExceeded | Conflict | InvalidRequest | Forbidden>
  /** Creates an agent on behalf of a user, bypassing principal checks (used by sign-up approval). */
  createForUser(
    userId: string,
    input: typeof D.CreateAgentPayload.Type,
    options?: { createInbox?: boolean }
  ): Effect.Effect<{ agent: AgentRow; inbox: InboxRow | null }, QuotaExceeded | Conflict | InvalidRequest>
  update(principal: Principal, agentId: string, input: typeof D.UpdateAgentPayload.Type): Effect.Effect<typeof D.Agent.Type, NotFound | InvalidRequest | Forbidden>
  remove(principal: Principal, agentId: string): Effect.Effect<void, NotFound | Forbidden>
  rotateWebhookSecret(principal: Principal, agentId: string): Effect.Effect<typeof D.AgentWithSecret.Type, NotFound>
  requireAgent(principal: Principal, agentId: string): Effect.Effect<AgentRow, NotFound>

  listInboxes(principal: Principal, agentId?: string): Effect.Effect<Array<typeof D.Inbox.Type>>
  getInbox(principal: Principal, inboxId: string): Effect.Effect<typeof D.Inbox.Type, NotFound>
  requireInbox(principal: Principal, idOrAddress: string): Effect.Effect<InboxRow, NotFound>
  createInbox(
    principal: Principal,
    input: typeof D.CreateInboxPayload.Type
  ): Effect.Effect<typeof D.Inbox.Type, QuotaExceeded | Conflict | InvalidRequest | NotFound | Forbidden>
  createInboxForUser(userId: string, input: CreateInboxInput): Effect.Effect<InboxRow, QuotaExceeded | Conflict | InvalidRequest>
  updateInbox(principal: Principal, inboxId: string, input: typeof D.UpdateInboxPayload.Type): Effect.Effect<typeof D.Inbox.Type, NotFound | Forbidden>
  removeInbox(principal: Principal, inboxId: string): Effect.Effect<void, NotFound>

  listKeys(principal: Principal): Effect.Effect<Array<typeof D.ApiKey.Type>, Forbidden>
  createKey(principal: Principal, input: typeof D.CreateApiKeyPayload.Type): Effect.Effect<typeof D.CreatedApiKey.Type, NotFound | Forbidden>
  mintKey(userId: string, agentId: string | null, name: string): Effect.Effect<{ id: string; key: string }>
  revokeKey(principal: Principal, keyId: string): Effect.Effect<void, NotFound | Forbidden>
  listRules(principal: Principal, inboxId: string): Effect.Effect<Array<typeof D.InboxRule.Type>, NotFound>
  createRule(principal: Principal, inboxId: string, input: typeof D.CreateRulePayload.Type): Effect.Effect<typeof D.InboxRule.Type, NotFound | InvalidRequest>
  updateRule(principal: Principal, ruleId: string, input: typeof D.UpdateRulePayload.Type): Effect.Effect<typeof D.InboxRule.Type, NotFound | InvalidRequest>
  deleteRule(principal: Principal, ruleId: string): Effect.Effect<void, NotFound>
  /** Resolve a bearer API key to a principal. */
  authenticate(key: string): Effect.Effect<Principal | null>
}>()("agmx/services/Agents") {
  static readonly layer = Layer.effect(
    Agents,
    Effect.gen(function* () {
      const db = yield* Db
      const quota = yield* Quota

      const inboxStats = (ids: ReadonlyArray<string>) =>
        ids.length === 0
          ? Effect.succeed(new Map<string, InboxStats>())
          : db
              .use((d) =>
                d
                  .select({
                    inboxId: messages.inboxId,
                    messageCount: count(),
                    unreadCount: sql<number>`count(*) filter (where ${messages.isRead} = false and ${messages.direction} = 'inbound' and ${messages.isArchived} = false and ${messages.isSpam} = false)::int`
                  })
                  .from(messages)
                  .where(inArray(messages.inboxId, [...ids]))
                  .groupBy(messages.inboxId)
              )
              .pipe(Effect.map((rows) => new Map(rows.map((r) => [r.inboxId, { messageCount: r.messageCount, unreadCount: r.unreadCount }]))))

      const serializeInboxes = (rows: ReadonlyArray<InboxRow>) =>
        inboxStats(rows.map((r) => r.id)).pipe(Effect.map((stats) => rows.map((row) => toInbox(row, stats.get(row.id)))))

      const loadAgents = (principal: Principal, agentId?: string) =>
        Effect.gen(function* () {
          const scopeId = principal.agentId ?? agentId
          const rows = yield* db.use((d) =>
            d
              .select()
              .from(agents)
              .where(and(eq(agents.userId, principal.userId), scopeId ? eq(agents.id, scopeId) : undefined))
              .orderBy(desc(agents.createdAt))
          )
          const inboxRows = rows.length
            ? yield* db.use((d) =>
                d
                  .select()
                  .from(inboxes)
                  .where(inArray(inboxes.agentId, rows.map((r) => r.id)))
                  .orderBy(inboxes.createdAt)
              )
            : []
          const serialized = yield* serializeInboxes(inboxRows)
          const loaded = rows.map((row) => ({ row, agent: toAgent(row, serialized.filter((i) => i.agentId === row.id)) }))
          // The operator's role mailboxes (abuse@, postmaster@…) sort after the agents people actually work with,
          // so they never become the default sender or the first thing in a list.
          const roleOnly = (a: (typeof loaded)[number]) => a.agent.inboxes.length > 0 && a.agent.inboxes.every((i) => isSystemAddress(i.address))
          return [...loaded.filter((a) => !roleOnly(a)), ...loaded.filter(roleOnly)]
        })

      const requireAgent = (principal: Principal, agentId: string) =>
        Effect.gen(function* () {
          if (!canAccessAgent(principal, agentId)) return yield* new NotFound({ message: "Agent not found.", resource: "agent" })
          const [row] = yield* db.use((d) =>
            d.select().from(agents).where(and(eq(agents.id, agentId), eq(agents.userId, principal.userId))).limit(1)
          )
          if (!row) return yield* new NotFound({ message: "Agent not found.", resource: "agent" })
          return row
        })

      const getAgent = (principal: Principal, agentId: string) =>
        Effect.gen(function* () {
          yield* requireAgent(principal, agentId)
          const [loaded] = yield* loadAgents(principal, agentId)
          if (!loaded) return yield* new NotFound({ message: "Agent not found.", resource: "agent" })
          return { ...loaded.agent, webhookSecret: loaded.row.webhookSecret }
        })

      const resolveDomain = Effect.fn("Agents.resolveDomain")(function* (userId: string, requested: string | undefined) {
        const domain = (requested ?? env.mailDomain).trim().toLowerCase()
        if (domain === env.mailDomain) return { domain, domainId: null as string | null }
        if (domain === env.operatorDomain) {
          const [owner] = yield* db.use((d) => d.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1))
          if (owner?.role !== "admin")
            return yield* new InvalidRequest({ message: `Only operators can create inboxes on ${domain}. Use @${env.mailDomain} instead.`, field: "domain" })
          return { domain, domainId: null as string | null }
        }
        const [row] = yield* db.use((d) =>
          d.select().from(domains).where(and(eq(domains.name, domain), eq(domains.userId, userId))).limit(1)
        )
        if (!row) return yield* new InvalidRequest({ message: `Domain ${domain} is not connected to this account.`, field: "domain" })
        if (row.status !== "verified")
          return yield* new InvalidRequest({ message: `Domain ${domain} is not verified yet. Publish its DNS records first.`, field: "domain" })
        return { domain, domainId: row.id as string | null }
      })

      const createInboxForUser = Effect.fn("Agents.createInboxForUser")(function* (
        userId: string,
        input: CreateInboxInput
      ): Effect.fn.Return<InboxRow, QuotaExceeded | Conflict | InvalidRequest> {
        const temporary = input.expiresIn !== undefined
        if (temporary) {
          if (!Number.isInteger(input.expiresIn) || input.expiresIn! < MIN_TTL || input.expiresIn! > MAX_TTL)
            return yield* new InvalidRequest({ message: `expiresIn must be between ${MIN_TTL} seconds and ${MAX_TTL / 86_400} days.`, field: "expiresIn" })
          const [row] = yield* db.use((d) =>
            d
              .select({ n: count() })
              .from(inboxes)
              .where(and(eq(inboxes.agentId, input.agentId), sql`${inboxes.expiresAt} is not null and ${inboxes.expiresAt} > now()`))
          )
          if ((row?.n ?? 0) >= MAX_TEMPORARY_PER_AGENT)
            return yield* new QuotaExceeded({
              limit: "inboxes_per_agent",
              max: MAX_TEMPORARY_PER_AGENT,
              used: row?.n ?? 0,
              message: `An agent can have at most ${MAX_TEMPORARY_PER_AGENT} temporary inboxes at once.`
            })
        } else {
          yield* quota.checkInboxes(userId, input.agentId)
        }
        if (input.maxMessages !== undefined && (!Number.isInteger(input.maxMessages) || input.maxMessages < 1 || input.maxMessages > 10_000))
          return yield* new InvalidRequest({ message: "maxMessages must be between 1 and 10,000.", field: "maxMessages" })
        const acceptFrom = (input.acceptFrom ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean)
        for (const sender of acceptFrom) {
          if (!sender.includes("@") && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(sender.replace(/^@/, "")))
            return yield* new InvalidRequest({ message: `"${sender}" isn't an address or domain.`, field: "acceptFrom" })
        }
        const { domain, domainId } = yield* resolveDomain(userId, input.domain)
        const explicit = input.username !== undefined && input.username.trim() !== ""
        const localPart = explicit ? normalizeUsername(input.username!) : temporary ? `tmp-${randomUsername()}` : randomUsername()
        if (!USERNAME_RE.test(localPart))
          return yield* new InvalidRequest({
            message: "Usernames may contain lowercase letters, numbers, dots, dashes and underscores (max 64 characters).",
            field: "username"
          })
        if (localPart.includes("+")) return yield* new InvalidRequest({ message: "Usernames cannot contain '+'.", field: "username" })
        if (domain === env.mailDomain && (RESERVED_USERNAMES.has(localPart) || localPart.length < 3))
          return yield* new InvalidRequest({
            message: localPart.length < 3 ? "Usernames must be at least 3 characters." : `"${localPart}" is reserved.`,
            field: "username"
          })
        const address = `${localPart}@${domain}`
        const inserted = yield* db.useUnique((d) =>
          d
            .insert(inboxes)
            .values({
              id: newId("inb"),
              userId,
              agentId: input.agentId,
              domainId,
              localPart,
              domain,
              address,
              displayName: input.displayName ?? null,
              expiresAt: temporary ? new Date(Date.now() + input.expiresIn! * 1000) : null,
              maxMessages: input.maxMessages ?? null
            })
            .returning()
        )
        if (inserted === null) {
          if (!explicit) return yield* createInboxForUser(userId, input)
          return yield* new Conflict({ message: `${address} is already taken. Try another username.` })
        }
        const inbox = inserted[0]!
        if (acceptFrom.length) {
          yield* db.use((d) =>
            d.insert(inboxRules).values(
              acceptFrom.map((sender, position) => ({
                id: newId("rul"),
                userId,
                inboxId: inbox.id,
                position,
                field: sender.includes("@") ? ("sender" as const) : ("domain" as const),
                value: sender.replace(/^@/, ""),
                action: "allow" as const
              }))
            )
          )
        }
        return inbox
      })

      const createForUser = Effect.fn("Agents.createForUser")(function* (
        userId: string,
        input: typeof D.CreateAgentPayload.Type,
        options?: { createInbox?: boolean }
      ) {
        yield* quota.checkAgents(userId)
        const webhookUrl = yield* validateWebhookUrl(input.webhookUrl)
        return yield* db.transaction(
          Effect.gen(function* () {
            const [agent] = yield* db.use((d) =>
              d
                .insert(agents)
                .values({
                  id: newId("agt"),
                  userId,
                  name: input.name.trim(),
                  description: input.description?.trim() || null,
                  color: input.color ?? "lime",
                  webhookUrl: webhookUrl ?? null,
                  webhookSecret: `whsec_${randomToken(32)}`,
                  sendPolicy: input.sendPolicy ?? "auto",
                  approveAttachments: input.approveAttachments ?? false
                })
                .returning()
            )
            const inbox =
              options?.createInbox || input.username !== undefined || input.domain !== undefined || input.createApiKey
                ? yield* createInboxForUser(userId, { agentId: agent!.id, username: input.username, domain: input.domain, displayName: input.name })
                : null
            return { agent: agent!, inbox }
          })
        )
      })

      const mintKey = (userId: string, agentId: string | null, name: string) =>
        Effect.gen(function* () {
          const secret = `agmx_${agentId ? "agt" : "acc"}_${randomToken(40)}`
          const id = newId("key")
          yield* db.use((d) =>
            d.insert(apiKeys).values({ id, userId, agentId, name, prefix: `${secret.slice(0, 13)}…${secret.slice(-4)}`, keyHash: sha256(secret) })
          )
          return { id, key: secret }
        })

      const requireInbox = (principal: Principal, idOrAddress: string) =>
        Effect.gen(function* () {
          const key = idOrAddress.trim().toLowerCase()
          const [row] = yield* db.use((d) =>
            d
              .select()
              .from(inboxes)
              .where(and(eq(inboxes.userId, principal.userId), key.includes("@") ? eq(inboxes.address, key) : eq(inboxes.id, idOrAddress.trim())))
              .limit(1)
          )
          if (!row || !canAccessAgent(principal, row.agentId)) return yield* new NotFound({ message: "Inbox not found.", resource: "inbox" })
          return row
        })

      const toKey = (row: typeof apiKeys.$inferSelect, agentName: string | null): typeof D.ApiKey.Type => ({
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        agentId: row.agentId,
        agentName,
        scope: row.agentId ? "agent" : "account",
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString()
      })

      return Agents.of({
        list: (principal) => loadAgents(principal).pipe(Effect.map((rows) => rows.map((r) => r.agent))),
        get: getAgent,
        requireAgent,
        createForUser,

        create: Effect.fn("Agents.create")(function* (principal, input) {
          yield* requireAccount(principal, "create agents")
          const { agent, inbox } = yield* createForUser(principal.userId, input)
          const apiKey = input.createApiKey ? (yield* mintKey(principal.userId, agent.id, `${agent.name} key`)).key : null
          const serializedInboxes = inbox ? yield* serializeInboxes([inbox]) : []
          return { agent: toAgent(agent, serializedInboxes), apiKey }
        }),

        update: Effect.fn("Agents.update")(function* (principal, agentId, input) {
          const current = yield* requireAgent(principal, agentId)
          if (principal.kind === "agent_key" && (input.sendPolicy !== undefined || input.approveAttachments !== undefined))
            return yield* new Forbidden({ message: "An agent can't change its own send policy. Ask a human to update it in the dashboard." })
          // Pausing is a human's off switch: an agent may pause itself but never undo a pause.
          if (principal.kind === "agent_key" && input.status === "active" && current.status !== "active")
            return yield* new Forbidden({ message: "This agent is paused. Only a human can resume it, from the AGMX dashboard." })
          const webhookUrl = yield* validateWebhookUrl(input.webhookUrl)
          const patch: Partial<typeof agents.$inferInsert> = {}
          if (input.sendPolicy !== undefined) patch.sendPolicy = input.sendPolicy
          if (input.approveAttachments !== undefined) patch.approveAttachments = input.approveAttachments
          if (input.name !== undefined) patch.name = input.name.trim()
          if (input.description !== undefined) patch.description = input.description?.trim() || null
          if (input.color !== undefined) patch.color = input.color
          if (input.status !== undefined) patch.status = input.status
          if (webhookUrl !== undefined) patch.webhookUrl = webhookUrl
          if (Object.keys(patch).length) yield* db.use((d) => d.update(agents).set(patch).where(eq(agents.id, agentId)))
          const { webhookSecret: _secret, ...agent } = yield* getAgent(principal, agentId)
          return agent
        }),

        remove: Effect.fn("Agents.remove")(function* (principal, agentId) {
          yield* requireAccount(principal, "delete agents")
          yield* requireAgent(principal, agentId)
          yield* db.use((d) => d.delete(agents).where(eq(agents.id, agentId)))
        }),

        rotateWebhookSecret: Effect.fn("Agents.rotateWebhookSecret")(function* (principal, agentId) {
          yield* requireAgent(principal, agentId)
          yield* db.use((d) => d.update(agents).set({ webhookSecret: `whsec_${randomToken(32)}` }).where(eq(agents.id, agentId)))
          return yield* getAgent(principal, agentId)
        }),

        listInboxes: (principal, agentId) =>
          Effect.gen(function* () {
            const scopeId = principal.agentId ?? agentId
            const rows = yield* db.use((d) =>
              d
                .select()
                .from(inboxes)
                .where(and(eq(inboxes.userId, principal.userId), scopeId ? eq(inboxes.agentId, scopeId) : undefined))
                .orderBy(inboxes.createdAt)
            )
            return yield* serializeInboxes(rows)
          }),

        getInbox: (principal, inboxId) =>
          requireInbox(principal, inboxId).pipe(
            Effect.flatMap((row) => serializeInboxes([row])),
            Effect.map((rows) => rows[0]!)
          ),
        requireInbox,

        createInbox: Effect.fn("Agents.createInbox")(function* (principal, input) {
          const agentId = principal.agentId ?? input.agentId
          if (!agentId) return yield* new InvalidRequest({ message: "agentId is required.", field: "agentId" })
          yield* requireAgent(principal, agentId)
          const row = yield* createInboxForUser(principal.userId, {
            agentId,
            username: input.username,
            domain: input.domain,
            displayName: input.displayName,
            expiresIn: input.expiresIn,
            maxMessages: input.maxMessages,
            acceptFrom: input.acceptFrom
          })
          return toInbox(row)
        }),
        createInboxForUser,

        updateInbox: Effect.fn("Agents.updateInbox")(function* (principal, inboxId, input) {
          const row = yield* requireInbox(principal, inboxId)
          if (principal.kind === "agent_key" && input.status === "active" && row.status !== "active")
            return yield* new Forbidden({ message: "This inbox is paused or closed. Only a human can reopen it, from the AGMX dashboard." })
          const patch: Partial<typeof inboxes.$inferInsert> = {}
          if (input.displayName !== undefined) patch.displayName = input.displayName?.trim() || null
          if (input.status !== undefined) patch.status = input.status
          if (Object.keys(patch).length) yield* db.use((d) => d.update(inboxes).set(patch).where(eq(inboxes.id, row.id)))
          const [updated] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, row.id)))
          return (yield* serializeInboxes([updated!]))[0]!
        }),

        removeInbox: Effect.fn("Agents.removeInbox")(function* (principal, inboxId) {
          const row = yield* requireInbox(principal, inboxId)
          yield* db.use((d) => d.delete(inboxes).where(eq(inboxes.id, row.id)))
        }),

        listKeys: Effect.fn("Agents.listKeys")(function* (principal) {
          yield* requireAccount(principal, "manage API keys")
          const rows = yield* db.use((d) =>
            d
              .select({ key: apiKeys, agentName: agents.name })
              .from(apiKeys)
              .leftJoin(agents, eq(agents.id, apiKeys.agentId))
              .where(and(eq(apiKeys.userId, principal.userId), isNull(apiKeys.revokedAt)))
              .orderBy(desc(apiKeys.createdAt))
          )
          return rows.map((r) => toKey(r.key, r.agentName))
        }),

        createKey: Effect.fn("Agents.createKey")(function* (principal, input) {
          yield* requireAccount(principal, "manage API keys")
          const agent = input.agentId ? yield* requireAgent(principal, input.agentId) : null
          const { id, key } = yield* mintKey(principal.userId, agent?.id ?? null, input.name.trim())
          const [row] = yield* db.use((d) => d.select().from(apiKeys).where(eq(apiKeys.id, id)))
          return { apiKey: toKey(row!, agent?.name ?? null), key }
        }),
        mintKey,

        revokeKey: Effect.fn("Agents.revokeKey")(function* (principal, keyId) {
          yield* requireAccount(principal, "manage API keys")
          const result = yield* db.use((d) =>
            d
              .update(apiKeys)
              .set({ revokedAt: new Date() })
              .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, principal.userId), isNull(apiKeys.revokedAt)))
              .returning({ id: apiKeys.id })
          )
          if (result.length === 0) return yield* new NotFound({ message: "API key not found.", resource: "api_key" })
        }),

        listRules: Effect.fn("Agents.listRules")(function* (principal, inboxId) {
          const inbox = yield* requireInbox(principal, inboxId)
          const rows = yield* db.use((d) => d.select().from(inboxRules).where(eq(inboxRules.inboxId, inbox.id)).orderBy(inboxRules.position, inboxRules.createdAt))
          return rows.map(toRule)
        }),

        createRule: Effect.fn("Agents.createRule")(function* (principal, inboxId, input) {
          const inbox = yield* requireInbox(principal, inboxId)
          const [existing] = yield* db.use((d) => d.select({ n: count() }).from(inboxRules).where(eq(inboxRules.inboxId, inbox.id)))
          if ((existing?.n ?? 0) >= 50) return yield* new InvalidRequest({ message: "An inbox can have at most 50 rules." })
          const clean = yield* validateRule(principal, input)
          const [row] = yield* db.use((d) =>
            d
              .insert(inboxRules)
              .values({
                id: newId("rul"),
                userId: inbox.userId,
                inboxId: inbox.id,
                position: input.position ?? existing?.n ?? 0,
                field: input.field,
                value: clean.value,
                action: input.action,
                target: clean.target,
                enabled: input.enabled ?? true
              })
              .returning()
          )
          return toRule(row!)
        }),

        updateRule: Effect.fn("Agents.updateRule")(function* (principal, ruleId, input) {
          const [current] = yield* db.use((d) => d.select().from(inboxRules).where(and(eq(inboxRules.id, ruleId), eq(inboxRules.userId, principal.userId))).limit(1))
          if (!current) return yield* new NotFound({ message: "Rule not found.", resource: "rule" })
          yield* requireInbox(principal, current.inboxId)
          const merged = {
            field: input.field ?? current.field,
            value: input.value ?? current.value,
            action: input.action ?? current.action,
            target: input.target !== undefined ? input.target : current.target
          }
          const clean = yield* validateRule(principal, merged)
          const [row] = yield* db.use((d) =>
            d
              .update(inboxRules)
              .set({
                field: merged.field,
                value: clean.value,
                action: merged.action,
                target: clean.target,
                ...(input.position !== undefined ? { position: input.position } : {}),
                ...(input.enabled !== undefined ? { enabled: input.enabled } : {})
              })
              .where(eq(inboxRules.id, ruleId))
              .returning()
          )
          return toRule(row!)
        }),

        deleteRule: Effect.fn("Agents.deleteRule")(function* (principal, ruleId) {
          const [current] = yield* db.use((d) => d.select().from(inboxRules).where(and(eq(inboxRules.id, ruleId), eq(inboxRules.userId, principal.userId))).limit(1))
          if (!current) return yield* new NotFound({ message: "Rule not found.", resource: "rule" })
          yield* requireInbox(principal, current.inboxId)
          yield* db.use((d) => d.delete(inboxRules).where(eq(inboxRules.id, ruleId)))
        }),

        authenticate: (key) =>
          Effect.gen(function* () {
            if (!key.startsWith("agmx_")) return null
            const [row] = yield* db.use((d) =>
              d
                .select({ key: apiKeys, user: { email: user.email, role: user.role, plan: user.plan }, agentStatus: agents.status })
                .from(apiKeys)
                .innerJoin(user, eq(user.id, apiKeys.userId))
                .leftJoin(agents, eq(agents.id, apiKeys.agentId))
                .where(and(eq(apiKeys.keyHash, sha256(key)), isNull(apiKeys.revokedAt)))
                .limit(1)
            )
            if (!row) return null
            // Touch last-used at most once a minute to avoid write amplification.
            if (!row.key.lastUsedAt || Date.now() - row.key.lastUsedAt.getTime() > 60_000) {
              yield* db.use((d) => d.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.key.id)))
            }
            return {
              userId: row.key.userId,
              email: row.user.email,
              role: row.user.role,
              plan: row.user.plan,
              kind: row.key.agentId ? "agent_key" : "account_key",
              agentId: row.key.agentId,
              apiKeyId: row.key.id
            } satisfies Principal
          })
      })
    })
  )
}
