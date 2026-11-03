import { createFileRoute } from "@tanstack/react-router"

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, OPTIONS, DELETE",
  "access-control-allow-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, x-api-key",
  "access-control-expose-headers": "mcp-session-id"
}

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      OPTIONS: () => new Response(null, { status: 204, headers: corsHeaders }),
      GET: () =>
        new Response(JSON.stringify({ message: "AGMX MCP endpoint. POST JSON-RPC here with Authorization: Bearer agmx_…" }), {
          status: 405,
          headers: { ...corsHeaders, "content-type": "application/json", allow: "POST" }
        }),
      DELETE: () => new Response(null, { status: 204, headers: corsHeaders }),
      POST: async ({ request }) => {
        const [{ runtime }, { Agents }, { handleRpc }, { Effect }] = await Promise.all([
          import("~/server/runtime"),
          import("~/server/services/Agents"),
          import("~/server/mcp"),
          import("effect")
        ])
        const header = request.headers.get("authorization") ?? ""
        const key = header.replace(/^Bearer\s+/i, "").trim() || request.headers.get("x-api-key")?.trim() || new URL(request.url).searchParams.get("key") || ""
        const principal = key ? await runtime.runPromise(Effect.flatMap(Effect.service(Agents), (a) => a.authenticate(key))) : null
        if (!principal) {
          return Response.json(
            { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized: send Authorization: Bearer agmx_… (create a key in the dashboard or via POST /api/v1/signup)." } },
            { status: 401, headers: { ...corsHeaders, "www-authenticate": 'Bearer realm="agmx"' } }
          )
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: corsHeaders })
        }
        const batch = Array.isArray(body)
        const messages = (batch ? body : [body]) as Array<Parameters<typeof handleRpc>[1]>
        const responses = (await Promise.all(messages.map((m) => runtime.runPromise(handleRpc(principal, m))))).filter((r) => r !== null)
        if (responses.length === 0) return new Response(null, { status: 202, headers: corsHeaders })
        return Response.json(batch ? responses : responses[0], { headers: corsHeaders })
      }
    }
  }
})
