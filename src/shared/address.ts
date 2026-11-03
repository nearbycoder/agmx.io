export interface ParsedAddress {
  name: string | null
  address: string
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/

export const isValidEmail = (value: string) => EMAIL_RE.test(value.trim())

/** Splits a recipient list on commas/semicolons that are not inside quotes or angle brackets. */
const splitList = (input: string): Array<string> => {
  const parts: Array<string> = []
  let current = ""
  let quoted = false
  let angle = 0
  for (const ch of input) {
    if (ch === '"') quoted = !quoted
    if (!quoted && ch === "<") angle++
    if (!quoted && ch === ">") angle = Math.max(0, angle - 1)
    if (!quoted && angle === 0 && (ch === "," || ch === ";" || ch === "\n")) {
      if (current.trim()) parts.push(current.trim())
      current = ""
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/** Parses `Name <addr@x.com>`, `"Name" <addr>` or bare `addr@x.com`. Returns null when invalid. */
export const parseAddress = (input: string): ParsedAddress | null => {
  const value = input.trim()
  const match = value.match(/^(.*)<([^<>]+)>\s*$/)
  if (match) {
    const name = match[1]!.trim().replace(/^"(.*)"$/, "$1").trim()
    const address = match[2]!.trim().toLowerCase()
    return isValidEmail(address) ? { name: name || null, address } : null
  }
  return isValidEmail(value) ? { name: null, address: value.toLowerCase() } : null
}

export const parseAddressList = (input: string | ReadonlyArray<string> | undefined | null) => {
  const raw = input === undefined || input === null ? [] : typeof input === "string" ? splitList(input) : input.flatMap(splitList)
  const valid: Array<ParsedAddress> = []
  const invalid: Array<string> = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const parsed = parseAddress(entry)
    if (!parsed) invalid.push(entry)
    else if (!seen.has(parsed.address)) {
      seen.add(parsed.address)
      valid.push(parsed)
    }
  }
  return { valid, invalid }
}

export const formatAddress = (a: { name?: string | null; address: string }) =>
  a.name ? `${/[",<>@;:]/.test(a.name) ? JSON.stringify(a.name) : a.name} <${a.address}>` : a.address

export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/

export const normalizeUsername = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "-")

/** Local parts that can never be claimed through the API. */
export const RESERVED_USERNAMES = new Set([
  "abuse", "admin", "administrator", "billing", "bounce", "bounces", "help", "hostmaster", "info",
  "mailer-daemon", "no-reply", "noreply", "postmaster", "root", "security", "support", "system",
  "webmaster", "www", "agmx", "team", "legal", "privacy", "dmarc", "ses", "notifications"
])

export const subjectKey = (subject: string) =>
  subject
    .replace(/^(\s*(re|fw|fwd|aw|sv|wg|antw)(\[\d+\])?\s*:\s*)+/i, "")
    .trim()
    .toLowerCase()
