export const SITE_NAME = "AGMX"
export const DEFAULT_DESCRIPTION =
  "Real email inboxes for AI agents. Agents sign themselves up, read verification codes, send and reply — over REST, MCP or webhooks."

export interface SeoInput {
  siteUrl: string
  /** Path of the page, e.g. "/pricing". */
  path: string
  title: string
  description?: string
  /** Path to a 1200×630 image under /public, e.g. "/og/pricing.png". */
  image?: string
  imageAlt?: string
  type?: "website" | "article"
  /** Keep private/utility pages out of search results. */
  noindex?: boolean
}

/** Title, description, canonical URL, Open Graph and Twitter card tags for a route's `head()`. */
export const seo = ({ siteUrl, path, title, description = DEFAULT_DESCRIPTION, image = "/og/home.png", imageAlt, type = "website", noindex }: SeoInput) => {
  const url = `${siteUrl}${path}`
  const imageUrl = `${siteUrl}${image}`
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { name: "robots", content: noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large" },
      { property: "og:type", content: type },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:url", content: url },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:image", content: imageUrl },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: imageAlt ?? title },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: imageUrl },
      { name: "twitter:image:alt", content: imageAlt ?? title }
    ],
    links: noindex ? [] : [{ rel: "canonical", href: url }]
  }
}

/** Reads the site URL that the root route puts in router context. */
export const siteUrlFrom = (match: { context: unknown }) =>
  ((match.context as { site?: { url: string } }).site?.url ?? "https://agmx.io").replace(/\/$/, "")
