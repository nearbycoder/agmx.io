import { Effect, Layer } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"
import { AgmxApi } from "~/shared/api/Api"
import { CurrentPrincipal } from "~/shared/api/Authorization"
import { Account } from "../services/Account"
import { Agents } from "../services/Agents"
import { Domains } from "../services/Domains"
import { Mail } from "../services/Mail"
import { Signups } from "../services/Signups"
import { Storage } from "../services/Storage"
import { Webhooks } from "../services/Webhooks"

const ok = { ok: true } as const

const SystemHandlers = HttpApiBuilder.group(AgmxApi, "system", (handlers) =>
  Effect.succeed(handlers.handle("health", () => Effect.succeed({ ok: true, version: "1.0.0" })))
)

const AccountHandlers = HttpApiBuilder.group(
  AgmxApi,
  "account",
  Effect.fn(function* (handlers) {
    const account = yield* Account
    return handlers
      .handle("me", () => Effect.flatMap(Effect.service(CurrentPrincipal), account.me))
      .handle("usage", ({ query }) => Effect.flatMap(Effect.service(CurrentPrincipal), (p) => account.usage(p, query.days ?? 30)))
  })
)

const AgentsHandlers = HttpApiBuilder.group(
  AgmxApi,
  "agents",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents
    const webhooks = yield* Webhooks
    const withPrincipal = Effect.service(CurrentPrincipal)
    return handlers
      .handle("list", () => Effect.flatMap(withPrincipal, agents.list))
      .handle("create", ({ payload }) => Effect.flatMap(withPrincipal, (p) => agents.create(p, payload)))
      .handle("get", ({ params }) => Effect.flatMap(withPrincipal, (p) => agents.get(p, params.agentId)))
      .handle("update", ({ params, payload }) => Effect.flatMap(withPrincipal, (p) => agents.update(p, params.agentId, payload)))
      .handle("delete", ({ params }) => Effect.flatMap(withPrincipal, (p) => agents.remove(p, params.agentId)).pipe(Effect.as(ok)))
      .handle("rotateWebhookSecret", ({ params }) => Effect.flatMap(withPrincipal, (p) => agents.rotateWebhookSecret(p, params.agentId)))
      .handle("testWebhook", ({ params }) => Effect.flatMap(withPrincipal, (p) => webhooks.test(p, params.agentId)))
      .handle("webhookDeliveries", ({ params }) => Effect.flatMap(withPrincipal, (p) => webhooks.list(p, params.agentId)))
  })
)

const InboxesHandlers = HttpApiBuilder.group(
  AgmxApi,
  "inboxes",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents
    const withPrincipal = Effect.service(CurrentPrincipal)
    return handlers
      .handle("list", ({ query }) => Effect.flatMap(withPrincipal, (p) => agents.listInboxes(p, query.agentId)))
      .handle("create", ({ payload }) => Effect.flatMap(withPrincipal, (p) => agents.createInbox(p, payload)))
      .handle("get", ({ params }) => Effect.flatMap(withPrincipal, (p) => agents.getInbox(p, params.inboxId)))
      .handle("update", ({ params, payload }) => Effect.flatMap(withPrincipal, (p) => agents.updateInbox(p, params.inboxId, payload)))
      .handle("delete", ({ params }) => Effect.flatMap(withPrincipal, (p) => agents.removeInbox(p, params.inboxId)).pipe(Effect.as(ok)))
  })
)

const MessagesHandlers = HttpApiBuilder.group(
  AgmxApi,
  "messages",
  Effect.fn(function* (handlers) {
    const mail = yield* Mail
    const storage = yield* Storage
    const withPrincipal = Effect.service(CurrentPrincipal)
    return handlers
      .handle("list", ({ query }) => Effect.flatMap(withPrincipal, (p) => mail.list(p, query)))
      .handle("wait", ({ query }) => Effect.flatMap(withPrincipal, (p) => mail.wait(p, query)))
      .handle("get", ({ params, query }) => Effect.flatMap(withPrincipal, (p) => mail.get(p, params.messageId, query.markRead === "true")))
      .handle("update", ({ params, payload }) => Effect.flatMap(withPrincipal, (p) => mail.update(p, params.messageId, payload)))
      .handle("delete", ({ params }) => Effect.flatMap(withPrincipal, (p) => mail.remove(p, params.messageId)).pipe(Effect.as(ok)))
      .handle("send", ({ payload }) => Effect.flatMap(withPrincipal, (p) => mail.send(p, payload)))
      .handle("reply", ({ params, payload }) => Effect.flatMap(withPrincipal, (p) => mail.reply(p, params.messageId, payload)))
      .handle("forward", ({ params, payload }) => Effect.flatMap(withPrincipal, (p) => mail.forward(p, params.messageId, payload)))
      .handle("attachment", ({ params }) =>
        Effect.gen(function* () {
          const principal = yield* withPrincipal
          const file = yield* mail.attachment(principal, params.messageId, params.attachmentId)
          const request = yield* HttpServerRequest.HttpServerRequest
          // Only render known-safe types inline. Anything else (HTML, SVG, …) is forced to download
          // and sandboxed, so a malicious attachment can never execute on the AGMX origin.
          const safeInline = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|text\/plain)$/i.test(file.contentType)
          const inline = safeInline && new URL(request.url, "http://x").searchParams.get("inline") === "1"
          if (file.storageKey) {
            // Object storage: hand the client a short-lived signed URL so bytes skip the app entirely.
            const url = yield* storage.signedUrl(file.storageKey, {
              filename: file.filename,
              contentType: safeInline ? file.contentType : "application/octet-stream",
              inline
            })
            return HttpServerResponse.redirect(url, { status: 302, headers: { "cache-control": "private, max-age=60" } })
          }
          return HttpServerResponse.uint8Array(new Uint8Array(file.content ?? Buffer.alloc(0)), {
            contentType: safeInline ? file.contentType : "application/octet-stream",
            headers: {
              "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
              "cache-control": "private, max-age=3600",
              "x-content-type-options": "nosniff",
              ...(file.contentType.toLowerCase() === "application/pdf" ? {} : { "content-security-policy": "default-src 'none'; img-src 'self' data:; sandbox" })
            }
          })
        })
      )
  })
)

