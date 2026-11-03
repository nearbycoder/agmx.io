import { normalizeUsername, RESERVED_USERNAMES, USERNAME_RE } from "~/shared/address"

/** Client-side mirror of the server's username rules, for instant feedback. */
export const usernameProblem = (raw: string, isSharedDomain: boolean): string | null => {
  if (!raw.trim()) return null
  const value = normalizeUsername(raw)
  if (value.includes("+")) return "Usernames can't contain '+' (plus-addressing is automatic)."
  if (!USERNAME_RE.test(value)) return "Use lowercase letters, numbers, dots, dashes or underscores."
  if (isSharedDomain && value.length < 3) return "At least 3 characters."
  if (isSharedDomain && RESERVED_USERNAMES.has(value)) return `"${value}" is reserved.`
  return null
}
