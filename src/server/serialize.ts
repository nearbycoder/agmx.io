import type * as D from "~/shared/api/domain"
import type { AttachmentRow, AgentRow, DomainRow, InboxRow, MessageRow, ThreadRow, WebhookDeliveryRow } from "./db/types"
import { env } from "./env"

const iso = (d: Date) => d.toISOString()
const isoOrNull = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export interface InboxStats {
  unreadCount: number
  messageCount: number
}

export const toInbox = (row: InboxRow, stats?: InboxStats): typeof D.Inbox.Type => ({
  id: row.id,
  agentId: row.agentId,
  address: row.address,
  localPart: row.localPart,
  domain: row.domain,
  displayName: row.displayName,
  status: row.status,
  unreadCount: stats?.unreadCount ?? 0,
  messageCount: stats?.messageCount ?? 0,
  temporary: row.expiresAt !== null,
  expiresAt: isoOrNull(row.expiresAt),
  maxMessages: row.maxMessages,
  lastMessageAt: isoOrNull(row.lastMessageAt),
  createdAt: iso(row.createdAt)
})

export const toAgent = (row: AgentRow, inboxes: ReadonlyArray<typeof D.Inbox.Type>): typeof D.Agent.Type => ({
  id: row.id,
  name: row.name,
  description: row.description,
  color: row.color,
  status: row.status,
  webhookUrl: row.webhookUrl,
  sendPolicy: row.sendPolicy,
  approveAttachments: row.approveAttachments,
  sendingPaused: row.sendingPausedAt ? { at: iso(row.sendingPausedAt), reason: row.sendingPausedReason } : null,
  inboxes: [...inboxes],
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt)
})

export const attachmentUrl = (messageId: string, attachmentId: string) =>
  `${env.appUrl}/api/v1/messages/${messageId}/attachments/${attachmentId}`

export const toAttachment = (row: Omit<AttachmentRow, "content" | "storageKey" | "userId" | "createdAt">): typeof D.AttachmentMeta.Type => ({
  id: row.id,
  filename: row.filename,
  contentType: row.contentType,
  size: row.size,
  inline: row.inline,
  contentId: row.contentId,
  downloadUrl: attachmentUrl(row.messageId, row.id),
  extractedText: row.extractedText
})

/** Older rows predate events/receipts/tracking; fill in empty values. */
const normalizeExtracted = (e: MessageRow["extracted"]): typeof D.Extracted.Type => ({
  codes: e.codes ?? [],
  links: e.links ?? [],
  events: e.events ?? [],
  receipt: e.receipt ?? null,
  tracking: e.tracking ?? []
})

export const toMessageSummary = (row: MessageRow, attachmentCount = 0): typeof D.MessageSummary.Type => ({
  id: row.id,
  inboxId: row.inboxId,
  threadId: row.threadId,
  direction: row.direction,
  status: row.status,
  from: { name: row.fromName, address: row.fromAddress },
  to: row.to,
  cc: row.cc,
  subject: row.subject,
  snippet: row.snippet,
  extracted: normalizeExtracted(row.extracted),
  security: row.security,
  sendAt: isoOrNull(row.sendAt),
  labels: row.labels,
  isRead: row.isRead,
  isStarred: row.isStarred,
  isArchived: row.isArchived,
  isSpam: row.isSpam,
  attachmentCount,
  createdAt: iso(row.createdAt)
})

export const toMessage = (
  row: MessageRow,
  attachments: ReadonlyArray<Omit<AttachmentRow, "content" | "storageKey" | "userId" | "createdAt">>
): typeof D.Message.Type => ({
  ...toMessageSummary(row, attachments.length),
  bcc: row.bcc,
  replyTo: row.replyTo,
  text: row.text,
  html: row.html,
  safeText: row.safeText,
  headers: row.headers,
  rfcMessageId: row.rfcMessageId,
  inReplyTo: row.inReplyTo,
  verdicts: row.verdicts,
  error: row.error,
  sizeBytes: row.sizeBytes,
  attachments: attachments.map(toAttachment)
})

export const toThread = (row: ThreadRow): typeof D.Thread.Type => ({
  id: row.id,
  inboxId: row.inboxId,
  subject: row.subject,
  snippet: row.snippet,
  participants: row.participants,
  messageCount: row.messageCount,
  unreadCount: row.unreadCount,
  lastMessageAt: iso(row.lastMessageAt),
  createdAt: iso(row.createdAt)
})

export const domainRecords = (row: DomainRow): Array<typeof D.DnsRecord.Type> => {
  const dkim = row.dkimStatus === "SUCCESS" ? "verified" : row.dkimStatus === "PENDING" ? "pending" : "unknown"
  return [
    {
      type: "MX",
      name: row.name,
      value: `inbound-smtp.${env.aws.region}.amazonaws.com`,
      priority: 10,
      purpose: "Receive mail at this domain",
      status: row.mxVerified ? "verified" : "pending"
    },
    ...row.dkimTokens.map(
      (token): typeof D.DnsRecord.Type => ({
        type: "CNAME",
        name: `${token}._domainkey.${row.name}`,
        value: `${token}.dkim.amazonses.com`,
        purpose: "DKIM signature (sending authentication)",
        status: dkim
      })
    ),
    {
      type: "TXT",
      name: `_dmarc.${row.name}`,
      value: "v=DMARC1; p=none; rua=mailto:dmarc@" + row.name,
      purpose: "DMARC policy (recommended)",
      status: "unknown"
    }
  ]
}

export const toDomain = (row: DomainRow): typeof D.Domain.Type => ({
  id: row.id,
  name: row.name,
  status: row.status,
  dkimStatus: row.dkimStatus,
  mxVerified: row.mxVerified,
  records: domainRecords(row),
  lastCheckedAt: isoOrNull(row.lastCheckedAt),
  createdAt: iso(row.createdAt)
})

export const toWebhookDelivery = (row: WebhookDeliveryRow): typeof D.WebhookDelivery.Type => ({
  id: row.id,
  event: row.event,
  url: row.url,
  status: row.status,
  attempts: row.attempts,
  responseStatus: row.responseStatus,
  lastError: row.lastError,
  createdAt: iso(row.createdAt),
  deliveredAt: isoOrNull(row.deliveredAt)
})
