import { createFileRoute } from "@tanstack/react-router"

/** Server-sent events for the dashboard: pushes mail activity for the signed-in user. */
export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ runtime }, { Events }, { sessionPrincipal }, { Effect, PubSub, Fiber }] = await Promise.all([
          import("~/server/runtime"),
          import("~/server/services/Events"),
          import("~/server/http/Authorization"),
          import("effect")
        ])
        const principal = await runtime.runPromise(sessionPrincipal(request.headers))
        if (!principal) return new Response("Unauthorized", { status: 401 })

        const encoder = new TextEncoder()
        let fiber: ReturnType<typeof runtime.runFork> | undefined
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (chunk: string) => {
              try {
                controller.enqueue(encoder.encode(chunk))
              } catch {
                /* stream closed */
              }
            }
            send(`retry: 3000\nevent: ready\ndata: {}\n\n`)
            fiber = runtime.runFork(
              Effect.scoped(
                Effect.gen(function* () {
                  const events = yield* Events
                  const subscription = yield* events.subscribe
                  while (true) {
                    const next = yield* PubSub.take(subscription).pipe(Effect.timeoutOption("20 seconds"))
                    if (next._tag === "None") {
                      send(`: ping\n\n`)
                      continue
                    }
                    if (next.value.userId !== principal.userId) continue
                    send(`event: mail\ndata: ${JSON.stringify(next.value)}\n\n`)
                  }
                })
              )
            )
          },
          cancel() {
            if (fiber) runtime.runFork(Fiber.interrupt(fiber))
          }
        })
        request.signal.addEventListener("abort", () => {
          if (fiber) runtime.runFork(Fiber.interrupt(fiber))
        })
        return new Response(stream, {
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" }
        })
      }
    }
  }
})
