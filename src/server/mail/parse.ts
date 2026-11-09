import PostalMime from "postal-mime"
import type { Address } from "../db/schema"

export interface ParsedEmail {
  from: Address
  to: Array<Address>
  cc: Array<Address>
  replyTo: Array<Address>
  subject: string
  text: string | null
  html: string | null
  messageId: string | null
  inReplyTo: string | null
  references: Array<string>
  headers: Record<string, string>
  attachments: Array<{ filename: string; contentType: string; content: Buffer; contentId: string | null; inline: boolean }>
  sizeBytes: number
}

type PostalAddress = { name?: string; address?: string; group?: Array<PostalAddress> }

const flatten = (list: ReadonlyArray<PostalAddress> | PostalAddress | undefined | null): Array<Address> => {
  if (!list) return []
  const items = Array.isArray(list) ? list : [list]
  return items.flatMap((item) =>
    item.group ? flatten(item.group) : item.address ? [{ name: item.name?.trim() || null, address: item.address.trim().toLowerCase() }] : []
  )
}

const KEPT_HEADERS = new Set([
  "date", "message-id", "in-reply-to", "references", "list-unsubscribe", "list-id", "return-path", "x-mailer",
  "auto-submitted", "precedence", "x-auto-response-suppress", "authentication-results", "content-language", "x-agmx-tag", "x-agmx-forward-hops"
])

export const parseMime = async (raw: Buffer | Uint8Array | string): Promise<ParsedEmail> => {
  const bytes = typeof raw === "string" ? Buffer.from(raw) : Buffer.from(raw)
  const email = await PostalMime.parse(bytes, { attachmentEncoding: "arraybuffer" })
  const headers: Record<string, string> = {}
  for (const header of email.headers ?? []) {
    const key = header.key.toLowerCase()
    if (KEPT_HEADERS.has(key) && headers[key] === undefined) headers[key] = header.value.slice(0, 2000)
  }
  const from = flatten(email.from as PostalAddress)[0] ?? flatten(email.sender as PostalAddress)[0] ?? { name: null, address: "unknown@unknown" }
  return {
    from,
    to: flatten(email.to as Array<PostalAddress>),
    cc: flatten(email.cc as Array<PostalAddress>),
    replyTo: flatten(email.replyTo as Array<PostalAddress>),
    subject: (email.subject ?? "").trim(),
    text: email.text ?? null,
    html: email.html ?? null,
    messageId: email.messageId?.trim() || null,
    inReplyTo: email.inReplyTo?.trim().split(/\s+/)[0] || null,
    references: (email.references ?? "").split(/\s+/).map((r) => r.trim()).filter((r) => r.startsWith("<")),
    headers,
    attachments: (email.attachments ?? []).map((a, index) => ({
      filename: a.filename || `attachment-${index + 1}${a.mimeType === "text/calendar" ? ".ics" : ""}`,
      contentType: a.mimeType || "application/octet-stream",
      content: Buffer.from(a.content as ArrayBuffer),
      contentId: a.contentId?.replace(/^<|>$/g, "") || null,
      inline: a.disposition === "inline"
    })),
    sizeBytes: bytes.byteLength
  }
}
