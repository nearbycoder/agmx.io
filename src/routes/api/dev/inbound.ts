import { createFileRoute } from "@tanstack/react-router"

/**
 * Development helper: inject an email as if it arrived from the internet.
 * POST raw MIME (message/rfc822) or JSON { from, to, subject, text, html }.
 * Disabled in production unless ENABLE_DEV_INBOUND=true.
 */
export const Route = createFileRoute("/api/dev/inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ env }, { runtime }, { Mail }, { Effect }, { composeMime }, { parseAddressList }] = await Promise.all([
          import("~/server/env"),
          import("~/server/runtime"),
          import("~/server/services/Mail"),
          import("effect"),
          import("~/server/mail/compose"),
          import("~/shared/address")
        ])
        if (!env.devInbound) return Response.json({ message: "Not found" }, { status: 404 })
        const contentType = request.headers.get("content-type") ?? ""
        let raw: Buffer
        let recipients: Array<string>
        if (contentType.includes("json")) {
          const body = (await request.json()) as { from?: string; to: string | Array<string>; subject?: string; text?: string; html?: string }
          const to = parseAddressList(body.to).valid
          const from = parseAddressList(body.from ?? "Someone <someone@example.com>").valid[0] ?? { name: null, address: "someone@example.com" }
          raw = await composeMime({
            from,
            to,
            cc: [],
            bcc: [],
            replyTo: [],
            subject: body.subject ?? "(no subject)",
            text: body.text ?? null,
            html: body.html ?? null,
            messageId: `<${crypto.randomUUID()}@example.com>`,
            attachments: []
          })
          recipients = to.map((t) => t.address)
        } else {
          raw = Buffer.from(await request.arrayBuffer())
          const url = new URL(request.url)
          recipients = url.searchParams.getAll("to")
          if (recipients.length === 0) {
            const { parseMime } = await import("~/server/mail/parse")
            const parsed = await parseMime(raw)
            recipients = [...parsed.to, ...parsed.cc].map((a) => a.address)
          }
        }
        const result = await runtime.runPromise(Effect.flatMap(Effect.service(Mail), (mail) => mail.ingestRaw(raw, recipients, { spam: "PASS", virus: "PASS", spf: "PASS", dkim: "PASS", dmarc: "PASS" })))
        return Response.json(result, { status: result.delivered ? 200 : 404 })
      }
    }
  }
})
