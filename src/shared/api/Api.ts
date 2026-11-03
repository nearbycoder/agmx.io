import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/http-api"
import { Authorization } from "./Authorization"
import * as D from "./domain"
import { Conflict, DeliveryFailed, Forbidden, InvalidRequest, NotFound, QuotaExceeded, Unauthorized } from "./errors"

const IdParam = (name: string) => ({ [name]: Schema.String })
const Ok = Schema.Struct({ ok: Schema.Boolean })

const doc = (summary: string, description?: string) =>
  OpenApi.annotations(description ? { summary, description } : { summary })

// ---------------------------------------------------------------------------

export class SystemGroup extends HttpApiGroup.make("system", { topLevel: true })
  .add(
    HttpApiEndpoint.get("health", "/health", {
      success: Schema.Struct({ ok: Schema.Boolean, version: Schema.String })
    }).annotateMerge(doc("Health check"))
  )
  .annotateMerge(OpenApi.annotations({ title: "System" }))
{}

export class AccountGroup extends HttpApiGroup.make("account")
  .add(
    HttpApiEndpoint.get("me", "/me", { success: D.Me }).annotateMerge(
      doc("Who am I", "Returns the authenticated account, plan limits and current usage. Agents should call this first.")
    ),
    HttpApiEndpoint.get("usage", "/usage", {
      query: { days: Schema.optional(Schema.Int) },
      success: D.UsageSeries
    }).annotateMerge(doc("Daily usage", "Sent and received counts per UTC day."))
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "Account" }))
{}

export class AgentsGroup extends HttpApiGroup.make("agents")
  .add(
    HttpApiEndpoint.get("list", "/agents", { success: Schema.Array(D.Agent) }).annotateMerge(doc("List agents")),
    HttpApiEndpoint.post("create", "/agents", {
      payload: D.CreateAgentPayload,
      success: D.CreateAgentResult,
      error: [QuotaExceeded, Conflict, InvalidRequest, Forbidden]
    }).annotateMerge(
      doc("Create an agent", "Creates an agent, optionally with its first inbox (`username`) and an agent-scoped API key (`createApiKey`).")
    ),
    HttpApiEndpoint.get("get", "/agents/:agentId", {
      params: IdParam("agentId"),
      success: D.AgentWithSecret,
      error: NotFound
    }).annotateMerge(doc("Get an agent", "Includes the webhook signing secret.")),
    HttpApiEndpoint.patch("update", "/agents/:agentId", {
      params: IdParam("agentId"),
      payload: D.UpdateAgentPayload,
      success: D.Agent,
      error: [NotFound, InvalidRequest]
    }).annotateMerge(doc("Update an agent")),
    HttpApiEndpoint.delete("delete", "/agents/:agentId", {
      params: IdParam("agentId"),
      success: Ok,
      error: [NotFound, Forbidden]
    }).annotateMerge(doc("Delete an agent", "Deletes the agent with all of its inboxes, messages and keys.")),
    HttpApiEndpoint.post("rotateWebhookSecret", "/agents/:agentId/webhook-secret", {
      params: IdParam("agentId"),
      success: D.AgentWithSecret,
      error: NotFound
    }).annotateMerge(doc("Rotate webhook secret")),
    HttpApiEndpoint.post("testWebhook", "/agents/:agentId/webhook-test", {
      params: IdParam("agentId"),
      success: D.WebhookDelivery,
      error: [NotFound, InvalidRequest]
    }).annotateMerge(doc("Send a test webhook", "Delivers a `webhook.test` event to the agent's webhook URL right now.")),
    HttpApiEndpoint.get("webhookDeliveries", "/agents/:agentId/webhook-deliveries", {
      params: IdParam("agentId"),
      success: Schema.Array(D.WebhookDelivery),
      error: NotFound
    }).annotateMerge(doc("Recent webhook deliveries"))
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "Agents", description: "An agent owns one or more inboxes and can have its own scoped API key." }))
{}

