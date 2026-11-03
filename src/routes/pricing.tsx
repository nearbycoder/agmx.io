import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, Info, Minus } from "lucide-react"
import { MarketingFooter } from "~/components/marketing/footer"
import { MarketingHeader } from "~/components/marketing/header"
import { Eyebrow, Faq, PricingCards, SelfHostBanner } from "~/components/marketing/sections"
import { Button } from "~/components/ui/button"
import { cn } from "~/lib/utils"
import { formatLimit, PLANS, type Plan } from "~/shared/plans"

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — AGMX" },
      { name: "description", content: "Simple plans for AI agent inboxes. Unlimited receiving on every plan; pay for agents, inboxes and sends. Free to self-host." }
    ]
  }),
  component: PricingPage
})

type Row = { label: string; hint?: string; value: (p: Plan) => string | boolean }

const GROUPS: Array<{ title: string; rows: Array<Row> }> = [
  {
    title: "Capacity",
    rows: [
      { label: "Agents", value: (p) => formatLimit(p.maxAgents) },
      { label: "Inboxes per agent", value: (p) => formatLimit(p.inboxesPerAgent) },
      { label: "Receiving", hint: "Inbound mail never counts toward your quota.", value: () => "Unlimited" },
      { label: "Sends per month", hint: "Each recipient (to, cc, bcc) counts as one send.", value: (p) => formatLimit(p.monthlySends) },
      { label: "Sends per day", hint: "Resets at 00:00 UTC. Protects sender reputation.", value: (p) => formatLimit(p.dailySends) },
      { label: "Max message size", value: (p) => `${p.maxMessageMb} MB` },
      { label: "Message retention", value: (p) => (p.retentionDays === null ? "Forever" : `${p.retentionDays} days`) }
    ]
  },
  {
    title: "Addresses",
    rows: [
      { label: `Shared domain (you@agmx.io)`, value: () => true },
      { label: "Plus-addressing labels", value: () => true },
      { label: "Custom domains with DKIM", value: (p) => (p.customDomains === 0 ? false : formatLimit(p.customDomains)) }
    ]
  },
  {
    title: "Agent tooling",
    rows: [
      { label: "REST API + OpenAPI", value: () => true },
      { label: "MCP server", value: () => true },
      { label: "Self sign-up with approval", value: () => true },
      { label: "Code & link extraction", value: () => true },
      { label: "Long-poll wait endpoint", value: () => true },
      { label: "Signed webhooks with retries", value: () => true },
      { label: "Agent-scoped API keys", value: () => true }
    ]
  }
]

function PricingPage() {
  const plans = Object.values(PLANS).filter((p) => !p.hidden)
  return (
    <div className="min-h-screen overflow-x-clip bg-bg">
      <MarketingHeader />
      <main>
        <section className="relative">
          <div className="grid-bg pointer-events-none absolute inset-x-0 -top-16 h-[520px] opacity-50 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" />
          <div className="relative mx-auto max-w-6xl px-5 pt-16 pb-12 text-center sm:px-8 sm:pt-24">
            <Eyebrow className="justify-center">Pricing</Eyebrow>
            <h1 className="mx-auto mt-5 max-w-3xl text-[40px] leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-[60px]">Inboxes for one agent, or a whole fleet.</h1>
            <p className="mx-auto mt-5 max-w-xl text-[16.5px] leading-relaxed text-muted">Receiving is unlimited on every plan. Pick a plan for how many agents you run and how much they send.</p>
            <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12.5px] text-muted shadow-card">
              <Info className="size-3.5" /> Early access: AGMX is invite-only. Paid plans are enabled by the operator on request.
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-6 sm:px-8">
          <PricingCards />
          <SelfHostBanner className="mt-4" />
        </section>

        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="text-[28px] font-semibold tracking-[-0.03em]">Compare plans</h2>
          <div className="mt-8 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
            <table className="w-full min-w-[640px] table-fixed border-collapse text-[13.5px]">
              <colgroup>
                <col className="w-[40%]" />
                {plans.map((p) => (
                  <col key={p.id} />
                ))}
              </colgroup>
              <thead>
                <tr className="border-b border-line">
                  <th className="px-5 py-4 text-left font-medium text-muted">Plan</th>
                  {plans.map((p) => (
                    <th key={p.id} className="px-5 py-4 text-left">
                      <div className="flex items-center gap-2 text-[15px] font-semibold">
                        {p.name}
                        {p.highlight ? <span className="rounded-full bg-accent px-1.5 py-px text-[10.5px] font-semibold text-accent-fg">Popular</span> : null}
                      </div>
                      <div className="mt-0.5 font-normal text-muted">${p.priceMonthly}/mo</div>
                    </th>
                  ))}
                </tr>
              </thead>
              {GROUPS.map((group) => (
                <tbody key={group.title}>
                  <tr>
                    <td colSpan={plans.length + 1} className="bg-surface-2 px-5 py-2.5 text-[11.5px] font-medium tracking-wider text-faint uppercase">
                      {group.title}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.label} className="border-t border-line">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-ink-2">{row.label}</div>
                        {row.hint ? <div className="mt-0.5 text-[12px] text-muted">{row.hint}</div> : null}
                      </td>
                      {plans.map((p) => {
                        const v = row.value(p)
                        return (
                          <td key={p.id} className={cn("px-5 py-3.5 tabular-nums", p.highlight && "bg-accent-soft/30")}>
                            {v === true ? (
                              <Check className="size-4 text-accent-ink" />
                            ) : v === false ? (
                              <Minus className="size-4 text-faint" />
                            ) : (
                              <span className="font-medium">{v}</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <div className="mt-10 flex flex-col items-start justify-between gap-4 rounded-2xl border border-line bg-surface p-6 shadow-card sm:flex-row sm:items-center">
            <div>
              <div className="text-[15px] font-semibold">Need more than Scale?</div>
              <p className="mt-0.5 text-[13.5px] text-muted">Self-host AGMX on your own SES account and every limit becomes configurable in one file.</p>
            </div>
            <Link to="/docs" hash="self-hosting">
              <Button variant="secondary">Self-hosting guide</Button>
            </Link>
          </div>
        </section>

        <Faq />
      </main>
      <MarketingFooter />
    </div>
  )
}
