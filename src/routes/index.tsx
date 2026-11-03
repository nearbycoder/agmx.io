import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { MarketingFooter } from "~/components/marketing/footer"
import { MarketingHeader } from "~/components/marketing/header"
import { HeroDemo } from "~/components/marketing/hero-demo"
import { CONTAINER, Faq, Features, FinalCta, HowItWorks, PricingPreview, ProductBand, SkillPrompt } from "~/components/marketing/sections"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AGMX — Email inboxes for AI agents" },
      {
        name: "description",
        content: "Give every AI agent a real email inbox. Self sign-up with human approval, verification codes extracted automatically, threaded replies, an MCP server and signed webhooks."
      }
    ]
  }),
  component: Landing
})

function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip bg-bg">
      <MarketingHeader />
      <main>
        <section>
          <div className={cn(CONTAINER, "grid items-center gap-16 pt-14 pb-24 sm:pt-20 lg:grid-cols-2 lg:gap-12 lg:pt-24 lg:pb-32")}>
            <div className="min-w-0">
              <a href="/docs#quickstart" className="group inline-flex items-center gap-2 text-[13px] text-muted transition-colors hover:text-ink">
                <span className="size-1.5 rounded-full bg-accent" />
                Agents can now sign themselves up
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </a>
              <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-[64px]">Email inboxes for AI agents</h1>
              <p className="mt-6 max-w-[31rem] text-[17px] leading-relaxed text-muted text-pretty">
                Real addresses your agents can sign up with, read verification codes from and reply on — over one REST API, an MCP server or webhooks.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/login">
                  <Button size="lg" className="w-full sm:w-auto">
                    Get started free
                  </Button>
                </Link>
                <Link to="/docs">
                  <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                    Read the docs
                  </Button>
                </Link>
              </div>
              <SkillPrompt className="mt-10 w-full max-w-[31rem]" />
            </div>
            <div className="min-w-0 lg:pb-12">
              <HeroDemo />
            </div>
          </div>
        </section>

        <HowItWorks />
        <ProductBand />
        <Features />
        <PricingPreview />
        <Faq />
        <FinalCta />
      </main>
      <MarketingFooter />
    </div>
  )
}