const ThreadsHandlers = HttpApiBuilder.group(
  AgmxApi,
  "threads",
  Effect.fn(function* (handlers) {
    const mail = yield* Mail
    const withPrincipal = Effect.service(CurrentPrincipal)
    return handlers
      .handle("list", ({ query }) => Effect.flatMap(withPrincipal, (p) => mail.listThreads(p, query)))
      .handle("get", ({ params }) => Effect.flatMap(withPrincipal, (p) => mail.getThread(p, params.threadId)))
  })
)

const DomainsHandlers = HttpApiBuilder.group(
  AgmxApi,
  "domains",
  Effect.fn(function* (handlers) {
    const domains = yield* Domains
    const withPrincipal = Effect.service(CurrentPrincipal)
    return handlers
      .handle("list", () => Effect.flatMap(withPrincipal, domains.list))
      .handle("create", ({ payload }) => Effect.flatMap(withPrincipal, (p) => domains.create(p, payload.name)))
      .handle("get", ({ params }) => Effect.flatMap(withPrincipal, (p) => domains.get(p, params.domainId)))
      .handle("verify", ({ params }) => Effect.flatMap(withPrincipal, (p) => domains.verify(p, params.domainId)))
      .handle("delete", ({ params }) => Effect.flatMap(withPrincipal, (p) => domains.remove(p, params.domainId)).pipe(Effect.as(ok)))
  })
)

const ApiKeysHandlers = HttpApiBuilder.group(
  AgmxApi,
  "apiKeys",
  Effect.fn(function* (handlers) {
    const agents = yield* Agents
    const withPrincipal = Effect.service(CurrentPrincipal)
    return handlers
      .handle("list", () => Effect.flatMap(withPrincipal, agents.listKeys))
      .handle("create", ({ payload }) => Effect.flatMap(withPrincipal, (p) => agents.createKey(p, payload)))
      .handle("revoke", ({ params }) => Effect.flatMap(withPrincipal, (p) => agents.revokeKey(p, params.keyId)).pipe(Effect.as(ok)))
  })
)

const SignupHandlers = HttpApiBuilder.group(
  AgmxApi,
  "signup",
  Effect.fn(function* (handlers) {
    const signups = yield* Signups
    return handlers
      .handle("start", ({ payload }) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const forwarded = request.headers["x-forwarded-for"]?.split(",")[0]?.trim()
          const ip = forwarded || (request.remoteAddress._tag === "Some" ? request.remoteAddress.value : null)
          return yield* signups.start(payload, { ip, userAgent: request.headers["user-agent"] ?? null })
        })
      )
      .handle("poll", ({ params, query }) => signups.poll(params.signupId, query.token))
  })
)

const SignupApprovalHandlers = HttpApiBuilder.group(
  AgmxApi,
  "signupApprovals",
  Effect.fn(function* (handlers) {
    const signups = yield* Signups
    const withPrincipal = Effect.service(CurrentPrincipal)
    return handlers
      .handle("list", () => Effect.flatMap(withPrincipal, signups.list))
      .handle("get", ({ params }) => Effect.flatMap(withPrincipal, (p) => signups.get(p, params.userCode)))
      .handle("approve", ({ params, payload }) => Effect.flatMap(withPrincipal, (p) => signups.approve(p, params.userCode, payload)))
      .handle("deny", ({ params }) => Effect.flatMap(withPrincipal, (p) => signups.deny(p, params.userCode)).pipe(Effect.as(ok)))
  })
)

const AdminHandlers = HttpApiBuilder.group(
  AgmxApi,
  "admin",
  Effect.fn(function* (handlers) {
    const account = yield* Account
    const withPrincipal = Effect.service(CurrentPrincipal)
    return handlers
      .handle("users", () => Effect.flatMap(withPrincipal, account.adminUsers))
      .handle("updateUser", ({ params, payload }) => Effect.flatMap(withPrincipal, (p) => account.adminUpdateUser(p, params.userId, payload)))
      .handle("system", () => Effect.flatMap(withPrincipal, account.system))
  })
)

export const HandlersLive = Layer.mergeAll(
  SystemHandlers,
  AccountHandlers,
  AgentsHandlers,
  InboxesHandlers,
  MessagesHandlers,
  ThreadsHandlers,
  DomainsHandlers,
  ApiKeysHandlers,
  SignupHandlers,
  SignupApprovalHandlers,
  AdminHandlers
)
