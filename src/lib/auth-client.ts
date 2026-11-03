import { magicLinkClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient({ plugins: [magicLinkClient()] })

/** Sign out and leave the app. Returns false (and leaves the user where they are) if it failed. */
export const signOutAndLeave = async (): Promise<boolean> => {
  const result = await authClient.signOut().catch((error: unknown) => ({ error }))
  if (result && "error" in result && result.error) return false
  window.location.href = "/login"
  return true
}
