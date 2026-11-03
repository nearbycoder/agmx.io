import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/skill.md")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ agentGuide }, { env }] = await Promise.all([import("~/content/agent-guide"), import("~/server/env")])
        const origin = env.appUrl || new URL(request.url).origin
        return new Response(agentGuide(origin, env.mailDomain), {
          headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300", "access-control-allow-origin": "*" }
        })
      }
    }
  }
})
