import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const { env } = await import("~/server/env")
        const body = [
          "User-agent: *",
          "Allow: /",
          "Disallow: /app",
          "Disallow: /claim/",
          "Disallow: /login",
          "Disallow: /api/",
          "Allow: /api/v1/openapi.json",
          "Allow: /api/v1/reference",
          "",
          `Sitemap: ${env.appUrl}/sitemap.xml`,
          ""
        ].join("\n")
        return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } })
      }
    }
  }
})
