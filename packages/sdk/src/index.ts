/**
 * AGMX — email inboxes for AI agents.
 *
 *   import { Agmx } from "@agmx.io/sdk"
 *   const agmx = new Agmx({ apiKey: process.env.AGMX_API_KEY })
 *   const { message } = await agmx.messages.wait({ timeout: 60 })
 *
 * Types are generated from the AGMX OpenAPI spec (src/schema.ts).
 */
import type { operations } from "./schema.js"

// ---------------------------------------------------------------------------
// Type helpers derived from the generated spec
// ---------------------------------------------------------------------------

type Ops = operations
type JsonResponse<T> = T extends { responses: { 200: { content: { "application/json": infer R } } } } ? R : never
type Ok<K extends keyof Ops> = JsonResponse<Ops[K]>
type Body<K extends keyof Ops> = Ops[K] extends { requestBody: { content: { "application/json": infer B } } } ? B : never
type Query<K extends keyof Ops> = Ops[K] extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never
/** Query strings are strings on the wire; accept numbers and booleans too. */
type QueryInput<T> = { [P in keyof T]?: T[P] | number | boolean | undefined }
/** Optional fields in the spec accept `null`; for ergonomics also accept `undefined`. */
type Input<T> = { [P in keyof T]?: T[P] | undefined } & { [P in keyof T as null extends T[P] ? never : undefined extends T[P] ? never : P]-?: T[P] }

export type Me = Ok<"account.me">
export type UsageSeries = Ok<"account.usage">
export type AccountExport = Ok<"account.exportData">
export type Agent = Ok<"agents.update">
export type AgentWithSecret = Ok<"agents.get">
export type AgentReputation = Ok<"agents.reputation">
export type CreateAgentResult = Ok<"agents.create">
export type Inbox = Ok<"inboxes.get">
export type Message = Ok<"messages.get">
export type MessagePage = Ok<"messages.list">
export type MessageSummary = MessagePage["messages"][number]
export type WaitResult = Ok<"messages.wait">
export type Thread = Ok<"threads.get">
export type ThreadPage = Ok<"threads.list">
export type InboxRule = Ok<"rules.create">
export type Domain = Ok<"domains.get">
export type ApiKey = Ok<"apiKeys.create">["apiKey"]
export type CreatedApiKey = Ok<"apiKeys.create">
export type WebhookDelivery = Ok<"agents.testWebhook">
export type SignupStart = Ok<"signup.start">
export type SignupStatus = Ok<"signup.poll">
export type SecurityReport = NonNullable<Message["security"]>
export type Extracted = Message["extracted"]

export type SendInput = Input<Body<"messages.send">>
export type ReplyInput = Input<Body<"messages.reply">>
export type ForwardInput = Input<Body<"messages.forward">>
export type DraftInput = Input<Body<"drafts.create">>
export type CreateInboxInput = Input<Body<"inboxes.create">>
export type UpdateInboxInput = Input<Body<"inboxes.update">>
export type CreateAgentInput = Input<Body<"agents.create">>
export type UpdateAgentInput = Input<Body<"agents.update">>
export type CreateRuleInput = Input<Body<"rules.create">>
export type UpdateRuleInput = Input<Body<"rules.update">>
export type UpdateMessageInput = Input<Body<"messages.update">>
export type ListMessagesQuery = QueryInput<Query<"messages.list">>
export type WaitQuery = Omit<QueryInput<Query<"messages.wait">>, "timeout"> & { /** Seconds, 1–60. */ timeout?: number }
export type ListThreadsQuery = QueryInput<Query<"threads.list">>

/** Error tags returned by the API (`_tag`), plus client-side ones. */
export type AgmxErrorTag =
  | "Unauthorized"
  | "Forbidden"
  | "NotFound"
  | "Conflict"
  | "InvalidRequest"
  | "QuotaExceeded"
  | "RateLimited"
  | "DeliveryFailed"
  | "NetworkError"
  | "HttpError"
  | "SignupDenied"
  | "SignupExpired"
  | "SignupAlreadyCompleted"
  | "Timeout"

