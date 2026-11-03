import { createFileRoute } from "@tanstack/react-router"

const PAGES = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/pricing", priority: "0.8", changefreq: "monthly" },
  { path: "/docs", priority: "0.9", changefreq: "weekly" },
  { path: "/skill.md", priority: "0.6", changefreq: "weekly" },
  { path: "/llms.txt", priority: "0.4", changefreq: "monthly" },
  { path: "/api/v1/reference", priority: "0.5", changefreq: "weekly" },
  { path: "/terms", priority: "0.3", changefreq: "yearly" },
  { path: "/privacy", priority: "0.3", changefreq: "yearly" }
]

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { env } = await import("~/server/env")
        const lastmod = new Date().toISOString().slice(0, 10)
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url><loc>${env.appUrl}${p.path === "/" ? "/" : p.path}</loc><lastmod>${lastmod}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`).join("\n")}
</urlset>
`
        return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } })
      }
    }
  }
})
