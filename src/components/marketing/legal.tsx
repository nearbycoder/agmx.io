import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { cn } from "~/lib/utils"
import { MarketingFooter } from "./footer"
import { MarketingHeader } from "./header"
import { CONTAINER } from "./sections"

export const LEGAL_UPDATED = "November 3, 2026"

/** Shared layout for the Terms of Service and Privacy Policy. */
export function LegalPage({
  title,
  intro,
  sections,
  other
}: {
  title: string
  intro: ReactNode
  sections: Array<{ id: string; title: string; body: ReactNode }>
  other: { to: "/terms" | "/privacy"; label: string }
}) {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg">
      <MarketingHeader />
      <main className={cn(CONTAINER, "pt-16 pb-24 sm:pt-20")}>
        <div className="grid gap-12 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-16">
          <aside className="hidden lg:block">
            <nav className="sticky top-24 flex flex-col gap-0.5" aria-label="On this page">
              <div className="mb-2 text-[12px] font-medium text-muted">On this page</div>
              {sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} className="rounded-md py-1 text-[13px] text-muted transition-colors hover:text-ink">
                  {s.title}
                </a>
              ))}
              <Link to={other.to} className="mt-4 border-t border-line pt-4 text-[13px] text-muted transition-colors hover:text-ink">
                {other.label} →
              </Link>
            </nav>
          </aside>
          <article className="max-w-[680px] min-w-0">
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl">{title}</h1>
            <p className="mt-4 text-[13px] text-muted">Last updated {LEGAL_UPDATED}</p>
            <div className="mt-8 text-[16px] leading-[1.7] text-ink-2 text-pretty">{intro}</div>
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="mt-12 scroll-mt-24">
                <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">{s.title}</h2>
                <div className="mt-3 flex flex-col gap-4 text-[15px] leading-[1.7] text-ink-2 text-pretty">{s.body}</div>
              </section>
            ))}
          </article>
        </div>
      </main>
      <MarketingFooter />
    </div>
  )
}

export const List = ({ children }: { children: ReactNode }) => <ul className="flex list-disc flex-col gap-2 pl-5 marker:text-faint">{children}</ul>

export const Mail = ({ address }: { address: string }) => (
  <a href={`mailto:${address}`} className="font-medium text-ink underline decoration-line-strong underline-offset-[3px] transition-colors hover:decoration-ink">
    {address}
  </a>
)

export const B = ({ children }: { children: ReactNode }) => <strong className="font-medium text-ink">{children}</strong>
