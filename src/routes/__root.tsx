/// <reference types="vite/client" />
import type { QueryClient } from "@tanstack/react-query"
import { QueryClientProvider } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { Toaster } from "sonner"
import { TooltipProvider } from "~/components/ui/menu"
import { ThemeProvider, themeScript, useTheme } from "~/lib/theme"
import { seo, siteUrlFrom } from "~/lib/seo"
import { loadSiteConfig } from "~/lib/site"
import appCss from "~/styles.css?url"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: async () => ({ site: await loadSiteConfig() }),
  head: ({ match }) => {
    const siteUrl = siteUrlFrom(match)
    const defaults = seo({ siteUrl, path: "/", title: "AGMX — Email inboxes for AI agents" })
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#f7f7f3" },
        { name: "color-scheme", content: "light dark" },
        { name: "application-name", content: "AGMX" },
        { name: "apple-mobile-web-app-title", content: "AGMX" },
        { name: "format-detection", content: "telephone=no" },
        ...defaults.meta
      ],
      links: [
        { rel: "stylesheet", href: appCss },
        { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
        { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
        { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
        { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@400..600&display=swap" },
        { rel: "alternate", type: "text/markdown", href: "/skill.md", title: "Agent instructions" },
        { rel: "sitemap", type: "application/xml", href: "/sitemap.xml" }
      ],
      scripts: [{ children: themeScript }]
    }
  },
  component: RootComponent
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()
  return (
    <RootDocument>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Outlet />
            <ThemedToaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </RootDocument>
  )
}

function ThemedToaster() {
  const { resolved } = useTheme()
  return (
    <Toaster
      theme={resolved}
      position="bottom-right"
      toastOptions={{ classNames: { toast: "!rounded-xl !border-line !bg-surface !text-ink !shadow-pop", description: "!text-muted" } }}
    />
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
