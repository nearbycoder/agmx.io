import { createFileRoute } from "@tanstack/react-router"

const handle = async ({ request }: { request: Request }) => {
  const { apiHandler } = await import("~/server/http/web-handler")
  return apiHandler.handler(request)
}

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: { GET: handle, POST: handle, PATCH: handle, PUT: handle, DELETE: handle, OPTIONS: handle, HEAD: handle }
  }
})
