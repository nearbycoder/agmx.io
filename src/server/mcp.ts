import { Effect, Schema } from "effect"
import type { Principal } from "~/shared/api/Authorization"
import * as D from "~/shared/api/domain"
import type { ApiError } from "~/shared/api/errors"
import { env } from "./env"
import { Account } from "./services/Account"
import { Agents } from "./services/Agents"
import { Mail } from "./services/Mail"

/**
 * A stateless Model Context Protocol server (Streamable HTTP, JSON responses).
 * Every tool is a thin wrapper over the same Effect services as the REST API,
 * so behaviour, limits and errors are identical.
 */

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05", "2025-11-25"]
const LATEST = "2025-06-18"

const opt = <S extends Schema.Top>(schema: S, description: string) => Schema.optional(schema.annotate({ description }) as S)
const req = <S extends Schema.Top>(schema: S, description: string) => schema.annotate({ description }) as S

interface Tool<S extends Schema.Top> {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly input: S
  readonly readOnly?: boolean
  readonly run: (principal: Principal, input: S["Type"]) => Effect.Effect<unknown, ApiError, Mail | Agents | Account>
}

const tool = <S extends Schema.Top>(t: Tool<S>) => t as unknown as Tool<Schema.Top>

const Recipients = Schema.Union([Schema.String, Schema.Array(Schema.String)])

