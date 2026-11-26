import { createFileRoute } from "@tanstack/react-router"

const handle = async ({ request }: { request: Request }) => {
  const [{ auth }, { clientIp, TRUSTED_INTERNAL_IP_HEADER }] = await Promise.all([
    import("~/server/auth"),
    import("~/server/rate-limit")
  ])
  const headers = new Headers(request.headers)
  headers.delete(TRUSTED_INTERNAL_IP_HEADER)
  const ip = clientIp(request)
  if (ip !== "unknown") headers.set(TRUSTED_INTERNAL_IP_HEADER, ip)
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer()
  return auth.handler(new Request(request.url, { method: request.method, headers, body }))
}

export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handle, POST: handle } }
})