export class InboxesGroup extends HttpApiGroup.make("inboxes")
  .add(
    HttpApiEndpoint.get("list", "/inboxes", {
      query: { agentId: Schema.optional(Schema.String) },
      success: Schema.Array(D.Inbox)
    }).annotateMerge(doc("List inboxes")),
    HttpApiEndpoint.post("create", "/inboxes", {
      payload: D.CreateInboxPayload,
      success: D.Inbox,
      error: [QuotaExceeded, Conflict, InvalidRequest, NotFound, Forbidden]
    }).annotateMerge(doc("Create an inbox", "Claims a new address such as `scout@bot.agmx.io` for an agent.")),
    HttpApiEndpoint.get("get", "/inboxes/:inboxId", {
      params: IdParam("inboxId"),
      success: D.Inbox,
      error: NotFound
    }).annotateMerge(doc("Get an inbox")),
    HttpApiEndpoint.patch("update", "/inboxes/:inboxId", {
      params: IdParam("inboxId"),
      payload: D.UpdateInboxPayload,
      success: D.Inbox,
      error: NotFound
    }).annotateMerge(doc("Update an inbox")),
    HttpApiEndpoint.delete("delete", "/inboxes/:inboxId", {
      params: IdParam("inboxId"),
      success: Ok,
      error: NotFound
    }).annotateMerge(doc("Delete an inbox", "Releases the address and deletes its messages."))
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "Inboxes" }))
{}

export class MessagesGroup extends HttpApiGroup.make("messages")
  .add(
    HttpApiEndpoint.get("list", "/messages", {
      query: {
        inboxId: Schema.optional(Schema.String),
        agentId: Schema.optional(Schema.String),
        threadId: Schema.optional(Schema.String),
        direction: Schema.optional(Schema.Literals(["inbound", "outbound"])),
        folder: Schema.optional(Schema.Literals(["inbox", "sent", "starred", "archived", "spam", "all"])),
        unread: Schema.optional(Schema.Literals(["true", "false"])),
        q: Schema.optional(Schema.String),
        since: Schema.optional(Schema.String),
        limit: Schema.optional(Schema.Int),
        cursor: Schema.optional(Schema.String)
      },
      success: D.MessagePage
    }).annotateMerge(doc("List messages", "Newest first. Use `cursor` from the previous page to paginate. `q` searches subject, body and addresses.")),
    HttpApiEndpoint.get("wait", "/messages/wait", {
      query: {
        inboxId: Schema.optional(Schema.String),
        since: Schema.optional(Schema.String),
        timeout: Schema.optional(Schema.Int),
        from: Schema.optional(Schema.String),
        subject: Schema.optional(Schema.String)
      },
      success: D.WaitResult,
      error: NotFound
    }).annotateMerge(
      doc(
        "Wait for the next email",
        "Long-polls until a new inbound message arrives (max 60s, default 30s). Perfect for verification codes: call it right after triggering a sign-up, then read `message.extracted.codes`."
      )
    ),
    HttpApiEndpoint.get("get", "/messages/:messageId", {
      params: IdParam("messageId"),
      query: { markRead: Schema.optional(Schema.Literals(["true", "false"])) },
      success: D.Message,
      error: NotFound
    }).annotateMerge(doc("Get a message", "Full message with text, HTML, headers, attachments and extracted codes/links.")),
    HttpApiEndpoint.patch("update", "/messages/:messageId", {
      params: IdParam("messageId"),
      payload: D.UpdateMessagePayload,
      success: D.MessageSummary,
      error: NotFound
    }).annotateMerge(doc("Update flags", "Mark read/unread, star, archive or relabel.")),
    HttpApiEndpoint.delete("delete", "/messages/:messageId", {
      params: IdParam("messageId"),
      success: Ok,
      error: NotFound
    }).annotateMerge(doc("Delete a message")),
    HttpApiEndpoint.post("send", "/messages", {
      payload: D.SendMessagePayload,
      success: D.Message,
      error: [QuotaExceeded, InvalidRequest, NotFound, Forbidden, DeliveryFailed]
    }).annotateMerge(doc("Send an email", "Sends from one of your inboxes. Each recipient counts toward your plan's send quota.")),
    HttpApiEndpoint.post("reply", "/messages/:messageId/reply", {
      params: IdParam("messageId"),
      payload: D.ReplyPayload,
      success: D.Message,
      error: [QuotaExceeded, InvalidRequest, NotFound, Forbidden, DeliveryFailed]
    }).annotateMerge(doc("Reply to a message", "Threads correctly via In-Reply-To/References. Set `replyAll` to include all original recipients.")),
    HttpApiEndpoint.post("forward", "/messages/:messageId/forward", {
      params: IdParam("messageId"),
      payload: D.ForwardPayload,
      success: D.Message,
      error: [QuotaExceeded, InvalidRequest, NotFound, Forbidden, DeliveryFailed]
    }).annotateMerge(doc("Forward a message")),
    HttpApiEndpoint.get("attachment", "/messages/:messageId/attachments/:attachmentId", {
      params: { messageId: Schema.String, attachmentId: Schema.String },
      success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "application/octet-stream" })),
      error: NotFound
    }).annotateMerge(doc("Download an attachment"))
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "Messages" }))
{}

