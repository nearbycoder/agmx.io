import { resolveMx } from "node:dns/promises"
import { and, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import type * as D from "~/shared/api/domain"
import { Conflict, DeliveryFailed, Forbidden, InvalidRequest, NotFound, QuotaExceeded } from "~/shared/api/errors"
import { domains } from "../db/schema"
import type { DomainRow } from "../db/types"
import { env } from "../env"
import { newId } from "../ids"
import { toDomain } from "../serialize"
import { requireAccount } from "./access"
import { Db } from "./Db"
import { MailTransport } from "./MailTransport"
import { Quota } from "./Quota"

const DOMAIN_RE = /^(?=.{4,253}$)(?!-)([a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/

export class Domains extends Context.Service<Domains, {
  list(principal: Principal): Effect.Effect<Array<typeof D.Domain.Type>>
  get(principal: Principal, id: string): Effect.Effect<typeof D.Domain.Type, NotFound>
  create(principal: Principal, name: string): Effect.Effect<typeof D.Domain.Type, QuotaExceeded | Conflict | InvalidRequest | Forbidden | DeliveryFailed>
  verify(principal: Principal, id: string): Effect.Effect<typeof D.Domain.Type, NotFound>
  remove(principal: Principal, id: string): Effect.Effect<void, NotFound | Forbidden>
}>()("agmx/services/Domains") {
  static readonly layer = Layer.effect(
    Domains,
    Effect.gen(function* () {
      const db = yield* Db
      const transport = yield* MailTransport
      const quota = yield* Quota

      const requireDomain = (principal: Principal, id: string) =>
        db
          .use((d) => d.select().from(domains).where(and(eq(domains.id, id), eq(domains.userId, principal.userId))).limit(1))
          .pipe(
            Effect.flatMap((rows) =>
              rows[0] ? Effect.succeed(rows[0]) : Effect.fail(new NotFound({ message: "Domain not found.", resource: "domain" }))
            )
          )

      const refresh = Effect.fn("Domains.refresh")(function* (row: DomainRow) {
        const identity = yield* transport.getDomainIdentity(row.name).pipe(Effect.option)
        const mx = yield* Effect.promise(() => resolveMx(row.name).catch(() => []))
        const expectedMx = `inbound-smtp.${env.aws.region}.amazonaws.com`
        const mxVerified = transport.name === "log" || mx.some((r) => r.exchange.toLowerCase().replace(/\.$/, "") === expectedMx)
        const dkimStatus = identity._tag === "Some" ? identity.value.dkimStatus : row.dkimStatus
        const dkimTokens = identity._tag === "Some" && identity.value.dkimTokens.length ? identity.value.dkimTokens : row.dkimTokens
        const verified = identity._tag === "Some" && identity.value.verifiedForSending && dkimStatus === "SUCCESS"
        const status = verified ? "verified" : dkimStatus === "FAILED" ? "failed" : "pending"
        const [updated] = yield* db.use((d) =>
          d
            .update(domains)
            .set({ dkimStatus, dkimTokens, mxVerified, status, lastCheckedAt: new Date() })
            .where(eq(domains.id, row.id))
            .returning()
        )
        return updated!
      })

      return Domains.of({
        list: (principal) =>
          db
            .use((d) => d.select().from(domains).where(eq(domains.userId, principal.userId)).orderBy(desc(domains.createdAt)))
            .pipe(Effect.map((rows) => rows.map(toDomain))),

        get: (principal, id) => requireDomain(principal, id).pipe(Effect.map(toDomain)),

        create: Effect.fn("Domains.create")(function* (principal, input) {
          yield* requireAccount(principal, "add domains")
          const name = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "")
          if (!DOMAIN_RE.test(name)) return yield* new InvalidRequest({ message: "Enter a valid domain such as mail.example.com.", field: "name" })
          const reserved = [env.mailDomain, env.operatorDomain].filter((d): d is string => Boolean(d))
          if (reserved.some((d) => name === d || name.endsWith(`.${d}`) || d.endsWith(`.${name}`)))
            return yield* new InvalidRequest({ message: `${name} belongs to this AGMX server and can't be added as a custom domain.`, field: "name" })
          yield* quota.checkDomains(principal.userId)
          const [existing] = yield* db.use((d) => d.select({ id: domains.id }).from(domains).where(eq(domains.name, name)).limit(1))
          if (existing) return yield* new Conflict({ message: `${name} is already connected to an AGMX account.` })
          const identity = yield* transport.createDomainIdentity(name).pipe(
            Effect.catch((error) =>
              /AlreadyExists/i.test(error.message)
                ? transport.getDomainIdentity(name).pipe(Effect.map((i) => ({ dkimTokens: i.dkimTokens })))
                : Effect.fail(error)
            )
          )
          yield* transport.setReceiving(name, true)
          const [row] = yield* db.use((d) =>
            d.insert(domains).values({ id: newId("dom"), userId: principal.userId, name, dkimTokens: identity.dkimTokens }).returning()
          )
          return toDomain(transport.name === "log" ? yield* refresh(row!) : row!)
        }),

        verify: Effect.fn("Domains.verify")(function* (principal, id) {
          const row = yield* requireDomain(principal, id)
          return toDomain(yield* refresh(row))
        }),

        remove: Effect.fn("Domains.remove")(function* (principal, id) {
          yield* requireAccount(principal, "remove domains")
          const row = yield* requireDomain(principal, id)
          yield* transport.setReceiving(row.name, false)
          yield* transport.deleteDomainIdentity(row.name)
          yield* db.use((d) => d.delete(domains).where(eq(domains.id, row.id)))
        })
      })
    })
  )
}
