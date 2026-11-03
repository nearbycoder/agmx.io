import { Effect, Layer, Redacted } from "effect"
import { HttpServerRequest } from "effect/http"
import { Authorization, CurrentPrincipal, type Principal } from "~/shared/api/Authorization"
import { Unauthorized } from "~/shared/api/errors"
import { auth } from "../auth"
import { Agents } from "../services/Agents"

export const sessionPrincipal = (headers: Headers) =>
  Effect.promise(() => auth.api.getSession({ headers }).catch(() => null)).pipe(
    Effect.map((session): Principal | null =>
      session
        ? {
            userId: session.user.id,
            email: session.user.email,
            role: (session.user as { role?: string }).role ?? "user",
            plan: (session.user as { plan?: string }).plan ?? "free",
            kind: "session",
            agentId: null,
            apiKeyId: null
          }
        : null
    )
  )

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const agents = yield* Agents
    return Authorization.of({
      bearer: Effect.fn(function* (httpEffect, { credential }) {
        const token = Redacted.value(credential)
        if (!token) return yield* new Unauthorized({ message: "Missing credentials. Send `Authorization: Bearer agmx_…`." })
        const principal = yield* agents.authenticate(token)
        if (!principal) return yield* new Unauthorized({ message: "Invalid or revoked API key." })
        return yield* Effect.provideService(httpEffect, CurrentPrincipal, principal)
      }),
      session: Effect.fn(function* (httpEffect) {
        const request = yield* HttpServerRequest.HttpServerRequest
        // A bearer token was sent but rejected by the bearer scheme: report that, not "missing credentials".
        if (/^bearer\s+\S/i.test(request.headers["authorization"] ?? ""))
          return yield* new Unauthorized({ message: "Invalid or revoked API key." })
        const headers = new Headers()
        for (const [key, value] of Object.entries(request.headers)) if (typeof value === "string") headers.set(key, value)
        const principal = yield* sessionPrincipal(headers)
        if (!principal)
          return yield* new Unauthorized({ message: "Not authenticated. Send `Authorization: Bearer agmx_…` or sign in to the dashboard." })
        return yield* Effect.provideService(httpEffect, CurrentPrincipal, principal)
      })
    })
  })
)
