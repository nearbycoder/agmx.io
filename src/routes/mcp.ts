import { createFileRoute } from "@tanstack/react-router"

/** Most MCP clients send one message per request; batches are rare and small. */
const MAX_BATCH = 20

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
        const limits = await import("~/server/rate-limit")
        const blocked = limits.badAuthLockout(request, corsHeaders) ?? limits.checkRequest(request, { headers: corsHeaders })
        if (blocked) return blocked
        const header = request.headers.get("authorization") ?? ""
        const key = header.replace(/^Bearer\s+/i, "").trim() || request.headers.get("x-api-key")?.trim() || new URL(request.url).searchParams.get("key") || ""
        const principal = key ? await runtime.runPromise(Effect.flatMap(Effect.service(Agents), (a) => a.authenticate(key))) : null
        if (!principal) {
          if (key) {
            const locked = limits.recordBadAuth(request, corsHeaders)
            if (locked) return locked
          }
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
        const items: Array<unknown> = Array.isArray(body) ? body : [body]
        // A batch counts as one request for rate limiting, so keep it small.
        if (items.length === 0 || items.length > MAX_BATCH)
          return Response.json(
            { jsonrpc: "2.0", id: null, error: { code: -32600, message: `Invalid request: send between 1 and ${MAX_BATCH} JSON-RPC messages per call.` } },
            { status: 400, headers: corsHeaders }
          )
        type Rpc = Parameters<typeof handleRpc>[1]
        const isRpc = (m: unknown): m is Rpc =>
          typeof m === "object" && m !== null && !Array.isArray(m) && typeof (m as { method?: unknown }).method === "string"
        const responses: Array<unknown> = []
        // One at a time: a batch of sends or waits shouldn't fan out into parallel work.
        for (const m of items) {
          if (!isRpc(m)) {
            const id = typeof m === "object" && m !== null && "id" in m ? ((m as { id?: unknown }).id ?? null) : null
            // A reply to one of our own requests (it has no method) needs no answer.
            if (typeof m === "object" && m !== null && ("result" in m || "error" in m)) continue
            responses.push({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid request: expected a JSON-RPC object with a method." } })
            continue
          }
          const response = await runtime.runPromise(handleRpc(principal, m))
          if (response !== null) responses.push(response)
        }
        if (responses.length === 0) return new Response(null, { status: 202, headers: corsHeaders })
        return Response.json(batch ? responses : responses[0], { headers: corsHeaders })
      }
    }
  }
})
