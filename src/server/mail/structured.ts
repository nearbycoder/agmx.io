import type { ExtractedEvent, ExtractedReceipt, ExtractedTracking } from "../db/schema"

// ---------------------------------------------------------------------------
// Calendar invites (iCalendar / .ics)
// ---------------------------------------------------------------------------

/** Offset (ms) of `timeZone` from UTC at the given UTC instant. */
const tzOffset = (utc: number, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(new Date(utc))
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - utc
  } catch {
    return 0
  }
}

const parseIcsDate = (value: string, params: Record<string, string>): { iso: string | null; allDay: boolean } => {
  const date = value.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (date || params.VALUE === "DATE") {
    const d = date ?? value.match(/^(\d{4})(\d{2})(\d{2})/)
    return d ? { iso: `${d[1]}-${d[2]}-${d[3]}`, allDay: true } : { iso: null, allDay: true }
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) return { iso: null, allDay: false }
  const [, y, mo, d, h, mi, s, z] = m
  const naive = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!)
  if (z) return { iso: new Date(naive).toISOString(), allDay: false }
  const tz = params.TZID?.replace(/^"|"$/g, "")
  if (!tz) return { iso: new Date(naive).toISOString().replace("Z", ""), allDay: false }
  const first = tzOffset(naive, tz)
  const offset = tzOffset(naive - first, tz)
  return { iso: new Date(naive - offset).toISOString(), allDay: false }
}

const unescapeIcs = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim()

const safeHttpUrl = (raw: string): string | null => {
  try {
    const parsed = new URL(raw.trim())
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null
  } catch {
    return null
  }
}

export const parseCalendar = (ics: string): Array<ExtractedEvent> => {
  const lines = ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/)
  const events: Array<ExtractedEvent> = []
  let method: string | null = null
  let current: Partial<ExtractedEvent> | null = null
  for (const line of lines) {
    const idx = line.indexOf(":")
    if (idx < 0) continue
    const [rawName, ...paramParts] = line.slice(0, idx).split(";")
    const name = rawName!.toUpperCase()
    const value = line.slice(idx + 1)
    const params = Object.fromEntries(
      paramParts.map((p) => {
        const eq = p.indexOf("=")
        return eq < 0 ? [p.toUpperCase(), ""] : [p.slice(0, eq).toUpperCase(), p.slice(eq + 1)]
      })
    )
    if (name === "METHOD") method = value.trim()
    else if (name === "BEGIN" && value.trim() === "VEVENT") current = { allDay: false }
    else if (name === "END" && value.trim() === "VEVENT" && current) {
      events.push({
        title: current.title ?? "(untitled event)",
        start: current.start ?? null,
        end: current.end ?? null,
        allDay: current.allDay ?? false,
        location: current.location ?? null,
        organizer: current.organizer ?? null,
        url: current.url ?? null,
        method,
        uid: current.uid ?? null
      })
      current = null
    } else if (current) {
      if (name === "SUMMARY") current.title = unescapeIcs(value)
      else if (name === "DTSTART") {
        const parsed = parseIcsDate(value.trim(), params)
        current.start = parsed.iso
        current.allDay = parsed.allDay
      } else if (name === "DTEND") current.end = parseIcsDate(value.trim(), params).iso
      else if (name === "LOCATION") current.location = unescapeIcs(value) || null
      else if (name === "ORGANIZER") current.organizer = value.replace(/^mailto:/i, "").trim() || params.CN || null
      else if (name === "URL") current.url = safeHttpUrl(value)
      else if (name === "UID") current.uid = value.trim()
    }
  }
  return events.slice(0, 10)
}

