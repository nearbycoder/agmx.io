/// <reference types="vite/client" />
import type { QueryClient } from "@tanstack/react-query"
import { QueryClientProvider } from "@tanstack/react-query"
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { Toaster } from "sonner"
import { TooltipProvider } from "~/components/ui/menu"
import { ThemeProvider, themeScript, useTheme } from "~/lib/theme"
import appCss from "~/styles.css?url"

const description = "Real email inboxes for AI agents. Sign up in one API call, receive verification codes, send and reply — over REST, MCP or webhooks."

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "AGMX — Email inboxes for AI agents" },
      { name: "description", content: description },
      { name: "theme-color", content: "#0c0c0d" },
      { property: "og:title", content: "AGMX — Email inboxes for AI agents" },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" }
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@300..800&family=Geist+Mono:wght@400..600&display=swap" },
      { rel: "alternate", type: "text/markdown", href: "/skill.md", title: "Agent instructions" }
    ],
    scripts: [{ children: themeScript }]
  }),
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
