import type { Extracted } from "../db/schema"
import { htmlToText } from "./compose"

const CODE_KEYWORDS =
  /(code|otp|one[-\s]?time|passcode|pass code|pin|verification|verify|confirm|security|token|2fa|two[-\s]?factor|login|sign[-\s]?in|código|code de|bestätigungscode|验证码)/i

const LINK_KINDS: Array<[Extracted["links"][number]["kind"], RegExp]> = [
  ["unsubscribe", /unsubscribe|opt[-\s]?out|email[-_]?preferences|manage[-\s]?subscription/i],
  ["reset", /reset|recover|forgot/i],
  ["verify", /verif|confirm|activat|validate|approve|email[-_]?token/i],
  ["login", /log[-\s]?in|sign[-\s]?in|magic|signin|auth|session|access/i]
]

const classify = (url: string, text: string | null | undefined): Extracted["links"][number]["kind"] => {
  const haystack = `${text ?? ""} ${url}`
  for (const [kind, re] of LINK_KINDS) if (re.test(haystack)) return kind
  return "other"
}

const decodeEntities = (value: string) =>
  value.replace(/&amp;/g, "&").replace(/&#x3D;/gi, "=").replace(/&#61;/g, "=").replace(/&quot;/g, '"')

/**
 * Pulls verification codes and actionable links out of an email so agents
 * don't have to parse HTML themselves. Heuristic, but tuned for the common
 * transactional emails agents run into (sign-ups, magic links, 2FA).
 */
export const extract = (subject: string, text: string | null | undefined, html: string | null | undefined): Extracted => {
  const plain = [subject, text && text.trim() ? text : html ? htmlToText(html) : ""].join("\n")

  // ---- Codes -------------------------------------------------------------
  const scored = new Map<string, number>()
  const lines = plain.split(/\n/)
  lines.forEach((line, index) => {
    const context = [lines[index - 1] ?? "", line, lines[index + 1] ?? ""].join(" ")
    const nearKeyword = CODE_KEYWORDS.test(context)
    const candidates = [
      ...line.matchAll(/(?<![\w/#.:-])(\d{3}[ -]\d{3}|\d{4,8})(?![\w/:%-]|[.,]\d)/g),
      ...(nearKeyword ? line.matchAll(/(?<![\w/#.:-])([A-Z0-9]{3,5}-[A-Z0-9]{3,5}|(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6,8})(?![\w/:-]|[.,]\w)/g) : [])
    ]
    for (const match of candidates) {
      const raw = match[1]!
      const before = line.slice(Math.max(0, match.index! - 2), match.index!)
      // Skip prices, copyright years and other numbers that are clearly not codes.
      if (/[$€£¥#]\s?$|©\s?$/.test(before)) continue
      const code = /^\d{3}[ -]\d{3}$/.test(raw) ? raw.replace(/[ -]/, "") : raw
      if (/^(19|20)\d{2}$/.test(code)) continue
      if (!nearKeyword && code.length < 6) continue
      const score = (nearKeyword ? 10 : 0) + (code.length === 6 ? 3 : 0) + (index === 0 ? 2 : 0) + (/^\d{3}[ -]\d{3}$/.test(raw) ? 2 : 0)
      scored.set(code, Math.max(scored.get(code) ?? 0, score))
    }
  })
  const codes = [...scored.entries()]
    .filter(([, score]) => score >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code]) => code)

  // ---- Links -------------------------------------------------------------
  const links = new Map<string, Extracted["links"][number]>()
  if (html) {
    for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const url = decodeEntities(match[1]!.trim())
      if (!/^https?:\/\//i.test(url)) continue
      const label = match[2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() || null
      if (!links.has(url)) links.set(url, { url, text: label, kind: classify(url, label) })
    }
  }
  for (const match of plain.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const url = decodeEntities(match[0].replace(/[.,;:!?]+$/, ""))
    if (!links.has(url)) links.set(url, { url, text: null, kind: classify(url, null) })
  }
  const order = { verify: 0, login: 1, reset: 2, other: 3, unsubscribe: 4 } as const
  const sortedLinks = [...links.values()]
    .filter((link) => !/\.(png|jpe?g|gif|svg|webp|css)(\?|$)/i.test(link.url))
    .sort((a, b) => order[a.kind] - order[b.kind])
    .slice(0, 25)

  return { codes, links: sortedLinks }
}