const tools = [
  tool({
    name: "whoami",
    title: "Who am I",
    description: "Show the authenticated account, its plan limits, current usage and which agent this key belongs to. Call this first.",
    input: Schema.Struct({}),
    readOnly: true,
    run: (principal) => Effect.flatMap(Effect.service(Account), (a) => a.me(principal))
  }),
  tool({
    name: "list_inboxes",
    title: "List inboxes",
    description: "List the email inboxes (addresses) this key can use, with unread counts.",
    input: Schema.Struct({ agentId: opt(Schema.String, "Only inboxes for this agent (account keys only).") }),
    readOnly: true,
    run: (principal, input) => Effect.flatMap(Effect.service(Agents), (a) => a.listInboxes(principal, input.agentId))
  }),
  tool({
    name: "create_inbox",
    title: "Create inbox",
    description: `Claim a new email address, e.g. username "scout" becomes scout@${env.mailDomain}. Omit username for a random one.`,
    input: Schema.Struct({
      username: opt(Schema.String, "Local part of the address (lowercase letters, numbers, . _ -)."),
      displayName: opt(Schema.String, "Display name shown to recipients, e.g. 'Scout from Acme'."),
      domain: opt(Schema.String, `Custom domain you have verified. Defaults to ${env.mailDomain}.`),
      agentId: opt(Schema.String, "Agent to attach the inbox to (only needed with account keys).")
    }),
    run: (principal, input) => Effect.flatMap(Effect.service(Agents), (a) => a.createInbox(principal, input))
  }),
  tool({
    name: "list_messages",
    title: "List messages",
    description: "List emails, newest first. Returns summaries with extracted verification codes and links. Use get_message for the full body.",
    input: Schema.Struct({
      inboxId: opt(Schema.String, "Inbox id or address. Defaults to all inboxes."),
      folder: opt(Schema.Literals(["inbox", "sent", "starred", "archived", "spam", "all"]), "Folder filter. 'inbox' = received, not archived."),
      unread: opt(Schema.Boolean, "Only unread (true) or read (false) messages."),
      query: opt(Schema.String, "Search subject, body and addresses."),
      limit: opt(Schema.Int, "Max results (1-100, default 20)."),
      cursor: opt(Schema.String, "Pagination cursor from a previous call.")
    }),
    readOnly: true,
    run: (principal, input) =>
      Effect.gen(function* () {
        const agents = yield* Agents
        const mail = yield* Mail
        const inbox = input.inboxId ? yield* agents.requireInbox(principal, input.inboxId) : null
        return yield* mail.list(principal, {
          inboxId: inbox?.id,
          folder: input.folder,
          unread: input.unread === undefined ? undefined : input.unread ? "true" : "false",
          q: input.query,
          limit: input.limit ?? 20,
          cursor: input.cursor
        })
      })
  }),
  tool({
    name: "get_message",
    title: "Read message",
    description: "Read one email in full: text, HTML, headers, attachments (with download URLs) and extracted codes/links.",
    input: Schema.Struct({
      messageId: req(Schema.String, "Message id (msg_…)."),
      markRead: opt(Schema.Boolean, "Mark the message as read. Default true.")
    }),
    run: (principal, input) => Effect.flatMap(Effect.service(Mail), (m) => m.get(principal, input.messageId, input.markRead ?? true))
  }),
  tool({
    name: "wait_for_email",
    title: "Wait for email",
    description:
      "Block until a new email arrives (up to 60 seconds) and return it. Ideal right after triggering a sign-up or password reset: the result includes extracted.codes and extracted.links.",
    input: Schema.Struct({
      inboxId: opt(Schema.String, "Inbox id or address to watch. Defaults to all inboxes."),
      timeout: opt(Schema.Int, "Seconds to wait (1-60, default 30)."),
      from: opt(Schema.String, "Only match senders containing this text, e.g. 'github.com'."),
      subject: opt(Schema.String, "Only match subjects containing this text."),
      since: opt(Schema.String, "ISO timestamp; only messages after this. Defaults to now.")
    }),
    readOnly: true,
    run: (principal, input) => Effect.flatMap(Effect.service(Mail), (m) => m.wait(principal, input))
  }),
  tool({
    name: "send_email",
    title: "Send email",
    description: "Send an email from one of your inboxes. Plain text is fine; HTML is optional. Each recipient counts toward the plan's send quota.",
    input: Schema.Struct({
      from: opt(Schema.String, "Inbox id or address to send from. Optional if the agent has exactly one inbox."),
      to: req(Recipients, "Recipient address or list of addresses."),
      cc: opt(Recipients, "CC recipients."),
      bcc: opt(Recipients, "BCC recipients."),
      subject: req(Schema.String, "Subject line."),
      text: opt(Schema.String, "Plain-text body."),
      html: opt(Schema.String, "HTML body."),
      attachments: opt(Schema.Array(D.OutgoingAttachment), "Files to attach; content is base64.")
    }),
    run: (principal, input) => Effect.flatMap(Effect.service(Mail), (m) => m.send(principal, input))
  }),
  tool({
    name: "reply_to_email",
    title: "Reply",
    description: "Reply to a message, keeping it in the same thread (sets In-Reply-To and References).",
    input: Schema.Struct({
      messageId: req(Schema.String, "Message to reply to."),
      text: opt(Schema.String, "Plain-text reply. The original is quoted automatically."),
      html: opt(Schema.String, "HTML reply."),
      replyAll: opt(Schema.Boolean, "Include everyone from the original message.")
    }),
    run: (principal, input) => Effect.flatMap(Effect.service(Mail), (m) => m.reply(principal, input.messageId, input))
  }),
  tool({
    name: "forward_email",
    title: "Forward",
    description: "Forward a message (with attachments) to new recipients.",
    input: Schema.Struct({
      messageId: req(Schema.String, "Message to forward."),
      to: req(Recipients, "Recipients."),
      text: opt(Schema.String, "Optional note above the forwarded message.")
    }),
    run: (principal, input) => Effect.flatMap(Effect.service(Mail), (m) => m.forward(principal, input.messageId, input))
  }),
  tool({
    name: "update_message",
    title: "Update message",
    description: "Mark read/unread, star, archive, flag as spam or set labels.",
    input: Schema.Struct({
      messageId: req(Schema.String, "Message id."),
      isRead: opt(Schema.Boolean, "Read state."),
      isStarred: opt(Schema.Boolean, "Starred state."),
      isArchived: opt(Schema.Boolean, "Archive (true) or move back to inbox (false)."),
      isSpam: opt(Schema.Boolean, "Spam flag."),
      labels: opt(Schema.Array(Schema.String), "Replace the message's labels.")
    }),
    run: (principal, { messageId, ...patch }) => Effect.flatMap(Effect.service(Mail), (m) => m.update(principal, messageId, patch))
  }),
  tool({
    name: "delete_message",
    title: "Delete message",
    description: "Permanently delete a message.",
    input: Schema.Struct({ messageId: req(Schema.String, "Message id.") }),
    run: (principal, input) => Effect.flatMap(Effect.service(Mail), (m) => m.remove(principal, input.messageId)).pipe(Effect.as({ ok: true }))
  }),
  tool({
    name: "list_threads",
    title: "List threads",
    description: "List conversations, most recently active first.",
    input: Schema.Struct({
      inboxId: opt(Schema.String, "Inbox id or address."),
      limit: opt(Schema.Int, "Max results (default 20)."),
      cursor: opt(Schema.String, "Pagination cursor.")
    }),
    readOnly: true,
    run: (principal, input) =>
      Effect.gen(function* () {
        const agents = yield* Agents
        const inbox = input.inboxId ? yield* agents.requireInbox(principal, input.inboxId) : null
        return yield* (yield* Mail).listThreads(principal, { inboxId: inbox?.id, limit: input.limit ?? 20, cursor: input.cursor })
      })
  }),
  tool({
    name: "get_thread",
    title: "Read thread",
    description: "Read a whole conversation, oldest message first.",
    input: Schema.Struct({ threadId: req(Schema.String, "Thread id (thr_…).") }),
    readOnly: true,
    run: (principal, input) => Effect.flatMap(Effect.service(Mail), (m) => m.getThread(principal, input.threadId))
  })
]

