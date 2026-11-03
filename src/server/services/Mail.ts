import { and, asc, count, desc, eq, gt, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm"
import { Context, Effect, Layer, PubSub } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import type * as D from "~/shared/api/domain"
import { DeliveryFailed, Forbidden, InvalidRequest, NotFound, QuotaExceeded } from "~/shared/api/errors"
import { formatAddress, parseAddressList, subjectKey, type ParsedAddress } from "~/shared/address"
import { agents, attachments, inboxes, messages, suppressions, threads, type Address, type Verdicts } from "../db/schema"
import type { InboxRow, MessageRow } from "../db/types"
import { env } from "../env"
import { newId } from "../ids"
import { composeMime, escapeHtml, htmlToText, makeSnippet, quoteText } from "../mail/compose"
import { extract } from "../mail/extract"
import { parseMime, type ParsedEmail } from "../mail/parse"
import { toMessage, toMessageSummary, toThread } from "../serialize"
import { Agents } from "./Agents"
import { canAccessAgent } from "./access"
import { Db } from "./Db"
import { Events } from "./Events"
import { MailTransport } from "./MailTransport"
import { Quota } from "./Quota"
import { Webhooks } from "./Webhooks"

export interface ListFilters {
  inboxId?: string | undefined
  agentId?: string | undefined
  threadId?: string | undefined
  direction?: "inbound" | "outbound" | undefined
  folder?: "inbox" | "sent" | "starred" | "archived" | "spam" | "all" | undefined
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
  inline: attachments.inline
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

export interface OutgoingInput {
  from?: string | undefined
  to: ReadonlyArray<string> | string
  cc?: ReadonlyArray<string> | string | undefined
  bcc?: ReadonlyArray<string> | string | undefined
  replyTo?: ReadonlyArray<string> | string | undefined
  subject: string
  text?: string | undefined
  html?: string | undefined
  attachments?: ReadonlyArray<{ filename: string; contentType?: string | undefined; content: string | Buffer }> | undefined
  headers?: Record<string, string> | undefined
  labels?: ReadonlyArray<string> | undefined
}

interface SendContext {
  inbox?: InboxRow
  threadId?: string
  inReplyTo?: string | null
  references?: Array<string>
}

type SendError = QuotaExceeded | InvalidRequest | NotFound | Forbidden | DeliveryFailed

export class Mail extends Context.Service<Mail, {
  list(principal: Principal, filters: ListFilters): Effect.Effect<typeof D.MessagePage.Type>
  get(principal: Principal, messageId: string, markRead?: boolean): Effect.Effect<typeof D.Message.Type, NotFound>
  update(principal: Principal, messageId: string, patch: typeof D.UpdateMessagePayload.Type): Effect.Effect<typeof D.MessageSummary.Type, NotFound>
  remove(principal: Principal, messageId: string): Effect.Effect<void, NotFound>
  attachment(principal: Principal, messageId: string, attachmentId: string): Effect.Effect<{ filename: string; contentType: string; content: Buffer }, NotFound>
  send(principal: Principal, input: OutgoingInput): Effect.Effect<typeof D.Message.Type, SendError>
  reply(principal: Principal, messageId: string, input: typeof D.ReplyPayload.Type): Effect.Effect<typeof D.Message.Type, SendError>
  forward(principal: Principal, messageId: string, input: typeof D.ForwardPayload.Type): Effect.Effect<typeof D.Message.Type, SendError>
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
          ? Effect.succeed([] as Array<{ id: string; messageId: string; filename: string; contentType: string; size: number; contentId: string | null; inline: boolean }>)
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
          const rows = await d
            .select({
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
          if (rows.length === 0) {
            await d.delete(threads).where(eq(threads.id, threadId))
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

      /** Store one inbound copy of `parsed` in `inbox`. */
      const deliverToInbox = Effect.fn("Mail.deliverToInbox")(function* (
        inbox: InboxRow,
        parsed: ParsedEmail,
        options: { tag: string | null; verdicts: Verdicts }
      ) {
        const messageId = newId("msg")
        const isSpam = options.verdicts.spam === "FAIL" || options.verdicts.virus === "FAIL"
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
                extracted: extract(parsed.subject, parsed.text, parsed.html),
                verdicts: options.verdicts,
                labels: options.tag ? [options.tag] : [],
                isSpam,
                sizeBytes: parsed.sizeBytes
              })
            )
            if (parsed.attachments.length) {
              yield* db.use((d) =>
                d.insert(attachments).values(
                  parsed.attachments.map((a) => ({
                    id: newId("att"),
                    userId: inbox.userId,
                    messageId,
                    filename: a.filename,
                    contentType: a.contentType,
                    size: a.content.byteLength,
                    contentId: a.contentId,
                    inline: a.inline,
                    content: a.content
                  }))
                )
              )
            }
            yield* refreshThread(threadId)
            yield* db.use((d) => d.update(inboxes).set({ lastMessageAt: new Date() }).where(eq(inboxes.id, inbox.id)))
            yield* quota.recordReceived(inbox.userId, 1)
            return threadId
          })
        )
        yield* events.publish({ type: "message.received", userId: inbox.userId, inboxId: inbox.id, messageId, threadId })
        const [row] = yield* db.use((d) => d.select().from(messages).where(eq(messages.id, messageId)))
        if (row && !isSpam) {
          yield* webhooks.enqueue(inbox.agentId, "message.received", {
            inbox: { id: inbox.id, address: inbox.address },
            message: toMessageSummary(row, parsed.attachments.length)
          })
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
          yield* deliverToInbox(match.inbox, parsed, { tag: match.tag, verdicts })
          inboxIds.push(match.inbox.id)
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

      const sendInternal = Effect.fn("Mail.send")(function* (
        principal: Principal,
        input: OutgoingInput,
        context: SendContext = {}
      ): Effect.fn.Return<typeof D.Message.Type, SendError> {
        const inbox = context.inbox ?? (yield* resolveSender(principal, input.from))
        if (!canAccessAgent(principal, inbox.agentId)) return yield* new NotFound({ message: "Inbox not found.", resource: "inbox" })
        const [agent] = yield* db.use((d) => d.select().from(agents).where(eq(agents.id, inbox.agentId)).limit(1))
        if (inbox.status !== "active" || agent?.status !== "active")
          return yield* new Forbidden({ message: `${inbox.address} is paused. Resume it before sending.` })

        const to = parseAddressList(input.to)
        const cc = parseAddressList(input.cc)
        const bcc = parseAddressList(input.bcc)
        const replyTo = parseAddressList(input.replyTo)
        const invalid = [...to.invalid, ...cc.invalid, ...bcc.invalid, ...replyTo.invalid]
        if (invalid.length) return yield* new InvalidRequest({ message: `Invalid address: ${invalid.join(", ")}`, field: "to" })
        const allRecipients = [...to.valid, ...cc.valid, ...bcc.valid]
        if (allRecipients.length === 0) return yield* new InvalidRequest({ message: "Add at least one recipient.", field: "to" })
        if (allRecipients.length > 50) return yield* new InvalidRequest({ message: "At most 50 recipients per message.", field: "to" })
        const subject = input.subject.replace(/[\r\n]+/g, " ").trim()
        if (!input.text?.trim() && !input.html?.trim() && !input.attachments?.length)
          return yield* new InvalidRequest({ message: "Provide `text`, `html` or at least one attachment.", field: "text" })

        const files: Array<{ filename: string; contentType: string; content: Buffer }> = []
        for (const a of input.attachments ?? []) {
          const content = typeof a.content === "string" ? Buffer.from(a.content, "base64") : a.content
          if (content.byteLength === 0 && typeof a.content === "string" && a.content.length > 0)
            return yield* new InvalidRequest({ message: `Attachment ${a.filename} is not valid base64.`, field: "attachments" })
          files.push({ filename: a.filename.replace(/[\r\n"]/g, "_"), contentType: a.contentType || "application/octet-stream", content })
        }

        // Suppressed external recipients (hard bounces / complaints) protect sender reputation.
        const externalAddresses = allRecipients.map((r) => r.address)
        const suppressed = yield* db.use((d) =>
          d
            .select({ address: suppressions.address, reason: suppressions.reason })
            .from(suppressions)
            .where(inArray(sql`lower(${suppressions.address})`, externalAddresses))
        )
        if (suppressed.length)
          return yield* new InvalidRequest({
            message: `Not sending to suppressed address${suppressed.length > 1 ? "es" : ""}: ${suppressed.map((s) => `${s.address} (${s.reason})`).join(", ")}`,
            field: "to"
          })

        const rfcMessageId = `<${newId("msg").replace("msg_", "")}@${inbox.domain}>`
        const fromAddress: ParsedAddress = { name: inbox.displayName, address: inbox.address }
        const text = input.text ?? (input.html ? htmlToText(input.html) : null)
        const raw = yield* Effect.promise(() =>
          composeMime({
            from: fromAddress,
            to: to.valid,
            cc: cc.valid,
            bcc: bcc.valid,
            replyTo: replyTo.valid,
            subject,
            text,
            html: input.html ?? null,
            messageId: rfcMessageId,
            inReplyTo: context.inReplyTo ?? null,
            references: context.references,
            headers: input.headers,
            attachments: files
          })
        )
        yield* quota.checkMessageSize(inbox.userId, raw.byteLength)

        // Split recipients into AGMX inboxes (delivered internally) and the outside world (SES).
        const local: Array<string> = []
        const external: Array<string> = []
        for (const r of allRecipients) {
          const match = yield* lookupInbox(r.address)
          if (match) local.push(r.address)
          else external.push(r.address)
        }

        const messageId = newId("msg")
        const threadId = yield* db.transaction(
          Effect.gen(function* () {
            yield* quota.reserveSends(inbox.userId, allRecipients.length)
            const threadId = context.threadId ?? newId("thr")
            if (!context.threadId) {
              yield* db.use((d) => d.insert(threads).values({ id: threadId, userId: inbox.userId, inboxId: inbox.id, subject }))
            }
            yield* db.use((d) =>
              d.insert(messages).values({
                id: messageId,
                userId: inbox.userId,
                inboxId: inbox.id,
                threadId,
                direction: "outbound",
                status: "sending",
                rfcMessageId,
                inReplyTo: context.inReplyTo ?? null,
                references: context.references ?? [],
                fromAddress: inbox.address,
                fromName: inbox.displayName,
                to: to.valid,
                cc: cc.valid,
                bcc: bcc.valid,
                replyTo: replyTo.valid,
                subject,
                text,
                html: input.html ?? null,
                snippet: makeSnippet(text, input.html),
                headers: input.headers ?? {},
                labels: [...(input.labels ?? [])],
                isRead: true,
                sizeBytes: raw.byteLength
              })
            )
            if (files.length) {
              yield* db.use((d) =>
                d.insert(attachments).values(
                  files.map((f) => ({
                    id: newId("att"),
                    userId: inbox.userId,
                    messageId,
                    filename: f.filename,
                    contentType: f.contentType,
                    size: f.content.byteLength,
                    content: f.content
                  }))
                )
              )
            }
            yield* refreshThread(threadId)
            yield* db.use((d) => d.update(inboxes).set({ lastMessageAt: new Date() }).where(eq(inboxes.id, inbox.id)))
            return threadId
          })
        )

        let providerMessageId: string | null = null
        if (external.length) {
          const result = yield* transport.send({ from: formatAddress(fromAddress), recipients: external, raw }).pipe(
            Effect.tapError((error) =>
              Effect.gen(function* () {
                yield* db.use((d) => d.update(messages).set({ status: "failed", error: error.message }).where(eq(messages.id, messageId)))
                yield* quota.refundSends(inbox.userId, allRecipients.length)
                yield* events.publish({ type: "message.status", userId: inbox.userId, inboxId: inbox.id, messageId, threadId })
              })
            )
          )
          providerMessageId = result.providerMessageId
        }

        if (local.length) {
          const parsed = yield* Effect.promise(() => parseMime(raw))
          yield* ingestParsed(parsed, local, {})
        }

        const usedSes = transport.name === "ses" && providerMessageId !== null
        yield* db.use((d) =>
          d
            .update(messages)
            .set({
              status: "sent",
              providerMessageId,
              rfcMessageId: usedSes ? `<${providerMessageId}@${sesMessageIdDomain()}>` : rfcMessageId,
              altMessageId: usedSes ? rfcMessageId : null
            })
            .where(eq(messages.id, messageId))
        )
        yield* events.publish({ type: "message.sent", userId: inbox.userId, inboxId: inbox.id, messageId, threadId })
        const [row] = yield* db.use((d) => d.select().from(messages).where(eq(messages.id, messageId)))
        yield* webhooks.enqueue(inbox.agentId, "message.sent", {
          inbox: { id: inbox.id, address: inbox.address },
          message: toMessageSummary(row!, files.length)
        })
        return yield* fullMessage(row!)
      })

      // ---------------------------------------------------------------------
      // Service
      // ---------------------------------------------------------------------

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
              conditions.push(eq(messages.direction, "outbound"))
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
              .select({ filename: attachments.filename, contentType: attachments.contentType, content: attachments.content })
              .from(attachments)
              .where(and(eq(attachments.id, attachmentId), eq(attachments.messageId, messageId)))
              .limit(1)
          )
          if (!row) return yield* new NotFound({ message: "Attachment not found.", resource: "attachment" })
          return row
        }),

        send: (principal, input) => sendInternal(principal, input),

        reply: Effect.fn("Mail.reply")(function* (principal, messageId, input) {
          const original = yield* requireMessage(principal, messageId)
          const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, original.inboxId)).limit(1))
          if (!inbox) return yield* new NotFound({ message: "Inbox not found.", resource: "inbox" })
          const self = inbox.address
          const primary: Array<Address> =
            original.direction === "inbound"
              ? original.replyTo.length
                ? original.replyTo
                : [{ name: original.fromName, address: original.fromAddress }]
              : original.to
          const primarySet = new Set(primary.map((a) => a.address))
          const cc = input.replyAll
            ? [...original.to, ...original.cc].filter((a) => a.address !== self && !primarySet.has(a.address))
            : []
          const subject = /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}`
          const header = `On ${original.createdAt.toUTCString()}, ${formatAddress({ name: original.fromName, address: original.fromAddress })} wrote:`
          const body = input.text ?? (input.html ? htmlToText(input.html) : "")
          const html = input.html
            ? `${input.html}<br><div style="color:#666">${escapeHtml(header)}</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${original.html ?? escapeHtml(original.text ?? "").replace(/\n/g, "<br>")}</blockquote>`
            : undefined
          const references = [...original.references, ...(original.rfcMessageId ? [original.rfcMessageId] : [])].slice(-20)
          return yield* sendInternal(
            principal,
            {
              to: primary.map(formatAddress),
              cc: cc.map(formatAddress),
              subject,
              text: `${body}${quoteText(header, original.text ?? (original.html ? htmlToText(original.html) : ""))}`,
              html,
              attachments: input.attachments
            },
            { inbox, threadId: original.threadId, inReplyTo: original.rfcMessageId, references }
          )
        }),

        forward: Effect.fn("Mail.forward")(function* (principal, messageId, input) {
          const original = yield* requireMessage(principal, messageId)
          const [inbox] = yield* db.use((d) => d.select().from(inboxes).where(eq(inboxes.id, original.inboxId)).limit(1))
          if (!inbox) return yield* new NotFound({ message: "Inbox not found.", resource: "inbox" })
          const files = yield* db.use((d) =>
            d
              .select({ filename: attachments.filename, contentType: attachments.contentType, content: attachments.content })
              .from(attachments)
              .where(eq(attachments.messageId, original.id))
          )
          const header = [
            "---------- Forwarded message ---------",
            `From: ${formatAddress({ name: original.fromName, address: original.fromAddress })}`,
            `Date: ${original.createdAt.toUTCString()}`,
            `Subject: ${original.subject}`,
            `To: ${original.to.map(formatAddress).join(", ")}`
          ].join("\n")
          const subject = /^fwd?:/i.test(original.subject) ? original.subject : `Fwd: ${original.subject}`
          return yield* sendInternal(
            principal,
            {
              to: input.to,
              subject,
              text: `${input.text ?? ""}\n\n${header}\n\n${original.text ?? (original.html ? htmlToText(original.html) : "")}`,
              html: original.html
                ? `${input.text ? `<p>${escapeHtml(input.text).replace(/\n/g, "<br>")}</p>` : ""}<div style="color:#666;white-space:pre-line">${escapeHtml(header)}</div><br>${original.html}`
                : undefined,
              attachments: files.map((f) => ({ filename: f.filename, contentType: f.contentType, content: f.content }))
            },
            { inbox, threadId: original.threadId, references: original.rfcMessageId ? [original.rfcMessageId] : [] }
          )
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

