import { createFileRoute } from "@tanstack/react-router"

/**
 * SES → SNS → here. Point an SNS HTTPS subscription at /api/inbound/ses for
 * both your receipt-rule topic (inbound mail) and your configuration-set
 * topic (bounces, complaints, deliveries).
 */
export const Route = createFileRoute("/api/inbound/ses")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ runtime }, { Inbound }, { Effect }] = await Promise.all([
          import("~/server/runtime"),
          import("~/server/services/Inbound"),
          import("effect")
        ])
        const body = await request.text()
        const result = await runtime.runPromise(Effect.flatMap(Effect.service(Inbound), (inbound) => inbound.handleSns(body)))
        return Response.json({ message: result.message }, { status: result.status })
      }
    }
  }
})
