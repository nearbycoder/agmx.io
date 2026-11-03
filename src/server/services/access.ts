import { Effect } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import { Forbidden } from "~/shared/api/errors"

/** Operations reserved for humans (dashboard sessions) and full account keys. */
export const requireAccount = (principal: Principal, action: string) =>
  principal.kind === "agent_key"
    ? Effect.fail(new Forbidden({ message: `Agent-scoped keys cannot ${action}. Use an account key or the dashboard.` }))
    : Effect.void

export const requireAdmin = (principal: Principal) =>
  principal.role === "admin" && principal.kind !== "agent_key"
    ? Effect.void
    : Effect.fail(new Forbidden({ message: "Operator access required." }))

/** Whether the principal may touch resources belonging to `agentId`. */
export const canAccessAgent = (principal: Principal, agentId: string) =>
  principal.agentId === null || principal.agentId === agentId
