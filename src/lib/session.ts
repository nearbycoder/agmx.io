import { createServerFn } from "@tanstack/react-start"

export interface SessionUser {
  id: string
  email: string
  name: string
  role: string
  plan: string
  image: string | null
}

/** Reads the Better Auth session on the server (used by route guards). */
export const getSessionUser = createServerFn({ method: "GET" }).handler(async (): Promise<SessionUser | null> => {
  const [{ getRequest }, { auth }] = await Promise.all([import("@tanstack/react-start/server"), import("~/server/auth")])
  const session = await auth.api.getSession({ headers: getRequest().headers }).catch(() => null)
  if (!session) return null
  const user = session.user as typeof session.user & { role?: string; plan?: string }
  return { id: user.id, email: user.email, name: user.name, role: user.role ?? "user", plan: user.plan ?? "free", image: user.image ?? null }
})
