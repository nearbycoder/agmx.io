import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, Minus } from "lucide-react"
import { MarketingFooter } from "~/components/marketing/footer"
import { MarketingHeader } from "~/components/marketing/header"
import { CONTAINER, Faq, PricingCards, SelfHostNote } from "~/components/marketing/sections"
import { cn } from "~/lib/utils"
import { formatLimit, PLANS, type Plan } from "~/shared/plans"

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — AGMX" },
      { name: "description", content: "Simple plans for AI agent inboxes, priced by agents, inboxes and mail volume. Free to self-host." }
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
      { label: "Received per month", hint: "Mail beyond the limit is dropped. It never counts toward sends.", value: (p) => formatLimit(p.monthlyReceives) },
      { label: "Max inbound message", value: (p) => `${p.maxInboundMb} MB` },
      { label: "Sends per month", hint: "Each recipient (to, cc, bcc) counts as one send.", value: (p) => formatLimit(p.monthlySends) },
      { label: "Sends per day", hint: "Resets at 00:00 UTC. Protects sender reputation.", value: (p) => formatLimit(p.dailySends) },
      { label: "Max message size", value: (p) => `${p.maxMessageMb} MB` },
      { label: "Message retention", value: (p) => (p.retentionDays === null ? "Forever" : `${p.retentionDays} days`) }
    ]
  },
  {
    title: "Addresses",
    rows: [
      { label: `Shared domain (you@bot.agmx.io)`, value: () => true },
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
        <section>
          <div className={cn(CONTAINER, "pt-16 pb-14 text-center sm:pt-24 sm:pb-16")}>
            <h1 className="mx-auto max-w-3xl text-5xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl">Inboxes for one agent, or a whole fleet.</h1>
            <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-muted text-pretty">
              Pick a plan for how many agents you run and how much mail they send and receive. Every plan includes the full API, MCP server and webhooks.
            </p>
            <p className="mx-auto mt-5 max-w-xl text-[13px] text-muted">AGMX is in invite-only early access. Paid plans are enabled by the operator on request.</p>
          </div>
        </section>

        <section>
          <div className={cn(CONTAINER, "pb-6")}>
            <PricingCards />
            <SelfHostNote className="mt-4" />
          </div>
        </section>

        <section>
          <div className={cn(CONTAINER, "py-24 sm:py-28")}>
            <h2 className="text-3xl leading-[1.1] font-semibold tracking-[-0.03em] sm:text-4xl">Compare plans</h2>
            <div className="scrollbar-thin mt-10 overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[640px] table-fixed border-collapse text-[13.5px]">
                <colgroup>
                  <col className="w-[40%]" />
                  {plans.map((p) => (
                    <col key={p.id} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-5 py-4 text-left align-bottom text-[12px] font-medium text-muted">Plan</th>
                    {plans.map((p) => (
                      <th key={p.id} className="px-5 py-4 text-left align-bottom">
                        <div className="text-[14px] font-semibold">{p.name}</div>
                        <div className="mt-0.5 text-[13px] font-normal text-muted tabular-nums">${p.priceMonthly} / month</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                {GROUPS.map((group) => (
                  <tbody key={group.title}>
                    <tr className="border-b border-line bg-bg-subtle/60">
                      <td colSpan={plans.length + 1} className="px-5 py-2.5 text-[12px] font-medium text-muted">
                        {group.title}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.label} className="border-b border-line last:border-0">
                        <td className="px-5 py-3.5 align-top">
                          <div className="text-ink-2">{row.label}</div>
                          {row.hint ? <div className="mt-0.5 text-[12px] text-muted">{row.hint}</div> : null}
                        </td>
                        {plans.map((p) => {
                          const v = row.value(p)
                          return (
                            <td key={p.id} className="px-5 py-3.5 align-top tabular-nums">
                              {v === true ? (
                                <Check className="size-4 text-ink-2" aria-label="Included" />
                              ) : v === false ? (
                                <Minus className="size-4 text-faint" aria-label="Not included" />
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
            <p className="mt-6 text-[13.5px] text-muted">
              Need more than Scale?{" "}
              <Link to="/docs" hash="self-hosting" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                Self-host AGMX
              </Link>{" "}
              on your own SES account and set every limit yourself.
            </p>
          </div>
        </section>

        <Faq />
      </main>
      <MarketingFooter />
    </div>
  )
}