/** Every failure is an AgmxError with a stable `tag` you can branch on. */
export class AgmxError extends Error {
  readonly tag: AgmxErrorTag | (string & {})
  readonly status: number
  /** The full error body from the API, e.g. `{ limit, max, used }` for QuotaExceeded. */
  readonly body: Record<string, unknown>

  constructor(tag: string, message: string, status = 0, body: Record<string, unknown> = {}) {
    super(message)
    this.name = "AgmxError"
    this.tag = tag
    this.status = status
    this.body = body
  }
}

export interface AgmxOptions {
  /** `agmx_agt_…` (agent-scoped) or `agmx_acc_…` (account) key. */
  apiKey: string
  /** Defaults to https://agmx.io. */
  baseUrl?: string
  /** Custom fetch (tests, proxies). Defaults to the global fetch. */
  fetch?: typeof fetch
  /** Per-request timeout in ms (long-polls add their own wait time). Default 30s. */
  timeoutMs?: number
  /** Extra headers sent with every request. */
  headers?: Record<string, string>
}

type QueryValue = string | number | boolean | null | undefined

const DEFAULT_BASE_URL = "https://agmx.io"

const randomId = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new AgmxError("Timeout", "Aborted"))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new AgmxError("Timeout", "Aborted"))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    signal?.addEventListener("abort", onAbort, { once: true })
  })

const enc = encodeURIComponent

export class Agmx {
  readonly baseUrl: string
  readonly #apiKey: string
  readonly #fetch: typeof fetch
  readonly #timeoutMs: number
  readonly #headers: Record<string, string>

  constructor(options: AgmxOptions) {
    if (!options?.apiKey) throw new AgmxError("Unauthorized", "An API key is required: new Agmx({ apiKey: 'agmx_…' })")
    this.#apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.#timeoutMs = options.timeoutMs ?? 30_000
    this.#headers = options.headers ?? {}
  }

  /** Low-level request helper. Most code should use the namespaced methods instead. */
  async request<T>(
    method: string,
    path: string,
    options: { query?: object; body?: unknown; headers?: Record<string, string>; timeoutMs?: number; raw?: boolean } = {}
  ): Promise<T> {
    return requestJson<T>(this.#fetch, `${this.baseUrl}/api/v1${path}`, method, {
      ...options,
      headers: { authorization: `Bearer ${this.#apiKey}`, ...this.#headers, ...options.headers },
      timeoutMs: options.timeoutMs ?? this.#timeoutMs
    })
  }

  // -------------------------------------------------------------------------
  // Account
  // -------------------------------------------------------------------------

  /** The authenticated account, plan limits, usage and which agent this key belongs to. */
  me(): Promise<Me> {
    return this.request("GET", "/me")
  }

  /** Daily sent/received counts. */
  usage(days = 30): Promise<UsageSeries> {
    return this.request("GET", "/usage", { query: { days } })
  }

  /** Export all account metadata, messages and usage as JSON. Account keys only. */
  exportData(): Promise<AccountExport> {
    return this.request("GET", "/account/export")
  }

  // -------------------------------------------------------------------------
  // Agents
  // -------------------------------------------------------------------------

  readonly agents = {
    list: (): Promise<Array<Agent>> => this.request("GET", "/agents"),
    create: (input: CreateAgentInput): Promise<CreateAgentResult> => this.request("POST", "/agents", { body: input }),
    get: (agentId: string): Promise<AgentWithSecret> => this.request("GET", `/agents/${enc(agentId)}`),
    update: (agentId: string, input: UpdateAgentInput): Promise<Agent> => this.request("PATCH", `/agents/${enc(agentId)}`, { body: input }),
    delete: (agentId: string): Promise<{ ok: boolean }> => this.request("DELETE", `/agents/${enc(agentId)}`),
    rotateWebhookSecret: (agentId: string): Promise<AgentWithSecret> => this.request("POST", `/agents/${enc(agentId)}/webhook-secret`),
    testWebhook: (agentId: string): Promise<WebhookDelivery> => this.request("POST", `/agents/${enc(agentId)}/webhook-test`),
    webhookDeliveries: (agentId: string): Promise<Array<WebhookDelivery>> => this.request("GET", `/agents/${enc(agentId)}/webhook-deliveries`),
    reputation: (agentId: string): Promise<AgentReputation> => this.request("GET", `/agents/${enc(agentId)}/reputation`),
    pauseSending: (agentId: string, options: { reason?: string | null } = {}): Promise<AgentReputation> =>
      this.request("POST", `/agents/${enc(agentId)}/sending/pause`, { body: options }),
    resumeSending: (agentId: string): Promise<AgentReputation> => this.request("POST", `/agents/${enc(agentId)}/sending/resume`)
  }

