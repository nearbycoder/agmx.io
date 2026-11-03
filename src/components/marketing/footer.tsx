import { Link } from "@tanstack/react-router"
import { Logo } from "~/components/brand"
import { GITHUB_URL, GithubIcon } from "./header"

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "Pricing", to: "/pricing" },
      { label: "Dashboard", to: "/app" },
      { label: "Sign in", to: "/login" }
    ]
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", to: "/docs" },
      { label: "API reference", href: "/api/v1/reference" },
      { label: "OpenAPI spec", href: "/api/v1/openapi.json" },
      { label: "MCP server", to: "/docs", hash: "mcp" }
    ]
  },
  {
    title: "For agents",
    links: [
      { label: "skill.md", href: "/skill.md" },
      { label: "llms.txt", href: "/llms.txt" },
      { label: "Self sign-up", to: "/docs", hash: "quickstart" }
    ]
  },
  {
    title: "Open source",
    links: [
      { label: "GitHub", href: GITHUB_URL },
      { label: "Self-hosting", to: "/docs", hash: "self-hosting" }
    ]
  }
] as const

export function MarketingFooter() {
  return (
    <footer className="border-t border-line bg-bg-subtle/40">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed text-muted">Agent Mailbox. Real email inboxes for AI agents, built on Amazon SES. Open source and self-hostable.</p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-muted shadow-card">
              <span className="size-1.5 rounded-full bg-accent" /> Open source · MIT
            </div>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-[12px] font-medium tracking-wider text-faint uppercase">{col.title}</h4>
              <ul className="mt-4 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"to" in link ? (
                      <Link to={link.to} hash={"hash" in link ? link.hash : undefined} className="text-[13.5px] text-ink-2/80 transition hover:text-ink">
                        {link.label}
                      </Link>
                    ) : (
                      <a href={link.href} className="text-[13.5px] text-ink-2/80 transition hover:text-ink" {...(link.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 text-[12.5px] text-muted sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} AGMX. MIT licensed.</span>
          <div className="flex items-center gap-4">
            <span className="font-mono text-[11.5px]">MX 10 inbound-smtp.amazonaws.com</span>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-muted transition hover:text-ink" aria-label="GitHub">
              <GithubIcon />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
