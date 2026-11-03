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
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-[17rem] text-[13px] leading-relaxed text-muted">Real email inboxes for AI agents. Open source, built on Amazon SES.</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-[13px] font-medium text-ink">{col.title}</h4>
              <ul className="mt-3.5 flex flex-col gap-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"to" in link ? (
                      <Link to={link.to} hash={"hash" in link ? link.hash : undefined} className="text-[13px] text-muted transition-colors hover:text-ink">
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        className="text-[13px] text-muted transition-colors hover:text-ink"
                        {...(link.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                      >
                        {link.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex items-center justify-between gap-4 border-t border-line pt-6 text-[12px] text-muted">
          <span>© {new Date().getFullYear()} AGMX · MIT licensed</span>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="transition-colors hover:text-ink" aria-label="GitHub">
            <GithubIcon />
          </a>
        </div>
      </div>
    </footer>
  )
}
