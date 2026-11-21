import { and, desc, eq, gt, sql } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import type * as D from "~/shared/api/domain"
import { Conflict, Forbidden, InvalidRequest, NotFound, QuotaExceeded, Unauthorized } from "~/shared/api/errors"
import { agentSignups, inboxes } from "../db/schema"
import type { SignupRow } from "../db/types"
import { env } from "../env"
import { newId, randomToken, safeEqual, sha256, userCode } from "../ids"
import { toInbox } from "../serialize"
import { requireAccount } from "./access"
import { Agents } from "./Agents"
import { Db } from "./Db"

const SIGNUP_TTL_MS = 30 * 60 * 1000

const toPending = (row: SignupRow): typeof D.PendingSignup.Type => ({
  id: row.id,
  userCode: row.userCode,
  agentName: row.agentName,
  description: row.description,
  requestedUsername: row.requestedUsername,
  ownerEmail: row.ownerEmail,
  status: row.status === "pending" && row.expiresAt.getTime() < Date.now() ? "expired" : row.status,
  clientIp: row.clientIp,
  userAgent: row.userAgent,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString()
})

/**
 * Device-style sign-up for agents: an agent asks for an inbox without any
 * credentials, its human approves the request in the dashboard, and the agent
 * picks up a freshly minted, agent-scoped API key by polling.
 */
