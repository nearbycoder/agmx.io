import { Effect } from "effect"
import { parseAddress } from "~/shared/address"
import { env } from "./env"
import { newId } from "./ids"
import { composeMime } from "./mail/compose"
import { MailTransport } from "./services/MailTransport"

/** Transactional mail sent by AGMX itself (magic links, password resets). */
export const sendSystemEmail = (input: { to: string; subject: string; text: string; html: string }) =>
  Effect.gen(function* () {
    const transport = yield* MailTransport
    const from = parseAddress(env.systemFrom) ?? { name: "AGMX", address: `no-reply@${env.mailDomain}` }
    const raw = yield* Effect.promise(() =>
      composeMime({
        from,
        to: [{ name: null, address: input.to }],
        cc: [],
        bcc: [],
        replyTo: [],
        subject: input.subject,
        text: input.text,
        html: input.html,
        messageId: `<${newId("sys").replace("sys_", "")}@${env.mailDomain}>`,
        attachments: []
      })
    )
    if (transport.name === "log") {
      yield* Effect.logInfo(`\n┌─ System email to ${input.to}\n│ ${input.subject}\n│\n${input.text.split("\n").map((l) => `│ ${l}`).join("\n")}\n└─`)
      return
    }
    yield* transport.send({ from: env.systemFrom, recipients: [input.to], raw })
  })

const abuseHtml = () =>
  env.systemInboxes.includes("abuse")
    ? `<br><br>Report abuse: <a href="mailto:abuse@${env.contactDomain}" style="color:#8a8a85">abuse@${env.contactDomain}</a>`
    : ""

export const buttonEmail = (opts: { heading: string; body: string; cta: string; url: string; footer: string }) => ({
  text: `${opts.heading}\n\n${opts.body}\n\n${opts.cta}: ${opts.url}\n\n${opts.footer}${env.systemInboxes.includes("abuse") ? `\n\nReport abuse: abuse@${env.contactDomain}` : ""}`,
  html: `<!doctype html><html><body style="margin:0;background:#f4f4f0;padding:40px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e6e6df" cellpadding="0" cellspacing="0">
    <tr><td style="padding:32px 32px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="vertical-align:middle"><img src="${env.appUrl}/email-logo.png" width="28" height="28" alt="" style="display:block;border:0;border-radius:7px"></td><td style="vertical-align:middle;padding-left:9px;font-size:19px;font-weight:600;letter-spacing:-0.04em;color:#0c0c0d">agmx</td></tr></table></td></tr>
    <tr><td style="padding:24px 32px 8px"><h1 style="margin:0;font-size:22px;line-height:1.3;color:#0b0b0c">${opts.heading}</h1></td></tr>
    <tr><td style="padding:0 32px 24px;color:#4a4a48;font-size:15px;line-height:1.6">${opts.body}</td></tr>
    <tr><td style="padding:0 32px 32px"><a href="${opts.url}" style="display:inline-block;background:#0c0c0d;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 18px;border-radius:8px">${opts.cta}</a></td></tr>
    <tr><td style="padding:20px 32px;border-top:1px solid #efefea;color:#8a8a85;font-size:12px;line-height:1.5">${opts.footer}<br><span style="word-break:break-all">${opts.url}</span>${abuseHtml()}</td></tr>
  </table></td></tr></table></body></html>`
})