export class ThreadsGroup extends HttpApiGroup.make("threads")
  .add(
    HttpApiEndpoint.get("list", "/threads", {
      query: {
        inboxId: Schema.optional(Schema.String),
        agentId: Schema.optional(Schema.String),
        limit: Schema.optional(Schema.Int),
        cursor: Schema.optional(Schema.String)
      },
      success: D.ThreadPage
    }).annotateMerge(doc("List threads")),
    HttpApiEndpoint.get("get", "/threads/:threadId", {
      params: IdParam("threadId"),
      success: D.ThreadWithMessages,
      error: NotFound
    }).annotateMerge(doc("Get a thread with all messages"))
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "Threads" }))
{}

export class DomainsGroup extends HttpApiGroup.make("domains")
  .add(
    HttpApiEndpoint.get("list", "/domains", { success: Schema.Array(D.Domain), error: Forbidden }).annotateMerge(doc("List custom domains")),
    HttpApiEndpoint.post("create", "/domains", {
      payload: D.CreateDomainPayload,
      success: D.Domain,
      error: [QuotaExceeded, Conflict, InvalidRequest, Forbidden, DeliveryFailed]
    }).annotateMerge(doc("Add a custom domain", "Registers the domain with SES and returns the DNS records to publish.")),
    HttpApiEndpoint.get("get", "/domains/:domainId", {
      params: IdParam("domainId"),
      success: D.Domain,
      error: [NotFound, Forbidden]
    }).annotateMerge(doc("Get a domain")),
    HttpApiEndpoint.post("verify", "/domains/:domainId/verify", {
      params: IdParam("domainId"),
      success: D.Domain,
      error: [NotFound, Forbidden]
    }).annotateMerge(doc("Re-check DNS", "Refreshes DKIM and MX verification status.")),
    HttpApiEndpoint.delete("delete", "/domains/:domainId", {
      params: IdParam("domainId"),
      success: Ok,
      error: [NotFound, Forbidden]
    }).annotateMerge(doc("Remove a domain"))
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "Domains" }))
{}

export class ApiKeysGroup extends HttpApiGroup.make("apiKeys")
  .add(
    HttpApiEndpoint.get("list", "/api-keys", { success: Schema.Array(D.ApiKey), error: Forbidden }).annotateMerge(doc("List API keys")),
    HttpApiEndpoint.post("create", "/api-keys", {
      payload: D.CreateApiKeyPayload,
      success: D.CreatedApiKey,
      error: [NotFound, Forbidden]
    }).annotateMerge(doc("Create an API key", "The secret is returned once. Pass `agentId` to scope the key to a single agent.")),
    HttpApiEndpoint.delete("revoke", "/api-keys/:keyId", {
      params: IdParam("keyId"),
      success: Ok,
      error: [NotFound, Forbidden]
    }).annotateMerge(doc("Revoke an API key"))
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "API keys" }))
{}

