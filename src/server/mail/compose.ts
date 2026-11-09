import MailComposer from "nodemailer/lib/mail-composer"
import { formatAddress, type ParsedAddress } from "~/shared/address"

export interface ComposeInput {
  from: ParsedAddress
  to: Array<ParsedAddress>
  cc: Array<ParsedAddress>
  bcc: Array<ParsedAddress>
  replyTo: Array<ParsedAddress>
  subject: string
  text?: string | null
  html?: string | null
  messageId: string
  inReplyTo?: string | null
  references?: Array<string>
  headers?: Record<string, string>
  attachments: Array<{ filename: string; contentType: string; content: Buffer }>
}

/** Builds an RFC 5322 message. Bcc recipients are deliberately left out of the headers. */
export const composeMime = (input: ComposeInput): Promise<Buffer> => {
  const composer = new MailComposer({
    from: formatAddress(input.from),
    to: input.to.map(formatAddress),
    cc: input.cc.length ? input.cc.map(formatAddress) : undefined,
    replyTo: input.replyTo.length ? input.replyTo.map(formatAddress) : undefined,
    subject: input.subject,
    text: input.text ?? undefined,
    html: input.html ?? undefined,
    messageId: input.messageId,
    inReplyTo: input.inReplyTo ?? undefined,
    references: input.references?.length ? input.references : undefined,
    headers: { "X-Mailer": "AGMX", ...input.headers },
    attachments: input.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content }))
  })
  return new Promise((resolve, reject) =>
    composer.compile().build((error, message) => (error ? reject(error) : resolve(message)))
  )
}

export const htmlToText = (html: string) =>
  html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim()

export const makeSnippet = (text: string | null | undefined, html?: string | null) => {
  const raw = text && text.trim() ? text : html ? htmlToText(html) : ""
  // Drop quoted history: everything from an "On …, X wrote:" / forwarded header onwards.
  const cut = raw.search(/(^|\n)\s*(On .{6,200}?wrote:|-{5,} ?Forwarded message ?-{5,}|-----Original Message-----)/i)
  const source = cut > 0 ? raw.slice(0, cut) : raw
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200)
}

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Quote a prior message for replies/forwards, in plain text. */
export const quoteText = (header: string, body: string | null | undefined) =>
  `\n\n${header}\n${(body ?? "").split("\n").map((line) => `> ${line}`).join("\n")}`