// ---------------------------------------------------------------------------
// Receipts and invoices
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = { $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₹": "INR", "C$": "CAD", A$: "AUD" }

export const parseReceipt = (subject: string, text: string, merchant: string | null): ExtractedReceipt | null => {
  const haystack = `${subject}\n${text}`
  if (!/\b(receipt|invoice|order confirmation|your order|order #|payment (received|confirmation)|amount (paid|due|charged)|thanks for your (purchase|order))\b/i.test(haystack)) return null

  let total: number | null = null
  let currency: string | null = null
  const amount = String.raw`(C\$|A\$|[$€£¥₹])?\s?(\d{1,3}(?:[,\s]\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)\s?(USD|EUR|GBP|CAD|AUD|JPY|INR)?`
  const totalRe = new RegExp(String.raw`\b(grand total|total paid|amount paid|amount charged|amount due|total due|order total|total)\b[^\d$€£¥₹\n]{0,20}` + amount, "i")
  const match = haystack.match(totalRe)
  if (match) {
    const raw = match[3]!.replace(/\s/g, "")
    const normalized = /,\d{2}$/.test(raw) && !/\.\d{2}$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "")
    const value = Number(normalized)
    if (Number.isFinite(value)) total = value
    currency = match[4]?.toUpperCase() ?? (match[2] ? CURRENCY_SYMBOLS[match[2]] ?? null : null)
  }
  const order = haystack.match(/\b(?:order|invoice|receipt|confirmation)\s*(?:#|no\.?|number|num\.?|id)\s*[:\-]?\s*#?([A-Z0-9][A-Z0-9-]{3,24})\b/i)
  if (total === null && !order) return null
  return { merchant, total, currency, orderNumber: order ? order[1]! : null }
}

// ---------------------------------------------------------------------------
// Package tracking
// ---------------------------------------------------------------------------

const TRACKING_URL: Record<ExtractedTracking["carrier"], (n: string) => string | null> = {
  ups: (n) => `https://www.ups.com/track?tracknum=${n}`,
  fedex: (n) => `https://www.fedex.com/fedextrack/?trknbr=${n}`,
  usps: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`,
  dhl: (n) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${n}`,
  other: () => null
}

export const parseTracking = (text: string, links: ReadonlyArray<{ url: string }>): Array<ExtractedTracking> => {
  const found = new Map<string, ExtractedTracking>()
  const add = (carrier: ExtractedTracking["carrier"], number: string, url?: string | null) => {
    const key = number.toUpperCase()
    if (!found.has(key)) found.set(key, { carrier, number: key, url: url ?? TRACKING_URL[carrier](key) })
  }
  for (const m of text.matchAll(/\b(1Z[0-9A-Z]{16})\b/gi)) add("ups", m[1]!)
  const mentions = (re: RegExp) => re.test(text)
  if (mentions(/\bfed ?ex\b/i)) for (const m of text.matchAll(/\b(\d{12}|\d{15}|\d{20})\b/g)) add("fedex", m[1]!)
  if (mentions(/\busps|postal service\b/i)) for (const m of text.matchAll(/\b(9[2-5]\d{18,20}|[A-Z]{2}\d{9}US)\b/g)) add("usps", m[1]!)
  if (mentions(/\bdhl\b/i)) for (const m of text.matchAll(/\b(\d{10})\b/g)) add("dhl", m[1]!)
  for (const { url } of links) {
    const u = url.toLowerCase()
    const num = url.match(/(?:tracknum|trknbr|tlabels|tracking-id|tracking_number|trackingnumber|track)=([A-Z0-9]{8,30})/i)?.[1]
    if (!num) continue
    const carrier: ExtractedTracking["carrier"] = u.includes("ups.com") ? "ups" : u.includes("fedex.com") ? "fedex" : u.includes("usps.com") ? "usps" : u.includes("dhl.") ? "dhl" : "other"
    add(carrier, num, url)
  }
  return [...found.values()].slice(0, 5)
}

export const isTrackingLink = (url: string, label: string | null | undefined) =>
  /track|shipment|delivery status|where'?s my order/i.test(label ?? "") || /(ups|fedex|usps|dhl)\.[a-z.]+\/.*track|\/track(ing)?[/?]/i.test(url)
