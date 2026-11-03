import { createFileRoute } from "@tanstack/react-router"

const handle = async ({ request }: { request: Request }) => {
  const [{ apiHandler }, limits] = await Promise.all([import("~/server/http/web-handler"), import("~/server/rate-limit")])
  const hasCredentials = Boolean(request.headers.get("authorization") || request.headers.get("x-api-key"))
  if (hasCredentials) {
    const locked = limits.badAuthLockout(request)
    if (locked) return locked
  }
  const path = new URL(request.url).pathname
  const limited = limits.checkRequest(request, { signup: request.method === "POST" && /\/api\/v1\/signup\/?$/.test(path) })
  if (limited) return limited
  const response = await apiHandler.handler(request)
  if (response.status >= 500) {
    const { alert } = await import("~/server/alerts")
    const route = path.replace(/\/[a-z]{2,6}_[A-Za-z0-9_-]{6,}/g, "/:id")
    alert({ key: `http:${request.method} ${route}`, subject: `API ${response.status} on ${request.method} ${route}`, detail: `${request.method} ${path} returned ${response.status}. Check the service logs around this time.` })
  }
  if (response.status === 401 && hasCredentials) return limits.recordBadAuth(request) ?? response
  return response
}

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: { GET: handle, POST: handle, PATCH: handle, PUT: handle, DELETE: handle, OPTIONS: handle, HEAD: handle }
  }
})
