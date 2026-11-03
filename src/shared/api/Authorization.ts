import { Context } from "effect"
import { HttpApiMiddleware, HttpApiSecurity, OpenApi } from "effect/http-api"
import { Unauthorized } from "./errors"

export interface Principal {
  readonly userId: string
  readonly email: string
  readonly role: string
  readonly plan: string
  readonly kind: "session" | "account_key" | "agent_key"
  /** Set when authenticated with an agent-scoped key. */
  readonly agentId: string | null
  readonly apiKeyId: string | null
}

export class CurrentPrincipal extends Context.Service<CurrentPrincipal, Principal>()("agmx/api/CurrentPrincipal") {}

/**
 * Authenticates every protected endpoint. Agents send `Authorization: Bearer
 * agmx_…`; the dashboard relies on the Better Auth session cookie. Security
 * schemes are tried in order, so either works on every endpoint.
 */
export class Authorization extends HttpApiMiddleware.Service<Authorization, {
  provides: CurrentPrincipal
  requires: never
}>()("agmx/api/Authorization", {
  security: {
    bearer: HttpApiSecurity.bearer.pipe(
      HttpApiSecurity.annotate(OpenApi.Description, "API key from the dashboard or the agent sign-up flow: `Authorization: Bearer agmx_…`")
    ),
    session: HttpApiSecurity.apiKey({ key: "agmx.session_token", in: "cookie" }).pipe(
      HttpApiSecurity.annotate(OpenApi.Description, "Browser session cookie set by signing in to the dashboard.")
    )
  },
  error: Unauthorized
}) {}