export class Signups extends Context.Service<Signups, {
  start(input: typeof D.StartSignupPayload.Type, meta: { ip: string | null; userAgent: string | null }): Effect.Effect<typeof D.StartSignupResult.Type, Forbidden | InvalidRequest>
  poll(signupId: string, token: string): Effect.Effect<typeof D.SignupStatus.Type, NotFound | Unauthorized>
  list(principal: Principal): Effect.Effect<Array<typeof D.PendingSignup.Type>, Forbidden>
  get(principal: Principal, code: string): Effect.Effect<typeof D.PendingSignup.Type, NotFound | Forbidden>
  approve(principal: Principal, code: string, input: typeof D.ApproveSignupPayload.Type): Effect.Effect<typeof D.Agent.Type, NotFound | Forbidden | Conflict | QuotaExceeded | InvalidRequest>
  deny(principal: Principal, code: string): Effect.Effect<void, NotFound | Forbidden>
}>()("agmx/services/Signups") {
  static readonly layer = Layer.effect(
    Signups,
    Effect.gen(function* () {
      const db = yield* Db
      const agents = yield* Agents

      const byCode = (code: string) =>
        db
          .use((d) =>
            d
              .select()
              .from(agentSignups)
              .where(eq(agentSignups.userCode, code.trim().toUpperCase()))
              .limit(1)
          )
          .pipe(
            Effect.flatMap((rows) =>
              rows[0] ? Effect.succeed(rows[0]) : Effect.fail(new NotFound({ message: "Sign-up request not found.", resource: "signup" }))
            )
          )

      const requirePending = (row: SignupRow) =>
        row.status !== "pending"
          ? Effect.fail(new Conflict({ message: `This request was already ${row.status}.` }))
          : row.expiresAt.getTime() < Date.now()
            ? Effect.fail(new Conflict({ message: "This request has expired. Ask the agent to start again." }))
            : Effect.void

      const base = {
        mcpUrl: `${env.appUrl}/mcp`,
        apiBaseUrl: `${env.appUrl}/api/v1`
      }

      return Signups.of({
        start: Effect.fn("Signups.start")(function* (input, meta) {
          if (!env.agentSignups) return yield* new Forbidden({ message: "Agent self sign-up is disabled on this server." })
          // Basic abuse protection: cap open requests per IP.
          if (meta.ip) {
            const [open] = yield* db.use((d) =>
              d
                .select({ n: sql<number>`count(*)::int` })
                .from(agentSignups)
                .where(and(eq(agentSignups.clientIp, meta.ip!), eq(agentSignups.status, "pending"), gt(agentSignups.expiresAt, new Date())))
            )
            if ((open?.n ?? 0) >= 10) return yield* new InvalidRequest({ message: "Too many pending sign-up requests from this address." })
          }
          const id = newId("sgn")
          const pollToken = `agmx_poll_${randomToken(32)}`
          const code = userCode()
          const expiresAt = new Date(Date.now() + SIGNUP_TTL_MS)
          yield* db.use((d) =>
            d.insert(agentSignups).values({
              id,
              userCode: code,
              pollTokenHash: sha256(pollToken),
              agentName: input.name.trim(),
              description: input.description?.trim() || null,
              requestedUsername: input.username?.trim().toLowerCase() || null,
              ownerEmail: input.ownerEmail?.trim().toLowerCase() || null,
              clientIp: meta.ip,
              userAgent: meta.userAgent?.slice(0, 300) ?? null,
              expiresAt
            })
          )
          const approvalUrl = `${env.appUrl}/claim/${code}`
          return {
            signupId: id,
            userCode: code,
            pollToken,
            approvalUrl,
            pollUrl: `${env.appUrl}/api/v1/signup/${id}?token=${pollToken}`,
            pollIntervalSeconds: 5,
            expiresAt: expiresAt.toISOString(),
            instructions: `Ask your human to open ${approvalUrl} (code ${code}) and approve "${input.name.trim()}". Then poll the pollUrl every 5 seconds; when status is "approved" the response contains your API key (shown once). Requests expire in 30 minutes.`
          }
        }),

        poll: Effect.fn("Signups.poll")(function* (signupId, token) {
          const [row] = yield* db.use((d) => d.select().from(agentSignups).where(eq(agentSignups.id, signupId)).limit(1))
          if (!row) return yield* new NotFound({ message: "Sign-up request not found.", resource: "signup" })
          if (!safeEqual(sha256(token), row.pollTokenHash)) return yield* new Unauthorized({ message: "Invalid poll token." })

          if (row.status === "pending") {
            return { status: row.expiresAt.getTime() < Date.now() ? "expired" : "pending", apiKey: null, agent: null, inbox: null, ...base } as const
          }
          if (row.status === "denied") return { status: "denied", apiKey: null, agent: null, inbox: null, ...base } as const

          const principal: Principal = { userId: row.userId!, email: "", role: "user", plan: "free", kind: "account_key", agentId: null, apiKeyId: null }
          const agent = row.agentId ? yield* agents.get(principal, row.agentId).pipe(Effect.option) : null
          const agentValue = agent && agent._tag === "Some" ? (({ webhookSecret: _s, ...rest }) => rest)(agent.value) : null
          const [inboxRow] = row.inboxId ? yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, row.inboxId!))) : []
          const inbox = inboxRow ? toInbox(inboxRow) : null

          if (row.status === "approved" && row.agentId && row.userId) {
            // Hand out the key exactly once: flip to completed and mint together, so a failed
            // mint leaves the request approved and the next poll can try again.
            const { userId, agentId } = row
            const key = yield* db.transaction(
              Effect.gen(function* () {
                const claimed = yield* db.use((d) =>
                  d
                    .update(agentSignups)
                    .set({ status: "completed" })
                    .where(and(eq(agentSignups.id, row.id), eq(agentSignups.status, "approved")))
                    .returning({ id: agentSignups.id })
                )
                if (claimed.length === 0) return null
                return (yield* agents.mintKey(userId, agentId, `${row.agentName} (self sign-up)`)).key
              })
            )
            if (key) return { status: "approved", apiKey: key, agent: agentValue, inbox, ...base } as const
          }
          return { status: "completed", apiKey: null, agent: agentValue, inbox, ...base } as const
        }),

        list: Effect.fn("Signups.list")(function* (principal) {
          yield* requireAccount(principal, "review agent sign-ups")
          const rows = yield* db.use((d) =>
            d
              .select()
              .from(agentSignups)
              .where(and(eq(agentSignups.ownerEmail, principal.email.toLowerCase()), eq(agentSignups.status, "pending"), gt(agentSignups.expiresAt, new Date())))
              .orderBy(desc(agentSignups.createdAt))
              .limit(50)
          )
          return rows.map(toPending)
        }),

        get: Effect.fn("Signups.get")(function* (principal, code) {
          yield* requireAccount(principal, "review agent sign-ups")
          return toPending(yield* byCode(code))
        }),

        approve: Effect.fn("Signups.approve")(function* (principal, code, input) {
          yield* requireAccount(principal, "approve agent sign-ups")
          const row = yield* byCode(code)
          yield* requirePending(row)
          const result = yield* db.transaction(
            Effect.gen(function* () {
              const created = yield* agents.createForUser(
                principal.userId,
                {
                  name: row.agentName,
                  description: row.description,
                  username: input.username ?? row.requestedUsername ?? undefined,
                  domain: input.domain
                },
                { createInbox: true }
              )
              const updated = yield* db.use((d) =>
                d
                  .update(agentSignups)
                  .set({ status: "approved", userId: principal.userId, agentId: created.agent.id, inboxId: created.inbox?.id ?? null, decidedAt: new Date() })
                  .where(and(eq(agentSignups.id, row.id), eq(agentSignups.status, "pending")))
                  .returning({ id: agentSignups.id })
              )
              if (updated.length === 0) return yield* new Conflict({ message: "This request was already decided." })
              return created
            })
          )
          const { webhookSecret: _secret, ...agent } = yield* agents.get(principal, result.agent.id).pipe(Effect.orDie)
          return agent
        }),

        deny: Effect.fn("Signups.deny")(function* (principal, code) {
          yield* requireAccount(principal, "deny agent sign-ups")
          const row = yield* byCode(code)
          yield* db.use((d) =>
            d
              .update(agentSignups)
              .set({ status: "denied", userId: principal.userId, decidedAt: new Date() })
              .where(and(eq(agentSignups.id, row.id), eq(agentSignups.status, "pending")))
          )
        })
      })
    })
  )
}
