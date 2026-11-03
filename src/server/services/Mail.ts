import { and, asc, count, desc, eq, gt, ilike, inArray, lt, lte, notInArray, or, sql, type SQL } from "drizzle-orm"
import { Context, Effect, Layer, PubSub, Schedule } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import type * as D from "~/shared/api/domain"
import { Conflict, DeliveryFailed, Forbidden, InvalidRequest, NotFound, QuotaExceeded } from "~/shared/api/errors"
import { formatAddress, parseAddressList, subjectKey, type ParsedAddress } from "~/shared/address"
import { agents, attachments, inboxes, inboxRules, messages, suppressions, threads, type Address, type Verdicts } from "../db/schema"
import type { AgentRow, InboxRow, MessageRow } from "../db/types"
import { env } from "../env"
import { newId } from "../ids"
import { composeMime, escapeHtml, htmlToText, makeSnippet, quoteText } from "../mail/compose"
import { attachmentText, isCalendar } from "../mail/attachment-text"
import { extract } from "../mail/extract"
import { analyzeSecurity } from "../mail/security"
import { parseMime, type ParsedEmail } from "../mail/parse"
import { toMessage, toMessageSummary, toThread } from "../serialize"
import { Agents } from "./Agents"
import { canAccessAgent, requireAccount } from "./access"
import { Db } from "./Db"
import { Events } from "./Events"
import { MailTransport } from "./MailTransport"
import { Quota } from "./Quota"
import { Storage } from "./Storage"
import { Webhooks } from "./Webhooks"

export interface ListFilters {
  inboxId?: string | undefined
  agentId?: string | undefined
  threadId?: string | undefined
  direction?: "inbound" | "outbound" | undefined
  folder?: "inbox" | "sent" | "starred" | "archived" | "spam" | "drafts" | "scheduled" | "pending" | "all" | undefined
  unread?: "true" | "false" | undefined
  q?: string | undefined
  since?: string | undefined
  limit?: number | undefined
  cursor?: string | undefined
}

const attachmentMetaColumns = {
  id: attachments.id,
  messageId: attachments.messageId,
  filename: attachments.filename,
  contentType: attachments.contentType,
  size: attachments.size,
  contentId: attachments.contentId,
  inline: attachments.inline,
  extractedText: attachments.extractedText
}