/** Unauthenticated half of the agent sign-up flow. */
export class AgentSignupGroup extends HttpApiGroup.make("signup")
  .add(
    HttpApiEndpoint.post("start", "/signup", {
      payload: D.StartSignupPayload,
      success: D.StartSignupResult,
      error: [Forbidden, InvalidRequest]
    }).annotateMerge(
      doc(
        "Agent self sign-up",
        "No credentials needed. Returns an approval URL for your human and a poll token. Poll `GET /signup/{signupId}` until `status` is `approved` to receive your API key."
      )
    ),
    HttpApiEndpoint.get("poll", "/signup/:signupId", {
      params: IdParam("signupId"),
      query: { token: Schema.String },
      success: D.SignupStatus,
      error: [NotFound, Unauthorized]
    }).annotateMerge(doc("Poll sign-up status", "Pass the `pollToken` as `?token=`. The API key is returned exactly once."))
  )
  .annotateMerge(OpenApi.annotations({ title: "Agent sign-up" }))
{}

/** Human half of the agent sign-up flow. */
export class SignupApprovalsGroup extends HttpApiGroup.make("signupApprovals")
  .add(
    HttpApiEndpoint.get("list", "/signup-requests", { success: Schema.Array(D.PendingSignup), error: Forbidden }).annotateMerge(
      doc("Pending agent sign-ups")
    ),
    HttpApiEndpoint.get("get", "/signup-requests/:userCode", {
      params: IdParam("userCode"),
      success: D.PendingSignup,
      error: [NotFound, Forbidden]
    }).annotateMerge(doc("Look up a sign-up request by code")),
    HttpApiEndpoint.post("approve", "/signup-requests/:userCode/approve", {
      params: IdParam("userCode"),
      payload: D.ApproveSignupPayload,
      success: D.Agent,
      error: [NotFound, Forbidden, Conflict, QuotaExceeded, InvalidRequest]
    }).annotateMerge(doc("Approve an agent")),
    HttpApiEndpoint.post("deny", "/signup-requests/:userCode/deny", {
      params: IdParam("userCode"),
      success: Ok,
      error: [NotFound, Forbidden]
    }).annotateMerge(doc("Deny an agent"))
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "Sign-up approvals" }))
{}

export class AdminGroup extends HttpApiGroup.make("admin")
  .add(
    HttpApiEndpoint.get("users", "/admin/users", { success: Schema.Array(D.AdminUser), error: Forbidden }),
    HttpApiEndpoint.patch("updateUser", "/admin/users/:userId", {
      params: IdParam("userId"),
      payload: D.UpdateAdminUserPayload,
      success: D.AdminUser,
      error: [Forbidden, NotFound]
    }),
    HttpApiEndpoint.get("system", "/admin/system", { success: D.SystemStatus, error: Forbidden })
  )
  .middleware(Authorization)
  .annotateMerge(OpenApi.annotations({ title: "Admin", description: "Operator-only endpoints." }))
{}

export class AgmxApi extends HttpApi.make("agmx")
  .add(SystemGroup)
  .add(AccountGroup)
  .add(AgentsGroup)
  .add(InboxesGroup)
  .add(MessagesGroup)
  .add(ThreadsGroup)
  .add(DomainsGroup)
  .add(ApiKeysGroup)
  .add(AgentSignupGroup)
  .add(SignupApprovalsGroup)
  .add(AdminGroup)
  .prefix("/api/v1")
  .annotateMerge(
    OpenApi.annotations({
      title: "AGMX API",
      version: "1.0.0",
      description:
        "Email inboxes for AI agents. Authenticate with `Authorization: Bearer agmx_…`. Every error has a stable `_tag` and a human readable `message`."
    })
  )
{}
