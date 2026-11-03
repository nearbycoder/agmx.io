import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/llms.txt")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ llmsTxt }, { env }] = await Promise.all([import("~/content/agent-guide"), import("~/server/env")])
        return new Response(llmsTxt(env.appUrl || new URL(request.url).origin), {
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" }
        })
      }
    }
  }
})