const encodeCursor = (row: { createdAt: Date; id: string }) => Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString("base64url")
const decodeCursor = (cursor: string) => {
  const [ts, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|")
  const date = new Date(ts ?? "")
  return id && !Number.isNaN(date.getTime()) ? { createdAt: date, id } : null
}

const sesMessageIdDomain = () => (env.aws.region === "us-east-1" ? "email.amazonses.com" : `${env.aws.region}.amazonses.com`)
const providerIdFromMessageId = (messageId: string) => {
  const match = messageId.match(/^<([^@>]+)@[a-z0-9.-]*amazonses\.com>$/i)
  return match ? match[1]! : null
}

const isAutoReply = (headers: Record<string, string>) =>
  (headers["auto-submitted"] && headers["auto-submitted"] !== "no") || /bulk|junk|list|auto_reply/i.test(headers["precedence"] ?? "")

/** Outbound lifecycle. Only `sending` and later are real, delivered (or attempted) mail. */
export type OutboundStatus = "draft" | "scheduled" | "pending_approval" | "rejected" | "sending" | "sent" | "delivered" | "bounced" | "complained" | "failed"
/** Statuses hidden from thread counts and the normal mail views. */
export const UNSENT_STATUSES = ["draft", "scheduled", "pending_approval", "rejected"] as const
const DELIVERED_STATUSES = ["sent", "delivered"] as const

export interface OutgoingInput {
  from?: string | undefined
  to?: ReadonlyArray<string> | string | undefined
  cc?: ReadonlyArray<string> | string | undefined
  bcc?: ReadonlyArray<string> | string | undefined
  replyTo?: ReadonlyArray<string> | string | undefined
  subject?: string | undefined
  text?: string | undefined
  html?: string | undefined
  attachments?: ReadonlyArray<{ filename: string; contentType?: string | undefined; content: string | Buffer }> | undefined
  headers?: Record<string, string> | undefined
  labels?: ReadonlyArray<string> | undefined
  sendAt?: string | undefined
}

interface SendContext {
  inbox?: InboxRow
  threadId?: string
  inReplyTo?: string | null
  references?: Array<string>
  idempotencyKey?: string | undefined
}

type SendError = QuotaExceeded | InvalidRequest | NotFound | Forbidden | DeliveryFailed | Conflict
type DraftInput = typeof D.DraftPayload.Type

export class Mail extends Context.Service<Mail, {
  list(principal: Principal, filters: ListFilters): Effect.Effect<typeof D.MessagePage.Type>
  get(principal: Principal, messageId: string, markRead?: boolean): Effect.Effect<typeof D.Message.Type, NotFound>
  update(principal: Principal, messageId: string, patch: typeof D.UpdateMessagePayload.Type): Effect.Effect<typeof D.MessageSummary.Type, NotFound>
  remove(principal: Principal, messageId: string): Effect.Effect<void, NotFound>
  attachment(
    principal: Principal,
    messageId: string,
    attachmentId: string
  ): Effect.Effect<{ filename: string; contentType: string; content: Buffer | null; storageKey: string | null }, NotFound>
  send(principal: Principal, input: OutgoingInput, idempotencyKey?: string): Effect.Effect<typeof D.Message.Type, SendError>
  reply(principal: Principal, messageId: string, input: typeof D.ReplyPayload.Type, idempotencyKey?: string): Effect.Effect<typeof D.Message.Type, SendError>
  forward(principal: Principal, messageId: string, input: typeof D.ForwardPayload.Type, idempotencyKey?: string): Effect.Effect<typeof D.Message.Type, SendError>
  cancelScheduled(principal: Principal, messageId: string): Effect.Effect<typeof D.Message.Type, NotFound | Conflict>
  createDraft(principal: Principal, input: DraftInput): Effect.Effect<typeof D.Message.Type, SendError>
  updateDraft(principal: Principal, messageId: string, input: DraftInput): Effect.Effect<typeof D.Message.Type, SendError>
  deleteDraft(principal: Principal, messageId: string): Effect.Effect<void, NotFound | Conflict>
  sendDraft(principal: Principal, messageId: string, sendAt?: string): Effect.Effect<typeof D.Message.Type, SendError>
  listApprovals(principal: Principal): Effect.Effect<Array<typeof D.Message.Type>, Forbidden>
  approve(principal: Principal, messageId: string): Effect.Effect<typeof D.Message.Type, SendError>
  reject(principal: Principal, messageId: string, reason?: string): Effect.Effect<typeof D.Message.Type, NotFound | Forbidden | Conflict>
  /** Send every scheduled message that is due. Safe to run on several instances. */
  readonly processScheduled: Effect.Effect<number>
  /** Deliver a copy of a stored message to `to` on behalf of its inbox (forward rules). */
  forwardCopy(messageId: string, to: string): Effect.Effect<void>
  wait(
    principal: Principal,
    options: { inboxId?: string | undefined; since?: string | undefined; timeout?: number | undefined; from?: string | undefined; subject?: string | undefined }
  ): Effect.Effect<typeof D.WaitResult.Type, NotFound>
  listThreads(principal: Principal, filters: { inboxId?: string | undefined; agentId?: string | undefined; limit?: number | undefined; cursor?: string | undefined }): Effect.Effect<typeof D.ThreadPage.Type>
  getThread(principal: Principal, threadId: string): Effect.Effect<typeof D.ThreadWithMessages.Type, NotFound>
  /** Deliver a raw RFC 5322 message to every matching AGMX inbox among `recipients`. */
  ingestRaw(raw: Buffer, recipients: ReadonlyArray<string>, verdicts?: Verdicts): Effect.Effect<{ delivered: number; inboxIds: Array<string> }>
  /** Apply an SES delivery/bounce/complaint event to the matching outbound message. */
  applyDeliveryEvent(providerMessageId: string, event: "delivered" | "bounced" | "complained", detail: string | null): Effect.Effect<void>
}>()("agmx/services/Mail") {
  static readonly layer = Layer.effect(
    Mail,
    Effect.gen(function* () {
      const db = yield* Db
      const quota = yield* Quota
      const transport = yield* MailTransport
      const events = yield* Events
      const webhooks = yield* Webhooks
      const agentsService = yield* Agents
      const storage = yield* Storage

      /**
       * Upload attachment bytes to object storage (when configured) and build the
       * rows to insert. Runs before the DB transaction; the returned `cleanup`
       * removes uploaded objects if the transaction later fails.
       */
      const prepareAttachments = (
        userId: string,
        messageId: string,
        files: ReadonlyArray<{ filename: string; contentType: string; content: Buffer; contentId?: string | null; inline?: boolean; extractedText?: string | null }>
      ) =>
        Effect.gen(function* () {
          const rows = yield* Effect.forEach(
            files,
            (f) =>
              Effect.gen(function* () {
                const id = newId("att")
                const storageKey = yield* storage.put(`attachments/${userId}/${messageId}/${id}`, f.content, f.contentType)
                return {
                  id,
                  userId,
                  messageId,
                  filename: f.filename,
                  contentType: f.contentType,
                  size: f.content.byteLength,
                  contentId: f.contentId ?? null,
                  inline: f.inline ?? false,
                  content: storageKey ? null : f.content,
                  storageKey,
                  extractedText: f.extractedText ?? null
                }
              }),
            { concurrency: 4 }
          )
          const keys = rows.flatMap((r) => (r.storageKey ? [r.storageKey] : []))
          return { rows, cleanup: storage.remove(keys) }
        })

      /** Attachment bytes, wherever they are stored. */
      const attachmentBytes = (row: { content: Buffer | null; storageKey: string | null }) =>
        row.content ? Effect.succeed(row.content) : storage.get(row.storageKey!)

      // ---------------------------------------------------------------------
      // Helpers
      // ---------------------------------------------------------------------

      const scopeCondition = (principal: Principal): SQL => {
        const base = eq(messages.userId, principal.userId)
        if (!principal.agentId) return base
        return and(base, inArray(messages.inboxId, db_inboxIdsForAgent(principal.agentId)))!
      }
      const db_inboxIdsForAgent = (agentId: string) =>
        sql`(select ${inboxes.id} from ${inboxes} where ${inboxes.agentId} = ${agentId})`

      const loadAttachments = (messageIds: ReadonlyArray<string>) =>
        messageIds.length === 0
          ? Effect.succeed([] as Array<{ id: string; messageId: string; filename: string; contentType: string; size: number; contentId: string | null; inline: boolean; extractedText: string | null }>)
          : db.use((d) => d.select(attachmentMetaColumns).from(attachments).where(inArray(attachments.messageId, [...messageIds])))

      const requireMessage = (principal: Principal, messageId: string) =>
        Effect.gen(function* () {
          const [row] = yield* db.use((d) =>
            d.select().from(messages).where(and(eq(messages.id, messageId), scopeCondition(principal))).limit(1)
          )
          if (!row) return yield* new NotFound({ message: "Message not found.", resource: "message" })
          return row
        })

      const fullMessage = (row: MessageRow) =>
        loadAttachments([row.id]).pipe(Effect.map((atts) => toMessage(row, atts)))

      /** Recompute a thread's denormalised counters from its messages. Deletes empty threads. */
      const refreshThread = (threadId: string) =>
        db.use(async (d) => {
          const all = await d
            .select({
              status: messages.status,
              direction: messages.direction,
              isRead: messages.isRead,
              isSpam: messages.isSpam,
              fromAddress: messages.fromAddress,
              fromName: messages.fromName,
              to: messages.to,
              snippet: messages.snippet,
              createdAt: messages.createdAt
            })
            .from(messages)
            .where(eq(messages.threadId, threadId))
            .orderBy(asc(messages.createdAt))
          if (all.length === 0) {
            await d.delete(threads).where(eq(threads.id, threadId))
            return
          }
          // Drafts, scheduled, held and rejected mail don't count as part of the conversation yet.
          const rows = all.filter((r) => !(UNSENT_STATUSES as ReadonlyArray<string>).includes(r.status))
          if (rows.length === 0) {
            await d.update(threads).set({ messageCount: 0, unreadCount: 0 }).where(eq(threads.id, threadId))
            return
          }
          const participants = new Map<string, Address>()
          for (const r of rows) {
            participants.set(r.fromAddress, { name: r.fromName, address: r.fromAddress })
            for (const t of r.to) if (!participants.has(t.address)) participants.set(t.address, t)
          }
          const last = rows[rows.length - 1]!
          await d
            .update(threads)
            .set({
              messageCount: rows.length,
              unreadCount: rows.filter((r) => r.direction === "inbound" && !r.isRead && !r.isSpam).length,
              snippet: last.snippet,
              lastMessageAt: last.createdAt,
              participants: [...participants.values()].slice(0, 20)
            })
            .where(eq(threads.id, threadId))
        })

      /** Find the thread an inbound message belongs to, or create one. */
      const resolveThread = Effect.fn("Mail.resolveThread")(function* (inbox: InboxRow, parsed: ParsedEmail) {
        const ids = [...new Set([parsed.inReplyTo, ...parsed.references].filter((x): x is string => Boolean(x)))]
        if (ids.length) {
          const providerIds = ids.map(providerIdFromMessageId).filter((x): x is string => Boolean(x))
          const [match] = yield* db.use((d) =>
            d
              .select({ threadId: messages.threadId })
              .from(messages)
              .where(
                and(
                  eq(messages.inboxId, inbox.id),
                  or(
                    inArray(messages.rfcMessageId, ids),
                    inArray(messages.altMessageId, ids),
                    providerIds.length ? inArray(messages.providerMessageId, providerIds) : undefined
                  )
                )
              )
              .orderBy(desc(messages.createdAt))
              .limit(1)
          )
          if (match) return match.threadId
        }
        const key = subjectKey(parsed.subject)
        if (key && key !== parsed.subject.trim().toLowerCase()) {
          // Looks like a reply ("Re: …") without usable headers: match on subject + participant.
          const candidates = yield* db.use((d) =>
            d
              .select()
              .from(threads)
              .where(and(eq(threads.inboxId, inbox.id), gt(threads.lastMessageAt, new Date(Date.now() - 30 * 86_400_000))))
              .orderBy(desc(threads.lastMessageAt))
              .limit(50)
          )
          const found = candidates.find(
            (t) => subjectKey(t.subject) === key && t.participants.some((p) => p.address === parsed.from.address)
          )
          if (found) return found.id
        }
        const id = newId("thr")
        yield* db.use((d) => d.insert(threads).values({ id, userId: inbox.userId, inboxId: inbox.id, subject: parsed.subject }))
        return id
      })

      const lookupInbox = (address: string) =>
        Effect.gen(function* () {
          const [local, domain] = address.toLowerCase().split("@")
          if (!local || !domain) return null
          const [base, tag] = local.split("+", 2)
          const [row] = yield* db.use((d) =>
            d
              .select({ inbox: inboxes, agentStatus: agents.status })
              .from(inboxes)
              .innerJoin(agents, eq(agents.id, inboxes.agentId))
              .where(eq(inboxes.address, `${base}@${domain}`))
              .limit(1)
          )
          return row ? { inbox: row.inbox, agentStatus: row.agentStatus, tag: tag ?? null } : null
        })

      /** Apply the inbox's sender rules: allow-list/block decide acceptance; label/forward/webhook act after storage. */
      const evaluateRules = (inbox: InboxRow, parsed: ParsedEmail) =>
        Effect.gen(function* () {
          const rules = yield* db.use((d) =>
            d
              .select()
              .from(inboxRules)
              .where(and(eq(inboxRules.inboxId, inbox.id), eq(inboxRules.enabled, true)))
              .orderBy(asc(inboxRules.position), asc(inboxRules.createdAt))
          )
          const sender = parsed.from.address.toLowerCase()
          const domain = sender.split("@")[1] ?? ""
          const subject = parsed.subject.toLowerCase()
          const matches = (r: (typeof rules)[number]) =>
            r.field === "sender" ? sender === r.value : r.field === "domain" ? domain === r.value || domain.endsWith(`.${r.value}`) : subject.includes(r.value.toLowerCase())
          let decision: "allow" | "block" | null = null
          for (const r of rules) {
            if ((r.action === "allow" || r.action === "block") && matches(r)) {
              decision = r.action
              break
            }
          }
          const hasAllowList = rules.some((r) => r.action === "allow")
          const accept = decision === "allow" || (decision === null && !hasAllowList)
          const reason = decision === "block" ? "matched a block rule" : !accept ? "sender isn't on the inbox's allow list" : null
          const acting = rules.filter((r) => matches(r))
          return {
            accept,
            reason,
            labels: acting.filter((r) => r.action === "label" && r.target).map((r) => r.target!),
            forwards: acting.filter((r) => r.action === "forward" && r.target).map((r) => r.target!),
            webhooks: acting.filter((r) => r.action === "webhook" && r.target).map((r) => r.target!)
          }
        })

      /** Forward rules run detached so a slow send never blocks inbound delivery. */
      const forwardCopyLater = (messageId: string, to: string) =>
        Effect.forkDetach(Effect.suspend(() => forwardCopyRef.current?.(messageId, to) ?? Effect.void)).pipe(Effect.asVoid)
      const forwardCopyRef: { current: ((messageId: string, to: string) => Effect.Effect<void>) | null } = { current: null }

      /** Store one inbound copy of `parsed` in `inbox`. */
      const deliverToInbox = Effect.fn("Mail.deliverToInbox")(function* (
        inbox: InboxRow,
        parsed: ParsedEmail,
        options: { tag: string | null; verdicts: Verdicts }
      ) {
        // Temporary inboxes: expired or full inboxes stop accepting mail.
        if (inbox.expiresAt && inbox.expiresAt.getTime() < Date.now()) {
          yield* Effect.logInfo(`Dropping mail for expired inbox ${inbox.address}`)
          return null
        }
        if (inbox.maxMessages !== null) {
          const [received] = yield* db.use((d) =>
            d.select({ n: count() }).from(messages).where(and(eq(messages.inboxId, inbox.id), eq(messages.direction, "inbound")))
          )
          if ((received?.n ?? 0) >= inbox.maxMessages) {
            yield* Effect.logInfo(`Dropping mail for ${inbox.address}: reached its ${inbox.maxMessages}-message limit`)
            return null
          }
        }

        const ruling = yield* evaluateRules(inbox, parsed)
        if (!ruling.accept) {
          yield* Effect.logInfo(`Rule dropped mail for ${inbox.address} from ${parsed.from.address}: ${ruling.reason}`)
          return null
        }

        const admission = yield* quota.admitInbound(inbox.userId, parsed.sizeBytes)
        if (!admission.ok) {
          yield* quota.recordDropped(inbox.userId, 1)
          yield* Effect.logWarning(`Dropped inbound mail for ${inbox.address} from ${parsed.from.address}: ${admission.reason}`)
          return null
        }
        const messageId = newId("msg")
        const isSpam = options.verdicts.spam === "FAIL" || options.verdicts.virus === "FAIL"

        // Security first, then extract only from what a human would actually see.
        const scan = analyzeSecurity(parsed.subject, parsed.text, parsed.html)
        const calendars = parsed.attachments.filter((a) => isCalendar(a.contentType, a.filename)).map((a) => a.content.toString("utf8"))
        const files = yield* Effect.forEach(
          parsed.attachments,
          (a) => Effect.promise(() => attachmentText(a.contentType, a.filename, a.content)).pipe(Effect.map((extractedText) => ({ ...a, extractedText }))),
          { concurrency: 2 }
        )
        const extracted = extract(parsed.subject, scan.safeText, scan.visibleHtml, {
          calendars,
          merchant: parsed.from.name || parsed.from.address.split("@")[1] || null
        })
        const prepared = yield* prepareAttachments(inbox.userId, messageId, files)
        const threadId = yield* db.transaction(
          Effect.gen(function* () {
            const threadId = yield* resolveThread(inbox, parsed)
            yield* db.use((d) =>
              d.insert(messages).values({
                id: messageId,
                userId: inbox.userId,
                inboxId: inbox.id,
                threadId,
                direction: "inbound",
                status: "received",
                rfcMessageId: parsed.messageId,
                inReplyTo: parsed.inReplyTo,
                references: parsed.references,
                fromAddress: parsed.from.address,
                fromName: parsed.from.name ?? null,
                to: parsed.to,
                cc: parsed.cc,
                replyTo: parsed.replyTo,
                subject: parsed.subject,
                text: parsed.text,
                html: parsed.html,
                snippet: makeSnippet(parsed.text, parsed.html),
                headers: parsed.headers,
                extracted,
                security: scan.security,
                safeText: scan.safeText,
                verdicts: options.verdicts,
                labels: [...new Set([...(options.tag ? [options.tag] : []), ...ruling.labels])],
                isSpam,
                sizeBytes: parsed.sizeBytes
              })
            )
            if (prepared.rows.length) yield* db.use((d) => d.insert(attachments).values(prepared.rows))
            yield* refreshThread(threadId)
            yield* db.use((d) => d.update(inboxes).set({ lastMessageAt: new Date() }).where(eq(inboxes.id, inbox.id)))
            yield* quota.recordReceived(inbox.userId, 1)
            return threadId
          })
        ).pipe(Effect.onError(() => prepared.cleanup))
        yield* events.publish({ type: "message.received", userId: inbox.userId, inboxId: inbox.id, messageId, threadId })
        const [row] = yield* db.use((d) => d.select().from(messages).where(eq(messages.id, messageId)))
        if (row && !isSpam) {
          yield* webhooks.enqueue(inbox.agentId, "message.received", {
            inbox: { id: inbox.id, address: inbox.address },
            message: toMessageSummary(row, parsed.attachments.length)
          })
        }
        if (row) {
          for (const url of ruling.webhooks)
            yield* webhooks.enqueue(inbox.agentId, "message.received", { inbox: { id: inbox.id, address: inbox.address }, message: toMessageSummary(row, parsed.attachments.length) }, url)
          for (const to of ruling.forwards) yield* forwardCopyLater(messageId, to)
        }
        if (inbox.maxMessages !== null) {
          const [received] = yield* db.use((d) =>
            d.select({ n: count() }).from(messages).where(and(eq(messages.inboxId, inbox.id), eq(messages.direction, "inbound")))
          )
          if ((received?.n ?? 0) >= inbox.maxMessages) yield* db.use((d) => d.update(inboxes).set({ status: "closed" }).where(eq(inboxes.id, inbox.id)))
        }
        return messageId
      })

      const ingestParsed = Effect.fn("Mail.ingestParsed")(function* (
        parsed: ParsedEmail,
        recipients: ReadonlyArray<string>,
        verdicts: Verdicts
      ) {
        const inboxIds: Array<string> = []
        const seen = new Set<string>()
        for (const recipient of recipients) {
          const match = yield* lookupInbox(recipient)
          if (!match || seen.has(match.inbox.id)) continue
          seen.add(match.inbox.id)
          if (match.inbox.status !== "active" || match.agentStatus !== "active") {
            yield* Effect.logInfo(`Dropping mail for paused inbox ${match.inbox.address}`)
            continue
          }
          const delivered = yield* deliverToInbox(match.inbox, parsed, { tag: match.tag, verdicts })
          if (delivered) inboxIds.push(match.inbox.id)
        }
        return { delivered: inboxIds.length, inboxIds }
      })

      // ---------------------------------------------------------------------
      // Sending
      // ---------------------------------------------------------------------

      const resolveSender = Effect.fn("Mail.resolveSender")(function* (principal: Principal, from: string | undefined) {
        if (from) return yield* agentsService.requireInbox(principal, formatSenderKey(from))
        if (principal.agentId) {
          const rows = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.agentId, principal.agentId!)).limit(2))
          if (rows.length === 1) return rows[0]!
          if (rows.length === 0)
            return yield* new InvalidRequest({ message: "This agent has no inbox yet. Create one with POST /api/v1/inboxes.", field: "from" })
        }
        return yield* new InvalidRequest({ message: "`from` is required: pass an inbox id or address you own.", field: "from" })
      })

      const formatSenderKey = (from: string) => {
        const match = from.match(/<([^>]+)>/)
        return (match ? match[1]! : from).trim()
      }

      const decodeFiles = (list: OutgoingInput["attachments"]) =>
        Effect.gen(function* () {
          const files: Array<{ filename: string; contentType: string; content: Buffer }> = []
          for (const a of list ?? []) {
            const content = typeof a.content === "string" ? Buffer.from(a.content, "base64") : a.content
            if (content.byteLength === 0 && typeof a.content === "string" && a.content.length > 0)
              return yield* new InvalidRequest({ message: `Attachment ${a.filename} is not valid base64.`, field: "attachments" })
            files.push({ filename: a.filename.replace(/[\r\n"]/g, "_"), contentType: a.contentType || "application/octet-stream", content })
          }
          return files
        })

      const parseSendAt = (value: string | undefined) => {
        if (value === undefined || value === "") return Effect.succeed(null as Date | null)
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return Effect.fail(new InvalidRequest({ message: "`sendAt` must be an ISO timestamp.", field: "sendAt" }))
        if (date.getTime() > Date.now() + 30 * 86_400_000)
          return Effect.fail(new InvalidRequest({ message: "`sendAt` can be at most 30 days ahead.", field: "sendAt" }))
        // Times in the past (or within a few seconds) mean "now".
        return Effect.succeed(date.getTime() <= Date.now() + 5_000 ? null : date)
      }

      const suppressedAmong = (addresses: ReadonlyArray<string>) =>
        addresses.length === 0
          ? Effect.succeed([] as Array<{ address: string; reason: string }>)
          : db.use((d) =>
              d
                .select({ address: suppressions.address, reason: suppressions.reason })
                .from(suppressions)
                .where(inArray(sql`lower(${suppressions.address})`, [...addresses]))
            )

      /** True when the inbox has exchanged mail with `address` before. */
      const isKnownContact = (inboxId: string, address: string) =>
        db
          .use((d) =>
            d
              .select({ id: messages.id })
              .from(messages)
              .where(
                and(
                  eq(messages.inboxId, inboxId),
                  or(
                    and(eq(messages.direction, "inbound"), eq(messages.fromAddress, address)),
                    and(
                      eq(messages.direction, "outbound"),
                      inArray(messages.status, [...DELIVERED_STATUSES]),
                      or(
                        sql`${messages.to} @> ${JSON.stringify([{ address }])}::jsonb`,
                        sql`${messages.cc} @> ${JSON.stringify([{ address }])}::jsonb`,
                        sql`${messages.bcc} @> ${JSON.stringify([{ address }])}::jsonb`
                      )
                    )
                  )
                )
              )
              .limit(1)
          )
          .pipe(Effect.map((rows) => rows.length > 0))

      /**
       * The agent's send policy. Only agent-scoped keys are subject to it: humans
       * (dashboard sessions) and account keys act on their own authority.
       */
      const approvalReason = Effect.fn("Mail.approvalReason")(function* (
        principal: Principal,
        agent: AgentRow,
        inbox: InboxRow,
        recipients: ReadonlyArray<string>,
        hasAttachments: boolean
      ) {
        if (principal.kind !== "agent_key") return null
        if (agent.sendPolicy === "all") return "This agent's send policy requires approval for every message."
        if (agent.approveAttachments && hasAttachments) return "This agent's send policy requires approval for messages with attachments."
        if (agent.sendPolicy === "first_contact") {
          for (const address of recipients) {
            if (!(yield* isKnownContact(inbox.id, address))) return `${address} hasn't exchanged mail with ${inbox.address} before.`
          }
        }
        return null
      })

      interface Recipients {
        to: Array<ParsedAddress>
        cc: Array<ParsedAddress>
        bcc: Array<ParsedAddress>
        replyTo: Array<ParsedAddress>
      }

      const parseRecipients = (input: Pick<OutgoingInput, "to" | "cc" | "bcc" | "replyTo">) =>
        Effect.gen(function* () {
          const to = parseAddressList(input.to)
          const cc = parseAddressList(input.cc)
          const bcc = parseAddressList(input.bcc)
          const replyTo = parseAddressList(input.replyTo)
          const invalid = [...to.invalid, ...cc.invalid, ...bcc.invalid, ...replyTo.invalid]
          if (invalid.length) return yield* new InvalidRequest({ message: `Invalid address: ${invalid.join(", ")}`, field: "to" })
          return { to: to.valid, cc: cc.valid, bcc: bcc.valid, replyTo: replyTo.valid } satisfies Recipients
        })

      /** Checks that make a message sendable (as opposed to a draft). */
      const assertSendable = (r: Recipients, body: { text: string | null; html: string | null; attachmentCount: number }) =>
        Effect.gen(function* () {
          const all = [...r.to, ...r.cc, ...r.bcc]
          if (all.length === 0) return yield* new InvalidRequest({ message: "Add at least one recipient.", field: "to" })
          if (all.length > 50) return yield* new InvalidRequest({ message: "At most 50 recipients per message.", field: "to" })
          if (!body.text?.trim() && !body.html?.trim() && body.attachmentCount === 0)
            return yield* new InvalidRequest({ message: "Provide `text`, `html` or at least one attachment.", field: "text" })
          const suppressed = yield* suppressedAmong(all.map((a) => a.address))
          if (suppressed.length)
            return yield* new InvalidRequest({
              message: `Not sending to suppressed address${suppressed.length > 1 ? "es" : ""}: ${suppressed.map((s) => `${s.address} (${s.reason})`).join(", ")}`,
              field: "to"
            })
          return all
        })

      const loadAgentFor = (inbox: InboxRow) =>
        db.use((d) => d.select().from(agents).where(eq(agents.id, inbox.agentId)).limit(1)).pipe(Effect.map((rows) => rows[0]!))

      const notifyHeld = (row: MessageRow, reason: string) =>
        Effect.gen(function* () {
          yield* events.publish({ type: "message.status", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
          const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, row.inboxId)))
          if (inbox)
            yield* webhooks.enqueue(inbox.agentId, "message.held", {
              inbox: { id: inbox.id, address: inbox.address },
              message: toMessageSummary(row, 0),
              reason
            })
        })

      /**
       * Validate and store an outbound message. Drafts skip send validation;
       * everything else is checked, run through the agent's send policy and stored
       * as `pending_approval`, `scheduled` or `sending`.
       */
      const createOutbound = Effect.fn("Mail.createOutbound")(function* (
        principal: Principal,
        input: OutgoingInput,
        context: SendContext,
        mode: "send" | "draft"
      ): Effect.fn.Return<{ row: MessageRow; heldReason: string | null; created: boolean }, SendError> {
        const inbox = context.inbox ?? (yield* resolveSender(principal, input.from))
        if (!canAccessAgent(principal, inbox.agentId)) return yield* new NotFound({ message: "Inbox not found.", resource: "inbox" })
        const agent = yield* loadAgentFor(inbox)
        if (mode === "send" && (inbox.status !== "active" || agent.status !== "active"))
          return yield* new Forbidden({ message: `${inbox.address} is paused. Resume it before sending.` })

        const recipients = yield* parseRecipients(input)
        const files = yield* decodeFiles(input.attachments)
        const subject = (input.subject ?? "").replace(/[\r\n]+/g, " ").trim()
        const text = input.text ?? (input.html ? htmlToText(input.html) : null)
        const sendAt = yield* parseSendAt(input.sendAt)

        let status: OutboundStatus = "draft"
        let heldReason: string | null = null
        if (mode === "send") {
          const all = yield* assertSendable(recipients, { text, html: input.html ?? null, attachmentCount: files.length })
          heldReason = yield* approvalReason(principal, agent, inbox, all.map((a) => a.address), files.length > 0)
          status = heldReason ? "pending_approval" : sendAt ? "scheduled" : "sending"
        }

        const messageId = newId("msg")
        const prepared = yield* prepareAttachments(inbox.userId, messageId, files)
        const row = yield* db
          .transaction(
            Effect.gen(function* () {
              const threadId = context.threadId ?? newId("thr")
              if (!context.threadId)
                yield* db.use((d) => d.insert(threads).values({ id: threadId, userId: inbox.userId, inboxId: inbox.id, subject }))
              const inserted = yield* db.useUnique((d) =>
                d
                  .insert(messages)
                  .values({
                    id: messageId,
                    userId: inbox.userId,
                    inboxId: inbox.id,
                    threadId,
                    direction: "outbound",
                    status,
                    inReplyTo: context.inReplyTo ?? null,
                    references: context.references ?? [],
                    fromAddress: inbox.address,
                    fromName: inbox.displayName,
                    to: recipients.to,
                    cc: recipients.cc,
                    bcc: recipients.bcc,
                    replyTo: recipients.replyTo,
                    subject,
                    text,
                    html: input.html ?? null,
                    snippet: makeSnippet(text, input.html),
                    headers: input.headers ?? {},
                    labels: [...(input.labels ?? [])],
                    isRead: true,
                    sendAt,
                    idempotencyKey: context.idempotencyKey ?? null,
                    sizeBytes: files.reduce((n, f) => n + f.content.byteLength, (text ?? "").length + (input.html ?? "").length)
                  })
                  .returning()
              )
              if (inserted === null) return null
              if (prepared.rows.length) yield* db.use((d) => d.insert(attachments).values(prepared.rows))
              yield* refreshThread(threadId)
              return inserted[0]!
            })
          )
          .pipe(Effect.onError(() => prepared.cleanup))
        if (row === null) {
          // Lost an idempotency race: return the message the other request created.
          yield* prepared.cleanup
          const existing = yield* findIdempotent(inbox.userId, context.idempotencyKey!)
          return { row: existing!, heldReason: null, created: false }
        }
        return { row, heldReason, created: true }
      })

      const findIdempotent = (userId: string, key: string) =>
        db
          .use((d) => d.select().from(messages).where(and(eq(messages.userId, userId), eq(messages.idempotencyKey, key))).limit(1))
          .pipe(Effect.map((rows) => rows[0] ?? null))

      /** Atomically move a message between statuses; returns null if it wasn't in `from`. */
      const transition = (id: string, from: ReadonlyArray<OutboundStatus>, set: Partial<typeof messages.$inferInsert>) =>
        db
          .use((d) =>
            d
              .update(messages)
              .set(set)
              .where(and(eq(messages.id, id), inArray(messages.status, [...from])))
              .returning()
          )
          .pipe(Effect.map((rows) => rows[0] ?? null))

      /**
       * Deliver a stored message whose status is `sending`: compose MIME, reserve
       * quota, hand external recipients to SES and deliver AGMX recipients internally.
       */
      const dispatch = Effect.fn("Mail.dispatch")(function* (row: MessageRow): Effect.fn.Return<typeof D.Message.Type, SendError> {
        const fail = (message: string, refund = 0) =>
          Effect.gen(function* () {
            yield* db.use((d) => d.update(messages).set({ status: "failed", error: message }).where(eq(messages.id, row.id)))
            if (refund) yield* quota.refundSends(row.userId, refund)
            yield* events.publish({ type: "message.status", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
          })

        const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, row.inboxId)))
        if (!inbox) return yield* new NotFound({ message: "Inbox not found.", resource: "inbox" })
        const all = [...row.to, ...row.cc, ...row.bcc]
        const suppressed = yield* suppressedAmong(all.map((a) => a.address))
        if (suppressed.length) {
          const message = `Not sending to suppressed address: ${suppressed.map((s) => `${s.address} (${s.reason})`).join(", ")}`
          yield* fail(message)
          return yield* new InvalidRequest({ message, field: "to" })
        }

        const stored = yield* db.use((d) =>
          d
            .select({ filename: attachments.filename, contentType: attachments.contentType, content: attachments.content, storageKey: attachments.storageKey })
            .from(attachments)
            .where(eq(attachments.messageId, row.id))
        )
        const files = yield* Effect.forEach(stored, (f) =>
          attachmentBytes(f).pipe(Effect.map((content) => ({ filename: f.filename, contentType: f.contentType, content })))
        )
        const rfcMessageId = `<${newId("msg").replace("msg_", "")}@${inbox.domain}>`
        const fromAddress: ParsedAddress = { name: inbox.displayName, address: inbox.address }
        const raw = yield* Effect.promise(() =>
          composeMime({
            from: fromAddress,
            to: row.to.map((a) => ({ name: a.name ?? null, address: a.address })),
            cc: row.cc.map((a) => ({ name: a.name ?? null, address: a.address })),
            bcc: row.bcc.map((a) => ({ name: a.name ?? null, address: a.address })),
            replyTo: row.replyTo.map((a) => ({ name: a.name ?? null, address: a.address })),
            subject: row.subject,
            text: row.text,
            html: row.html,
            messageId: rfcMessageId,
            inReplyTo: row.inReplyTo,
            references: row.references,
            headers: row.headers,
            attachments: files
          })
        )
        const sizeCheck = yield* quota.checkMessageSize(inbox.userId, raw.byteLength).pipe(Effect.result)
        if (sizeCheck._tag === "Failure") {
          yield* fail(sizeCheck.failure.message)
          return yield* sizeCheck.failure
        }

        const local: Array<string> = []
        const external: Array<string> = []
        for (const r of all) {
          const match = yield* lookupInbox(r.address)
          if (match) local.push(r.address)
          else external.push(r.address)
        }

        const reserved = yield* db
          .transaction(
            Effect.gen(function* () {
              yield* quota.reserveSends(inbox.userId, all.length)
              yield* db.use((d) => d.update(messages).set({ rfcMessageId, sizeBytes: raw.byteLength, error: null }).where(eq(messages.id, row.id)))
            })
          )
          .pipe(Effect.result)
        if (reserved._tag === "Failure") {
          yield* fail(reserved.failure.message)
          return yield* reserved.failure
        }

        let providerMessageId: string | null = null
        if (external.length) {
          const result = yield* transport
            .send({ from: formatAddress(fromAddress), recipients: external, raw })
            .pipe(Effect.tapError((error) => fail(error.message, all.length)))
          providerMessageId = result.providerMessageId
        }
        if (local.length) {
          const parsed = yield* Effect.promise(() => parseMime(raw))
          yield* ingestParsed(parsed, local, {})
        }

        const usedSes = transport.name === "ses" && providerMessageId !== null
        const [sent] = yield* db.use((d) =>
          d
            .update(messages)
            .set({
              status: "sent",
              providerMessageId,
              rfcMessageId: usedSes ? `<${providerMessageId}@${sesMessageIdDomain()}>` : rfcMessageId,
              altMessageId: usedSes ? rfcMessageId : null,
              createdAt: new Date()
            })
            .where(eq(messages.id, row.id))
            .returning()
        )
        yield* refreshThread(row.threadId)
        yield* db.use((d) => d.update(inboxes).set({ lastMessageAt: new Date() }).where(eq(inboxes.id, inbox.id)))
        yield* events.publish({ type: "message.sent", userId: inbox.userId, inboxId: inbox.id, messageId: row.id, threadId: row.threadId })
        yield* webhooks.enqueue(inbox.agentId, "message.sent", {
          inbox: { id: inbox.id, address: inbox.address },
          message: toMessageSummary(sent!, files.length)
        })
        return yield* fullMessage(sent!)
      })

      /** Create and, when allowed, immediately deliver. Idempotent when a key is given. */
      const sendInternal = Effect.fn("Mail.send")(function* (
        principal: Principal,
        input: OutgoingInput,
        context: SendContext = {}
      ): Effect.fn.Return<typeof D.Message.Type, SendError> {
        if (context.idempotencyKey) {
          if (context.idempotencyKey.length > 200)
            return yield* new InvalidRequest({ message: "Idempotency keys can be at most 200 characters.", field: "idempotencyKey" })
          const existing = yield* findIdempotent(principal.userId, context.idempotencyKey)
          if (existing) return yield* fullMessage(existing)
        }
        const { row, heldReason, created } = yield* createOutbound(principal, input, context, "send")
        if (!created) return yield* fullMessage(row)
        if (row.status === "sending") return yield* dispatch(row)
        if (heldReason) yield* notifyHeld(row, heldReason)
        else yield* events.publish({ type: "message.status", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
        return yield* fullMessage(row)
      })

      const requireOutbound = (principal: Principal, messageId: string, statuses: ReadonlyArray<OutboundStatus>, what: string) =>
        Effect.gen(function* () {
          const row = yield* requireMessage(principal, messageId)
          if (row.direction !== "outbound" || !statuses.includes(row.status as OutboundStatus))
            return yield* new Conflict({ message: `This message is ${row.status.replace("_", " ")}, so it can't be ${what}.` })
          return row
        })

      /** Subject, quoted body and attachments for forwarding `original`. */
      const forwardContent = (original: MessageRow) =>
        Effect.gen(function* () {
          const stored = yield* db.use((d) =>
            d
              .select({ filename: attachments.filename, contentType: attachments.contentType, content: attachments.content, storageKey: attachments.storageKey })
              .from(attachments)
              .where(eq(attachments.messageId, original.id))
          )
          const files = yield* Effect.forEach(stored, (f) =>
            attachmentBytes(f).pipe(Effect.map((content) => ({ filename: f.filename, contentType: f.contentType, content })))
          )
          const header = [
            "---------- Forwarded message ---------",
            `From: ${formatAddress({ name: original.fromName, address: original.fromAddress })}`,
            `Date: ${original.createdAt.toUTCString()}`,
            `Subject: ${original.subject}`,
            `To: ${original.to.map(formatAddress).join(", ")}`
          ].join("\n")
          const body = original.safeText ?? original.text ?? (original.html ? htmlToText(original.html) : "")
          return {
            subject: /^fwd?:/i.test(original.subject) ? original.subject : `Fwd: ${original.subject}`,
            text: `\n\n${header}\n\n${body}`,
            html: (note: string | undefined) =>
              original.html
                ? `${note ? `<p>${escapeHtml(note).replace(/\n/g, "<br>")}</p>` : ""}<div style="color:#666;white-space:pre-line">${escapeHtml(header)}</div><br>${original.html}`
                : undefined,
            files
          }
        })

      /** Prefill recipients/subject/thread for a reply draft. */
      const replyContext = (principal: Principal, originalId: string, replyAll: boolean) =>
        Effect.gen(function* () {
          const original = yield* requireMessage(principal, originalId)
          const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, original.inboxId)).limit(1))
          if (!inbox) return yield* new NotFound({ message: "Inbox not found.", resource: "inbox" })
          const primary: Array<Address> =
            original.direction === "inbound"
              ? original.replyTo.length
                ? original.replyTo
                : [{ name: original.fromName, address: original.fromAddress }]
              : original.to
          const primarySet = new Set(primary.map((a) => a.address))
          const cc = replyAll ? [...original.to, ...original.cc].filter((a) => a.address !== inbox.address && !primarySet.has(a.address)) : []
          return {
            original,
            inbox,
            to: primary.map(formatAddress),
            cc: cc.map(formatAddress),
            subject: /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`,
            context: {
              inbox,
              threadId: original.threadId,
              inReplyTo: original.rfcMessageId,
              references: [...original.references, ...(original.rfcMessageId ? [original.rfcMessageId] : [])].slice(-20)
            } satisfies SendContext
          }
        })

      // ---------------------------------------------------------------------
      // Service
      // ---------------------------------------------------------------------

      const forwardCopy = (messageId: string, to: string) =>
        Effect.gen(function* () {
          const [original] = yield* db.use((d) => d.select().from(messages).where(eq(messages.id, messageId)).limit(1))
          if (!original) return
          const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, original.inboxId)).limit(1))
          if (!inbox) return
          const content = yield* forwardContent(original)
          // Rules are configured by the account owner, so they act with account authority (no send policy).
          const owner: Principal = { userId: inbox.userId, email: "", role: "user", plan: "free", kind: "account_key", agentId: null, apiKeyId: null }
          yield* sendInternal(owner, { to, subject: content.subject, text: content.text, html: content.html(undefined), attachments: content.files }, { inbox }).pipe(
            Effect.catch((error) => Effect.logWarning(`Forward rule for ${inbox.address} → ${to} failed: ${error.message}`))
          )
        })
      forwardCopyRef.current = forwardCopy

      return Mail.of({
        list: Effect.fn("Mail.list")(function* (principal, filters) {
          const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100)
          const conditions: Array<SQL | undefined> = [scopeCondition(principal)]
          if (filters.inboxId) conditions.push(eq(messages.inboxId, filters.inboxId))
          if (filters.agentId) conditions.push(inArray(messages.inboxId, db_inboxIdsForAgent(filters.agentId)))
          if (filters.threadId) conditions.push(eq(messages.threadId, filters.threadId))
          if (filters.direction) conditions.push(eq(messages.direction, filters.direction))
          switch (filters.folder) {
            case "inbox":
              conditions.push(eq(messages.direction, "inbound"), eq(messages.isArchived, false), eq(messages.isSpam, false))
              break
            case "sent":
              conditions.push(eq(messages.direction, "outbound"), notInArray(messages.status, [...UNSENT_STATUSES]))
              break
            case "drafts":
              conditions.push(eq(messages.status, "draft"))
              break
            case "scheduled":
              conditions.push(eq(messages.status, "scheduled"))
              break
            case "pending":
              conditions.push(inArray(messages.status, ["pending_approval", "rejected"]))
              break
            case "starred":
              conditions.push(eq(messages.isStarred, true))
              break
            case "archived":
              conditions.push(eq(messages.isArchived, true))
              break
            case "spam":
              conditions.push(eq(messages.isSpam, true))
              break
          }
          if (!filters.folder || filters.folder === "all" || ["starred", "archived", "spam", "inbox"].includes(filters.folder))
            conditions.push(notInArray(messages.status, ["draft"]))
          if (filters.unread === "true") conditions.push(eq(messages.isRead, false))
          if (filters.unread === "false") conditions.push(eq(messages.isRead, true))
          if (filters.since) {
            const since = new Date(filters.since)
            if (!Number.isNaN(since.getTime())) conditions.push(gt(messages.createdAt, since))
          }
          if (filters.q?.trim()) {
            const pattern = `%${filters.q.trim().replace(/[%_]/g, "\\$&")}%`
            conditions.push(
              or(
                ilike(messages.subject, pattern),
                ilike(messages.text, pattern),
                ilike(messages.fromAddress, pattern),
                ilike(messages.fromName, pattern),
                sql`${messages.to}::text ilike ${pattern}`
              )
            )
          }
          const cursor = filters.cursor ? decodeCursor(filters.cursor) : null
          if (cursor)
            conditions.push(
              or(lt(messages.createdAt, cursor.createdAt), and(eq(messages.createdAt, cursor.createdAt), lt(messages.id, cursor.id)))
            )

          const rows = yield* db.use((d) =>
            d
              .select({
                message: messages,
                attachmentCount: sql<number>`(select count(*)::int from ${attachments} where ${attachments.messageId} = ${messages.id})`
              })
              .from(messages)
              .where(and(...conditions))
              .orderBy(desc(messages.createdAt), desc(messages.id))
              .limit(limit + 1)
          )
          const page = rows.slice(0, limit)
          return {
            messages: page.map((r) => toMessageSummary(r.message, r.attachmentCount)),
            nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]!.message) : null
          }
        }),

        get: Effect.fn("Mail.get")(function* (principal, messageId, markRead = false) {
          let row = yield* requireMessage(principal, messageId)
          if (markRead && !row.isRead) {
            const [updated] = yield* db.use((d) => d.update(messages).set({ isRead: true }).where(eq(messages.id, row.id)).returning())
            row = updated!
            yield* refreshThread(row.threadId)
            yield* events.publish({ type: "message.updated", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
          }
          return yield* fullMessage(row)
        }),

        update: Effect.fn("Mail.update")(function* (principal, messageId, patch) {
          const row = yield* requireMessage(principal, messageId)
          const set: Partial<typeof messages.$inferInsert> = {}
          if (patch.isRead !== undefined) set.isRead = patch.isRead
          if (patch.isStarred !== undefined) set.isStarred = patch.isStarred
          if (patch.isArchived !== undefined) set.isArchived = patch.isArchived
          if (patch.isSpam !== undefined) set.isSpam = patch.isSpam
          if (patch.labels !== undefined) set.labels = [...new Set(patch.labels.map((l) => l.trim().toLowerCase()).filter(Boolean))].slice(0, 20)
          const [updated] = Object.keys(set).length
            ? yield* db.use((d) => d.update(messages).set(set).where(eq(messages.id, row.id)).returning())
            : [row]
          yield* refreshThread(row.threadId)
          yield* events.publish({ type: "message.updated", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
          const [att] = yield* db.use((d) => d.select({ n: count() }).from(attachments).where(eq(attachments.messageId, row.id)))
          return toMessageSummary(updated!, att?.n ?? 0)
        }),

        remove: Effect.fn("Mail.remove")(function* (principal, messageId) {
          const row = yield* requireMessage(principal, messageId)
          yield* db.use((d) => d.delete(messages).where(eq(messages.id, row.id)))
          yield* refreshThread(row.threadId)
          yield* events.publish({ type: "message.deleted", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
        }),

        attachment: Effect.fn("Mail.attachment")(function* (principal, messageId, attachmentId) {
          yield* requireMessage(principal, messageId)
          const [row] = yield* db.use((d) =>
            d
              .select({ filename: attachments.filename, contentType: attachments.contentType, content: attachments.content, storageKey: attachments.storageKey })
              .from(attachments)
              .where(and(eq(attachments.id, attachmentId), eq(attachments.messageId, messageId)))
              .limit(1)
          )
          if (!row) return yield* new NotFound({ message: "Attachment not found.", resource: "attachment" })
          return row
        }),

        send: (principal, input, idempotencyKey) =>
          sendInternal(principal, input, { idempotencyKey: idempotencyKey ?? (input as { idempotencyKey?: string }).idempotencyKey }),

        reply: Effect.fn("Mail.reply")(function* (principal, messageId, input, idempotencyKey) {
          const r = yield* replyContext(principal, messageId, Boolean(input.replyAll))
          const original = r.original
          const header = `On ${original.createdAt.toUTCString()}, ${formatAddress({ name: original.fromName, address: original.fromAddress })} wrote:`
          const body = input.text ?? (input.html ? htmlToText(input.html) : "")
          const html = input.html
            ? `${input.html}<br><div style="color:#666">${escapeHtml(header)}</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${original.html ?? escapeHtml(original.text ?? "").replace(/\n/g, "<br>")}</blockquote>`
            : undefined
          return yield* sendInternal(
            principal,
            {
              to: r.to,
              cc: r.cc,
              subject: r.subject,
              text: `${body}${quoteText(header, original.safeText ?? original.text ?? (original.html ? htmlToText(original.html) : ""))}`,
              html,
              attachments: input.attachments,
              sendAt: input.sendAt
            },
            { ...r.context, idempotencyKey: idempotencyKey ?? input.idempotencyKey }
          )
        }),

        forward: Effect.fn("Mail.forward")(function* (principal, messageId, input, idempotencyKey) {
          const original = yield* requireMessage(principal, messageId)
          const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, original.inboxId)).limit(1))
          if (!inbox) return yield* new NotFound({ message: "Inbox not found.", resource: "inbox" })
          const content = yield* forwardContent(original)
          return yield* sendInternal(
            principal,
            { to: input.to, subject: content.subject, text: `${input.text ?? ""}${content.text}`, html: content.html(input.text), attachments: content.files, sendAt: input.sendAt },
            { inbox, threadId: original.threadId, references: original.rfcMessageId ? [original.rfcMessageId] : [], idempotencyKey: idempotencyKey ?? input.idempotencyKey }
          )
        }),

        forwardCopy,

        cancelScheduled: Effect.fn("Mail.cancelScheduled")(function* (principal, messageId) {
          yield* requireOutbound(principal, messageId, ["scheduled"], "cancelled")
          const row = yield* transition(messageId, ["scheduled"], { status: "draft", sendAt: null })
          if (!row) return yield* new Conflict({ message: "This message is already being sent." })
          yield* events.publish({ type: "message.status", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
          return yield* fullMessage(row)
        }),

        createDraft: Effect.fn("Mail.createDraft")(function* (principal, input) {
          if (input.replyToMessageId) {
            const r = yield* replyContext(principal, input.replyToMessageId, Boolean(input.replyAll))
            const { row } = yield* createOutbound(
              principal,
              { ...input, to: input.to ?? r.to, cc: input.cc ?? r.cc, subject: input.subject ?? r.subject },
              r.context,
              "draft"
            )
            return yield* fullMessage(row)
          }
          const { row } = yield* createOutbound(principal, input, {}, "draft")
          return yield* fullMessage(row)
        }),

        updateDraft: Effect.fn("Mail.updateDraft")(function* (principal, messageId, input) {
          const current = yield* requireOutbound(principal, messageId, ["draft"], "edited")
          const set: Partial<typeof messages.$inferInsert> = {}
          if (input.to !== undefined || input.cc !== undefined || input.bcc !== undefined || input.replyTo !== undefined) {
            const r = yield* parseRecipients({
              to: input.to ?? current.to.map(formatAddress),
              cc: input.cc ?? current.cc.map(formatAddress),
              bcc: input.bcc ?? current.bcc.map(formatAddress),
              replyTo: input.replyTo ?? current.replyTo.map(formatAddress)
            })
            Object.assign(set, r)
          }
          if (input.from !== undefined) {
            const inbox = yield* resolveSender(principal, input.from)
            set.inboxId = inbox.id
            set.fromAddress = inbox.address
            set.fromName = inbox.displayName
          }
          if (input.subject !== undefined) set.subject = input.subject.replace(/[\r\n]+/g, " ").trim()
          if (input.text !== undefined || input.html !== undefined) {
            const html = input.html !== undefined ? input.html : current.html
            const text = input.text !== undefined ? input.text : html ? htmlToText(html) : current.text
            set.text = text
            set.html = html
            set.snippet = makeSnippet(text, html)
          }
          if (input.attachments !== undefined) {
            const files = yield* decodeFiles(input.attachments)
            const prepared = yield* prepareAttachments(current.userId, current.id, files)
            yield* db
              .transaction(
                Effect.gen(function* () {
                  yield* db.use((d) => d.delete(attachments).where(eq(attachments.messageId, current.id)))
                  if (prepared.rows.length) yield* db.use((d) => d.insert(attachments).values(prepared.rows))
                })
              )
              .pipe(Effect.onError(() => prepared.cleanup))
          }
          const row = Object.keys(set).length ? yield* transition(messageId, ["draft"], set) : current
          if (!row) return yield* new Conflict({ message: "This draft was sent or deleted meanwhile." })
          yield* events.publish({ type: "message.updated", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
          return yield* fullMessage(row)
        }),

        deleteDraft: Effect.fn("Mail.deleteDraft")(function* (principal, messageId) {
          const row = yield* requireOutbound(principal, messageId, ["draft", "scheduled", "rejected"], "deleted")
          yield* db.use((d) => d.delete(messages).where(and(eq(messages.id, row.id), inArray(messages.status, ["draft", "scheduled", "rejected"]))))
          yield* refreshThread(row.threadId)
          yield* events.publish({ type: "message.deleted", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
        }),

        sendDraft: Effect.fn("Mail.sendDraft")(function* (principal, messageId, sendAtInput) {
          const draft = yield* requireOutbound(principal, messageId, ["draft"], "sent")
          const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, draft.inboxId)))
          if (!inbox) return yield* new NotFound({ message: "Inbox not found.", resource: "inbox" })
          const agent = yield* loadAgentFor(inbox)
          if (inbox.status !== "active" || agent.status !== "active")
            return yield* new Forbidden({ message: `${inbox.address} is paused. Resume it before sending.` })
          const [att] = yield* db.use((d) => d.select({ n: count() }).from(attachments).where(eq(attachments.messageId, draft.id)))
          const all = yield* assertSendable(
            { to: draft.to.map((a) => ({ name: a.name ?? null, address: a.address })), cc: [], bcc: [...draft.cc, ...draft.bcc].map((a) => ({ name: a.name ?? null, address: a.address })), replyTo: [] },
            { text: draft.text, html: draft.html, attachmentCount: att?.n ?? 0 }
          )
          const sendAt = yield* parseSendAt(sendAtInput)
          const heldReason = yield* approvalReason(principal, agent, inbox, all.map((a) => a.address), (att?.n ?? 0) > 0)
          const status: OutboundStatus = heldReason ? "pending_approval" : sendAt ? "scheduled" : "sending"
          const row = yield* transition(draft.id, ["draft"], { status, sendAt })
          if (!row) return yield* new Conflict({ message: "This draft was already sent." })
          if (status === "sending") return yield* dispatch(row)
          if (heldReason) yield* notifyHeld(row, heldReason)
          else yield* events.publish({ type: "message.status", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
          return yield* fullMessage(row)
        }),

        listApprovals: Effect.fn("Mail.listApprovals")(function* (principal) {
          yield* requireAccount(principal, "review held messages")
          const rows = yield* db.use((d) =>
            d
              .select()
              .from(messages)
              .where(and(eq(messages.userId, principal.userId), eq(messages.status, "pending_approval")))
              .orderBy(asc(messages.createdAt))
              .limit(100)
          )
          const atts = yield* loadAttachments(rows.map((r) => r.id))
          return rows.map((row) => toMessage(row, atts.filter((a) => a.messageId === row.id)))
        }),

        approve: Effect.fn("Mail.approve")(function* (principal, messageId) {
          yield* requireAccount(principal, "approve messages")
          const held = yield* requireOutbound(principal, messageId, ["pending_approval"], "approved")
          const scheduled = held.sendAt !== null && held.sendAt.getTime() > Date.now() + 5_000
          const row = yield* transition(held.id, ["pending_approval"], {
            status: scheduled ? "scheduled" : "sending",
            decidedBy: principal.email || principal.userId,
            decidedAt: new Date()
          })
          if (!row) return yield* new Conflict({ message: "This message was already decided." })
          const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, row.inboxId)))
          if (inbox) yield* webhooks.enqueue(inbox.agentId, "message.approved", { inbox: { id: inbox.id, address: inbox.address }, message: toMessageSummary(row, 0) })
          if (!scheduled) return yield* dispatch(row)
          yield* events.publish({ type: "message.status", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
          return yield* fullMessage(row)
        }),

        reject: Effect.fn("Mail.reject")(function* (principal, messageId, reason) {
          yield* requireAccount(principal, "reject messages")
          yield* requireOutbound(principal, messageId, ["pending_approval"], "rejected")
          const row = yield* transition(messageId, ["pending_approval"], {
            status: "rejected",
            error: reason?.trim() ? `Rejected: ${reason.trim().slice(0, 500)}` : "Rejected by a human reviewer.",
            decidedBy: principal.email || principal.userId,
            decidedAt: new Date()
          })
          if (!row) return yield* new Conflict({ message: "This message was already decided." })
          yield* events.publish({ type: "message.status", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
          const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, row.inboxId)))
          if (inbox)
            yield* webhooks.enqueue(inbox.agentId, "message.rejected", {
              inbox: { id: inbox.id, address: inbox.address },
              message: toMessageSummary(row, 0),
              reason: reason ?? null
            })
          return yield* fullMessage(row)
        }),

        processScheduled: Effect.gen(function* () {
          const due = yield* db.transaction(
            db.use(async (d) => {
              const ids = await d
                .select({ id: messages.id })
                .from(messages)
                .where(and(eq(messages.status, "scheduled"), lte(messages.sendAt, new Date())))
                .orderBy(asc(messages.sendAt))
                .limit(20)
                .for("update", { skipLocked: true })
              if (ids.length === 0) return []
              return d
                .update(messages)
                .set({ status: "sending" })
                .where(inArray(messages.id, ids.map((r) => r.id)))
                .returning()
            })
          )
          yield* Effect.forEach(
            due,
            (row) =>
              dispatch(row).pipe(
                Effect.catch((error) => Effect.logWarning(`Scheduled message ${row.id} failed: ${error.message}`)),
                Effect.catchDefect((defect) =>
                  Effect.gen(function* () {
                    yield* Effect.logError("Scheduled dispatch crashed", defect)
                    yield* db.use((d) => d.update(messages).set({ status: "failed", error: "Internal error while sending." }).where(eq(messages.id, row.id)))
                  })
                )
              ),
            { concurrency: 4, discard: true }
          )
          return due.length
        }),

        wait: Effect.fn("Mail.wait")(function* (principal, options) {
          const timeoutMs = Math.min(Math.max(options.timeout ?? 30, 1), 60) * 1000
          const deadline = Date.now() + timeoutMs
          // Default to "now" by the database clock, so app/DB clock skew can't drop or replay messages.
          const dbNow = yield* db.use((d) => d.execute<{ now: string }>(sql`select now()::text as now`))
          const sinceParsed = options.since ? new Date(options.since) : new Date(String(dbNow[0]?.now))
          const since = Number.isNaN(sinceParsed.getTime()) ? new Date(String(dbNow[0]?.now)) : sinceParsed
          const inbox = options.inboxId ? yield* agentsService.requireInbox(principal, options.inboxId) : null

          const check = db
            .use((d) =>
              d
                .select()
                .from(messages)
                .where(
                  and(
                    scopeCondition(principal),
                    eq(messages.direction, "inbound"),
                    gt(messages.createdAt, since),
                    inbox ? eq(messages.inboxId, inbox.id) : undefined,
                    options.from ? ilike(messages.fromAddress, `%${options.from}%`) : undefined,
                    options.subject ? ilike(messages.subject, `%${options.subject}%`) : undefined
                  )
                )
                .orderBy(asc(messages.createdAt))
                .limit(1)
            )
            .pipe(Effect.map((rows) => rows[0] ?? null))

          return yield* Effect.scoped(
            Effect.gen(function* () {
              const subscription = yield* events.subscribe
              while (Date.now() < deadline) {
                const found = yield* check
                if (found) return { message: yield* fullMessage(found), timedOut: false }
                yield* PubSub.take(subscription).pipe(Effect.timeoutOption(Math.max(1, Math.min(2000, deadline - Date.now()))))
              }
              const last = yield* check
              return last ? { message: yield* fullMessage(last), timedOut: false } : { message: null, timedOut: true }
            })
          )
        }),

        listThreads: Effect.fn("Mail.listThreads")(function* (principal, filters) {
          const limit = Math.min(Math.max(filters.limit ?? 25, 1), 100)
          const agentScope = principal.agentId ?? filters.agentId
          const cursor = filters.cursor ? decodeCursor(filters.cursor) : null
          const rows = yield* db.use((d) =>
            d
              .select()
              .from(threads)
              .where(
                and(
                  eq(threads.userId, principal.userId),
                  gt(threads.messageCount, 0),
                  filters.inboxId ? eq(threads.inboxId, filters.inboxId) : undefined,
                  agentScope ? inArray(threads.inboxId, db_inboxIdsForAgent(agentScope)) : undefined,
                  cursor
                    ? or(lt(threads.lastMessageAt, cursor.createdAt), and(eq(threads.lastMessageAt, cursor.createdAt), lt(threads.id, cursor.id)))
                    : undefined
                )
              )
              .orderBy(desc(threads.lastMessageAt), desc(threads.id))
              .limit(limit + 1)
          )
          const page = rows.slice(0, limit)
          const last = page[page.length - 1]
          return {
            threads: page.map(toThread),
            nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.lastMessageAt, id: last.id }) : null
          }
        }),

        getThread: Effect.fn("Mail.getThread")(function* (principal, threadId) {
          const [thread] = yield* db.use((d) =>
            d.select().from(threads).where(and(eq(threads.id, threadId), eq(threads.userId, principal.userId))).limit(1)
          )
          if (!thread) return yield* new NotFound({ message: "Thread not found.", resource: "thread" })
          if (principal.agentId) {
            const [inbox] = yield* db.use((d) => d.select({ agentId: inboxes.agentId }).from(inboxes).where(eq(inboxes.id, thread.inboxId)))
            if (inbox?.agentId !== principal.agentId) return yield* new NotFound({ message: "Thread not found.", resource: "thread" })
          }
          const rows = yield* db.use((d) => d.select().from(messages).where(eq(messages.threadId, threadId)).orderBy(asc(messages.createdAt)))
          const atts = yield* loadAttachments(rows.map((r) => r.id))
          return {
            ...toThread(thread),
            messages: rows.map((row) => toMessage(row, atts.filter((a) => a.messageId === row.id)))
          }
        }),

        ingestRaw: (raw, recipients, verdicts = {}) =>
          Effect.gen(function* () {
            const parsed = yield* Effect.promise(() => parseMime(raw))
            if (isAutoReply(parsed.headers)) yield* Effect.logDebug(`Auto-submitted message from ${parsed.from.address}`)
            return yield* ingestParsed(parsed, recipients, verdicts)
          }),

        applyDeliveryEvent: (providerMessageId, event, detail) =>
          Effect.gen(function* () {
            const [row] = yield* db.use((d) => d.select().from(messages).where(eq(messages.providerMessageId, providerMessageId)).limit(1))
            if (!row) return
            yield* db.use((d) =>
              d
                .update(messages)
                .set({ status: event, error: event === "delivered" ? row.error : detail })
                .where(eq(messages.id, row.id))
            )
            yield* events.publish({ type: "message.status", userId: row.userId, inboxId: row.inboxId, messageId: row.id, threadId: row.threadId })
            const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, row.inboxId)))
            if (inbox) {
              yield* webhooks.enqueue(inbox.agentId, `message.${event}`, {
                inbox: { id: inbox.id, address: inbox.address },
                message: toMessageSummary({ ...row, status: event }, 0),
                detail
              })
            }
          })
      })
    })
  )
}

/** Background fiber that releases scheduled mail when it's due. */
export const ScheduledSendWorker = Layer.effectDiscard(
  Effect.gen(function* () {
    const mail = yield* Mail
    yield* mail.processScheduled.pipe(
      Effect.catchCause((cause) => Effect.logError("Scheduled send tick failed", cause)),
      Effect.repeat(Schedule.spaced("10 seconds")),
      Effect.forkScoped
    )
  })
)