const toolList = tools.map((t) => {
  const { schema } = Schema.toJsonSchemaDocument(t.input)
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: { ...schema, type: "object" },
    annotations: { title: t.title, readOnlyHint: t.readOnly ?? false, destructiveHint: t.name === "delete_message", openWorldHint: t.name.includes("send") || t.name.includes("reply") || t.name.includes("forward") }
  }
})

const INSTRUCTIONS = `AGMX gives you real email inboxes. Typical flow:
1. whoami / list_inboxes to see your addresses (create_inbox if you have none).
2. To receive a verification email: trigger it, then call wait_for_email and read extracted.codes or extracted.links.
3. send_email / reply_to_email to correspond. Replies stay threaded.
Errors include a _tag such as QuotaExceeded or NotFound and a human-readable message.`

interface JsonRpcRequest {
  jsonrpc: "2.0"
  id?: string | number | null
  method: string
  params?: Record<string, unknown>
}

const rpcResult = (id: JsonRpcRequest["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result })
const rpcError = (id: JsonRpcRequest["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } })

const callTool = (principal: Principal, name: string, args: unknown) =>
  Effect.gen(function* () {
    const t = tools.find((x) => x.name === name)
    if (!t) return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] }
    const codec = Schema.toCodecJson(t.input) as unknown as Schema.Codec<unknown, unknown, never, never>
    const decoded = yield* Schema.decodeUnknownEffect(codec)(args ?? {}).pipe(Effect.result)
    if (decoded._tag === "Failure") {
      return { isError: true, content: [{ type: "text", text: `Invalid arguments for ${name}: ${decoded.failure.message}` }] }
    }
    const result = yield* t.run(principal, decoded.success).pipe(Effect.result)
    if (result._tag === "Failure") {
      const error = result.failure
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: error._tag, message: error.message }) }] }
    }
    const value = result.success
    return {
      content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
      ...(value && typeof value === "object" && !Array.isArray(value) ? { structuredContent: value } : { structuredContent: { items: value } })
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logError("MCP tool failed", cause).pipe(
        Effect.as({ isError: true, content: [{ type: "text", text: "Internal error while running the tool." }] })
      )
    )
  )

export const handleRpc = (principal: Principal, message: JsonRpcRequest) =>
  Effect.gen(function* () {
    const isNotification = message.id === undefined
    switch (message.method) {
      case "initialize": {
        const requested = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : LATEST
        return rpcResult(message.id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : LATEST,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "agmx", title: "AGMX — email for agents", version: "1.0.0", websiteUrl: env.appUrl },
          instructions: INSTRUCTIONS
        })
      }
      case "ping":
        return rpcResult(message.id, {})
      case "tools/list":
        return rpcResult(message.id, { tools: toolList })
      case "tools/call": {
        const name = typeof message.params?.name === "string" ? message.params.name : ""
        return rpcResult(message.id, yield* callTool(principal, name, message.params?.arguments))
      }
      case "resources/list":
        return rpcResult(message.id, { resources: [] })
      case "prompts/list":
        return rpcResult(message.id, { prompts: [] })
      default:
        if (isNotification || message.method.startsWith("notifications/")) return null
        return rpcError(message.id, -32601, `Method not found: ${message.method}`)
    }
  })