  // -------------------------------------------------------------------------
  // Inboxes
  // -------------------------------------------------------------------------

  readonly inboxes = {
    list: (options: { agentId?: string } = {}): Promise<Array<Inbox>> => this.request("GET", "/inboxes", { query: options }),
    /** Pass `expiresIn` (seconds) for a temporary inbox, `maxMessages` and `acceptFrom` to lock it down. */
    create: (input: CreateInboxInput = {}): Promise<Inbox> => this.request("POST", "/inboxes", { body: input }),
    get: (inboxId: string): Promise<Inbox> => this.request("GET", `/inboxes/${enc(inboxId)}`),
    update: (inboxId: string, input: UpdateInboxInput): Promise<Inbox> => this.request("PATCH", `/inboxes/${enc(inboxId)}`, { body: input }),
    delete: (inboxId: string): Promise<{ ok: boolean }> => this.request("DELETE", `/inboxes/${enc(inboxId)}`)
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  readonly messages = {
    list: (query: ListMessagesQuery = {}): Promise<MessagePage> => this.request("GET", "/messages", { query }),
    get: (messageId: string, options: { markRead?: boolean } = {}): Promise<Message> =>
      this.request("GET", `/messages/${enc(messageId)}`, { query: { markRead: options.markRead === undefined ? undefined : String(options.markRead) } }),
    /** Send now (or at `sendAt`). An Idempotency-Key is generated unless you pass `idempotencyKey`. */
    send: (input: SendInput): Promise<Message> =>
      this.request("POST", "/messages", { body: input, headers: { "idempotency-key": input.idempotencyKey ?? randomId() } }),
    reply: (messageId: string, input: ReplyInput): Promise<Message> =>
      this.request("POST", `/messages/${enc(messageId)}/reply`, { body: input, headers: { "idempotency-key": input.idempotencyKey ?? randomId() } }),
    forward: (messageId: string, input: ForwardInput): Promise<Message> =>
      this.request("POST", `/messages/${enc(messageId)}/forward`, { body: input, headers: { "idempotency-key": input.idempotencyKey ?? randomId() } }),
    update: (messageId: string, input: UpdateMessageInput): Promise<MessageSummary> => this.request("PATCH", `/messages/${enc(messageId)}`, { body: input }),
    delete: (messageId: string): Promise<{ ok: boolean }> => this.request("DELETE", `/messages/${enc(messageId)}`),
    /** Cancel a scheduled send (it becomes a draft again). */
    cancel: (messageId: string): Promise<Message> => this.request("POST", `/messages/${enc(messageId)}/cancel`),
    /** Long-poll until a new inbound message arrives (max 60s). */
    wait: (query: WaitQuery = {}): Promise<WaitResult> =>
      this.request("GET", "/messages/wait", { query, timeoutMs: (Math.min(query.timeout ?? 30, 60) + 15) * 1000 }),
    /** Download an attachment's bytes. */
    attachment: async (messageId: string, attachmentId: string): Promise<ArrayBuffer> =>
      this.request("GET", `/messages/${enc(messageId)}/attachments/${enc(attachmentId)}`, { raw: true })
  }

  // -------------------------------------------------------------------------
  // Threads, drafts, approvals, rules, domains, keys
  // -------------------------------------------------------------------------

  readonly threads = {
    list: (query: ListThreadsQuery = {}): Promise<ThreadPage> => this.request("GET", "/threads", { query }),
    get: (threadId: string): Promise<Thread> => this.request("GET", `/threads/${enc(threadId)}`)
  }

  readonly drafts = {
    list: (query: { inboxId?: string; limit?: number; cursor?: string } = {}): Promise<MessagePage> => this.request("GET", "/drafts", { query }),
    create: (input: DraftInput = {}): Promise<Message> => this.request("POST", "/drafts", { body: input }),
    update: (messageId: string, input: DraftInput): Promise<Message> => this.request("PATCH", `/drafts/${enc(messageId)}`, { body: input }),
    delete: (messageId: string): Promise<{ ok: boolean }> => this.request("DELETE", `/drafts/${enc(messageId)}`),
    send: (messageId: string, options: { sendAt?: string } = {}): Promise<Message> =>
      this.request("POST", `/drafts/${enc(messageId)}/send`, { body: options })
  }

  /** Mail held by an agent's send policy. Humans and account keys only. */
  readonly approvals = {
    list: (): Promise<Array<Message>> => this.request("GET", "/approvals"),
    approve: (messageId: string): Promise<Message> => this.request("POST", `/approvals/${enc(messageId)}/approve`),
    reject: (messageId: string, options: { reason?: string } = {}): Promise<Message> =>
      this.request("POST", `/approvals/${enc(messageId)}/reject`, { body: options })
  }

  readonly rules = {
    list: (inboxId: string): Promise<Array<InboxRule>> => this.request("GET", `/inboxes/${enc(inboxId)}/rules`),
    create: (inboxId: string, input: CreateRuleInput): Promise<InboxRule> => this.request("POST", `/inboxes/${enc(inboxId)}/rules`, { body: input }),
    update: (ruleId: string, input: UpdateRuleInput): Promise<InboxRule> => this.request("PATCH", `/rules/${enc(ruleId)}`, { body: input }),
    delete: (ruleId: string): Promise<{ ok: boolean }> => this.request("DELETE", `/rules/${enc(ruleId)}`)
  }

  readonly domains = {
    list: (): Promise<Array<Domain>> => this.request("GET", "/domains"),
    create: (name: string): Promise<Domain> => this.request("POST", "/domains", { body: { name } }),
    get: (domainId: string): Promise<Domain> => this.request("GET", `/domains/${enc(domainId)}`),
    verify: (domainId: string): Promise<Domain> => this.request("POST", `/domains/${enc(domainId)}/verify`),
    delete: (domainId: string): Promise<{ ok: boolean }> => this.request("DELETE", `/domains/${enc(domainId)}`)
  }

  readonly apiKeys = {
    list: (): Promise<Array<ApiKey>> => this.request("GET", "/api-keys"),
    create: (input: { name: string; agentId?: string | null }): Promise<CreatedApiKey> => this.request("POST", "/api-keys", { body: input }),
    revoke: (keyId: string): Promise<{ ok: boolean }> => this.request("DELETE", `/api-keys/${enc(keyId)}`)
  }

  // -------------------------------------------------------------------------
  // Conveniences
  // -------------------------------------------------------------------------

  /**
   * Wait for the next email (optionally from a sender) and return its first
   * extracted verification code. Resolves `null` on timeout.
   */
  async waitForCode(options: { inboxId?: string; from?: string; subject?: string; timeout?: number; since?: string } = {}): Promise<{ code: string; message: Message } | null> {
    const deadline = Date.now() + (options.timeout ?? 60) * 1000
    let since = options.since ?? new Date(Date.now() - 1000).toISOString()
    while (Date.now() < deadline) {
      const remaining = Math.max(1, Math.min(60, Math.ceil((deadline - Date.now()) / 1000)))
      const { message } = await this.messages.wait({ inboxId: options.inboxId, from: options.from, subject: options.subject, since, timeout: remaining })
      if (!message) continue
      const code = message.extracted.codes[0]
      if (code) return { code, message }
      since = message.createdAt
    }
    return null
  }

  // -------------------------------------------------------------------------
  // Agent self sign-up (no key needed)
  // -------------------------------------------------------------------------

  static readonly signupApi = {
    start: (
      input: { name: string; username?: string; description?: string; ownerEmail?: string },
      options: { baseUrl?: string; fetch?: typeof fetch } = {}
    ): Promise<SignupStart> =>
      requestJson(options.fetch ?? globalThis.fetch.bind(globalThis), `${(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")}/api/v1/signup`, "POST", { body: input }),
    poll: (signupId: string, token: string, options: { baseUrl?: string; fetch?: typeof fetch } = {}): Promise<SignupStatus> =>
      requestJson(options.fetch ?? globalThis.fetch.bind(globalThis), `${(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "")}/api/v1/signup/${enc(signupId)}`, "GET", {
        query: { token }
      })
  }

  /**
   * Run the agent sign-up flow end to end: request an inbox, hand the approval
   * link to your human (`onApprovalUrl`), and poll until they approve.
   * Returns the new API key (shown once — store it securely) and a ready client.
   */
  static async signup(options: {
    name: string
    username?: string
    description?: string
    ownerEmail?: string
    baseUrl?: string
    fetch?: typeof fetch
    /** Called once with the approval link and code. Defaults to logging them. */
    onApprovalUrl?: (info: { approvalUrl: string; userCode: string; expiresAt: string }) => void | Promise<void>
    /** Stop polling after this many ms (default: until the request expires, ~30 min). */
    timeoutMs?: number
    signal?: AbortSignal
  }): Promise<{ apiKey: string; agent: SignupStatus["agent"]; inbox: SignupStatus["inbox"]; client: Agmx }> {
    const http = { baseUrl: options.baseUrl, fetch: options.fetch }
    const started = await Agmx.signupApi.start(
      { name: options.name, username: options.username, description: options.description, ownerEmail: options.ownerEmail },
      http
    )
    const notify = options.onApprovalUrl ?? ((i) => console.log(`Approve this agent at ${i.approvalUrl} (code ${i.userCode})`))
    await notify({ approvalUrl: started.approvalUrl, userCode: started.userCode, expiresAt: started.expiresAt })
    const deadline = options.timeoutMs ? Date.now() + options.timeoutMs : new Date(started.expiresAt).getTime() + 5_000
    while (Date.now() < deadline) {
      await sleep(started.pollIntervalSeconds * 1000, options.signal)
      const status = await Agmx.signupApi.poll(started.signupId, started.pollToken, http)
      if (status.status === "approved" && status.apiKey) {
        return { apiKey: status.apiKey, agent: status.agent, inbox: status.inbox, client: new Agmx({ apiKey: status.apiKey, baseUrl: options.baseUrl, fetch: options.fetch }) }
      }
      if (status.status === "denied") throw new AgmxError("SignupDenied", "Your human denied this sign-up request.")
      if (status.status === "expired") throw new AgmxError("SignupExpired", "The sign-up request expired before it was approved. Start again.")
      if (status.status === "completed") throw new AgmxError("SignupAlreadyCompleted", "This sign-up was already completed; its key was handed out earlier.")
    }
    throw new AgmxError("Timeout", "Timed out waiting for approval.")
  }
}

async function requestJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  method: string,
  options: { query?: object; body?: unknown; headers?: Record<string, string>; timeoutMs?: number; raw?: boolean }
): Promise<T> {
  const target = new URL(url)
  for (const [key, value] of Object.entries((options.query ?? {}) as Record<string, QueryValue>)) {
    if (value !== undefined && value !== null) target.searchParams.set(key, String(value))
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000)
  let response: Response
  try {
    response = await fetchImpl(target, {
      method,
      headers: {
        accept: "application/json",
        ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        "user-agent": "agmx-sdk-js/0.1.0",
        ...options.headers
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    })
  } catch (error) {
    const aborted = controller.signal.aborted
    throw new AgmxError(aborted ? "Timeout" : "NetworkError", aborted ? `Request timed out: ${method} ${target.pathname}` : `Network error: ${(error as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
  if (options.raw && response.ok) return (await response.arrayBuffer()) as T
  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { message: text }
    }
  }
  if (!response.ok) {
    const body = (data && typeof data === "object" ? data : {}) as Record<string, unknown>
    const tag = typeof body._tag === "string" ? body._tag : "HttpError"
    const message = typeof body.message === "string" ? body.message : `${response.status} ${response.statusText}`
    throw new AgmxError(tag, message, response.status, body)
  }
  return data as T
}

export default Agmx
