import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, BookOpen } from "lucide-react"
import { MarketingFooter } from "~/components/marketing/footer"
import { MarketingHeader } from "~/components/marketing/header"
import { HeroDemo } from "~/components/marketing/hero-demo"
import { CodeShowcase, DashboardTeaser, Faq, Features, FinalCta, HowItWorks, PricingPreview, SkillPrompt } from "~/components/marketing/sections"
import { Button } from "~/components/ui/button"

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AGMX — Email inboxes for AI agents" },
      {
        name: "description",
        content: "Give every AI agent a real email inbox. Self sign-up with human approval, verification codes extracted automatically, threaded replies, MCP server and signed webhooks."
      }
    ]
  }),
  component: Landing
})

const WORKS_WITH = ["Claude", "Cursor", "OpenAI Agents", "LangGraph", "CrewAI", "n8n", "any HTTP client"]

function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg">
      <MarketingHeader />
      <main>
        <section className="relative">
          <div className="grid-bg pointer-events-none absolute inset-x-0 -top-16 h-[760px] opacity-[0.55] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 pt-14 pb-24 sm:px-8 sm:pt-20 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:pt-24 lg:pb-40">
            <div className="min-w-0 animate-rise">
              <a
                href="/skill.md"
                className="group inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-1 text-[12.5px] shadow-card transition hover:border-line-strong"
              >
                <span className="rounded-full bg-[#0c0c0d] px-2 py-0.5 font-mono text-[10.5px] font-semibold text-accent dark:bg-accent dark:text-accent-fg">NEW</span>
                <span className="text-ink-2">Agents can now sign themselves up</span>
                <ArrowRight className="size-3.5 text-muted transition-transform group-hover:translate-x-0.5" />
              </a>
              <h1 className="mt-6 text-[44px] leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-[64px] lg:text-[72px]">
                Email inboxes
                <br />
                <span className="relative whitespace-nowrap">
                  for AI agents
                  <svg className="absolute -bottom-2 left-0 h-3 w-full text-accent" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden>
                    <path d="M2 9 C 60 3, 140 3, 298 7" stroke="currentColor" strokeWidth="5" fill="none" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="text-accent-ink">.</span>
              </h1>
              <p className="mt-7 max-w-[30rem] text-[17px] leading-relaxed text-muted text-balance">
                Real addresses your agents can sign up with, read verification codes from, and reply on — through one REST API, an MCP server, or webhooks.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link to="/login">
                  <Button size="lg" className="group w-full sm:w-auto">
                    Get started free <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link to="/docs">
                  <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                    <BookOpen /> Read the docs
                  </Button>
                </Link>
              </div>
              <SkillPrompt className="mt-6 w-full max-w-[30rem]" />
            </div>
            <div className="min-w-0 animate-rise [animation-delay:150ms] lg:pb-10">
              <HeroDemo />
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface/60">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-6 sm:px-8 md:flex-row md:gap-10">
            <span className="shrink-0 text-[12px] font-medium tracking-wider text-faint uppercase">Works with</span>
            <div className="relative w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
              <div className="flex w-max animate-marquee gap-10">
                {[...WORKS_WITH, ...WORKS_WITH].map((name, i) => (
                  <span key={i} className="font-mono text-[14px] whitespace-nowrap text-muted">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <HowItWorks />
        <Features />
        <CodeShowcase />
        <DashboardTeaser />
        <PricingPreview />
        <Faq />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  )
}
