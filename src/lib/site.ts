import { createServerFn } from "@tanstack/react-start"

export interface SiteConfig {
  /** Public origin, e.g. https://agmx.io (from APP_URL). */
  url: string
  mailDomain: string
  /** Who runs this instance (OPERATOR_NAME), named in the Terms and Privacy Policy. */
  operatorName: string
  /** Domain of the abuse@, postmaster@ and privacy@ role mailboxes. */
  contactDomain: string
}

/** Server-only config the client needs for absolute URLs (canonical, Open Graph). */
export const getSiteConfig = createServerFn({ method: "GET" }).handler(async (): Promise<SiteConfig> => {
  const { env } = await import("~/server/env")
  return { url: env.appUrl, mailDomain: env.mailDomain, operatorName: env.operatorName, contactDomain: env.contactDomain }
})

let cached: SiteConfig | undefined
/** Resolved once per page load; navigations reuse the cached value. */
export const loadSiteConfig = async () => (cached ??= await getSiteConfig())
