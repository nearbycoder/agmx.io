import { Cause, Logger } from "effect"
import { env } from "./env"

/**
 * Operator alerts: errors that need a human (background jobs failing, SES refusing mail,
 * crashes) are emailed to ALERT_EMAILS (default ADMIN_EMAILS) and posted to ALERT_WEBHOOK_URL.
 *
 * Deduplicated per key for an hour and capped per hour overall, so a failure loop sends a
 * handful of alerts, not thousands.
 */
const DEDUPE_MS = 60 * 60_000
const MAX_PER_HOUR = 20

const lastSent = new Map<string, number>()
let windowStart = Date.now()
let sentInWindow = 0
let suppressedInWindow = 0
let sending = false

const shouldSend = (key: string, now: number) => {
  if (now - windowStart > 60 * 60_000) {
    windowStart = now
    sentInWindow = 0
    suppressedInWindow = 0
    for (const [k, ts] of lastSent) if (now - ts >= DEDUPE_MS) lastSent.delete(k)
  } else if (lastSent.size > 500) {
    for (const [k, ts] of lastSent) if (now - ts >= DEDUPE_MS) lastSent.delete(k)
  }
  const last = lastSent.get(key)
  if (last && now - last < DEDUPE_MS) return false
  if (sentInWindow >= MAX_PER_HOUR) {
    suppressedInWindow++
    return false
  }
  lastSent.set(key, now)
  sentInWindow++
  return true
}

const host = () => {
  try {
    return new URL(env.appUrl).host
  } catch {
    return "agmx"
  }
}

const deliver = async (subject: string, detail: string) => {
  const title = `[${host()}] ${subject}`
  const body = `${detail}\n\n${new Date().toISOString()}${suppressedInWindow ? `\n(${suppressedInWindow} further alerts suppressed this hour)` : ""}`
  const tasks: Array<Promise<unknown>> = []
  if (env.alertWebhookUrl) {
    const text = `${title}\n\`\`\`\n${body.slice(0, 1800)}\n\`\`\``
    tasks.push(
      fetch(env.alertWebhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // `text` for Slack, `content` for Discord.
        body: JSON.stringify({ text, content: text }),
        signal: AbortSignal.timeout(10_000)
      })
    )
  }
  if (env.alertEmails.length) {
    const [{ runtime }, { sendSystemEmail }] = await Promise.all([import("./runtime"), import("./system-mail")])
    const escaped = body.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)
    for (const to of env.alertEmails) {
      tasks.push(
        runtime.runPromise(
          sendSystemEmail({
            to,
            subject: title,
            text: body,
            html: `<pre style="font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${escaped}</pre>`
          })
        )
      )
    }
  }
  const results = await Promise.allSettled(tasks)
  for (const r of results) if (r.status === "rejected") console.warn("[alerts] delivery failed:", r.reason)
}

/** Raise an operator alert. Never throws; safe to call from anywhere. */
export const alert = (input: { key: string; subject: string; detail: string }) => {
  if (!env.alertsEnabled || sending) return
  if (!env.alertEmails.length && !env.alertWebhookUrl) return
  if (!shouldSend(input.key, Date.now())) return
  sending = true
  void deliver(input.subject, input.detail.slice(0, 8000)).finally(() => {
    sending = false
  })
}

const messageText = (message: unknown): string =>
  (Array.isArray(message) ? message : [message])
    .map((m) => (typeof m === "string" ? m : m instanceof Error ? m.message : Cause.isCause(m) ? Cause.pretty(m) : JSON.stringify(m)))
    .join(" ")

/** Effect logger that turns Error/Fatal logs into alerts. Added alongside the default logger. */
export const alertLogger = Logger.make(({ logLevel, message, cause }) => {
  if (logLevel !== "Error" && logLevel !== "Fatal") return
  const text = messageText(message)
  const first = (Array.isArray(message) ? message[0] : message) as unknown
  // Dedupe on the log's headline (e.g. "Webhook worker tick failed"), not on volatile details.
  const key = typeof first === "string" ? first.slice(0, 120) : text.slice(0, 120)
  const detail = [text, Cause.hasFails(cause) || Cause.hasDies(cause) ? Cause.pretty(cause) : ""].filter(Boolean).join("\n\n")
  alert({ key: `log:${key}`, subject: text.split("\n")[0]!.slice(0, 120), detail })
})

export const AlertLoggerLive = Logger.layer([alertLogger], { mergeWithExisting: true })

let processHooks = false
/** Alert on crashes that escape Effect entirely. */
export const installProcessAlerts = () => {
  if (processHooks || typeof process === "undefined") return
  processHooks = true
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection", reason)
    alert({ key: `unhandled:${String(reason).slice(0, 100)}`, subject: "Unhandled promise rejection", detail: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason) })
  })
}
