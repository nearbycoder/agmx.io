import { Link } from "@tanstack/react-router"
import {
  ArrowRight,
  AtSign,
  BadgeCheck,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Gauge,
  GitBranch,
  Globe,
  KeyRound,
  MessagesSquare,
  Plug,
  ShieldCheck,
  Sparkles,
  Tag,
  Webhook
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { AgentAvatar } from "~/components/brand"
import { Button } from "~/components/ui/button"
import { CodeTabs } from "~/components/ui/code"
import { CopyButton } from "~/components/ui/misc"
import { cn } from "~/lib/utils"
import { formatLimit, PLANS, type Plan } from "~/shared/plans"
import { GITHUB_URL, GithubIcon } from "./header"

export const Eyebrow = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("inline-flex items-center gap-2 font-mono text-[11.5px] font-medium tracking-[0.14em] text-accent-ink uppercase", className)}>
    <span className="h-px w-5 bg-accent-ink/60" />
    {children}
  </div>
)

export const SectionTitle = ({ eyebrow, title, description, center }: { eyebrow: string; title: ReactNode; description?: ReactNode; center?: boolean }) => (
  <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
    <Eyebrow className={center ? "justify-center" : undefined}>{eyebrow}</Eyebrow>
    <h2 className="mt-4 text-[32px] leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-[42px]">{title}</h2>
    {description ? <p className="mt-4 text-[16px] leading-relaxed text-muted text-balance">{description}</p> : null}
  </div>
)

/** The "point your agent here" one-liner. */
export const SkillPrompt = ({ className, origin = "agmx.io" }: { className?: string; origin?: string }) => {
  const prompt = `Read ${origin}/skill.md and set up your own inbox.`
  return (
    <div className={cn("flex max-w-full items-center gap-2 rounded-xl border border-line bg-surface py-1.5 pr-1.5 pl-3 shadow-card", className)}>
      <Bot className="size-4 shrink-0 text-muted" />
      <code className="min-w-0 truncate font-mono text-[12.5px] text-ink-2">
        <span className="text-muted">Tell your agent:</span> <span className="text-ink">{prompt}</span>
      </code>
      <CopyButton value={prompt} label="Prompt copied — paste it into your agent" className="shrink-0" />
    </div>
  )
}

// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: "01",
    title: "Your agent asks for an inbox",
    body: "One unauthenticated call to POST /api/v1/signup. It gets back an approval link and a short code to show you.",
    visual: (
      <div className="font-mono text-[11.5px] leading-relaxed">
        <div>
          <span className="text-accent-ink">POST</span> /api/v1/signup
        </div>
        <div className="text-muted">{'{ "name": "Scout", "username": "scout" }'}</div>
        <div className="mt-2 text-muted">
          → userCode <span className="text-ink">"KQ7M-3XPA"</span>
        </div>
      </div>
    )
  },
  {
    n: "02",
    title: "You approve it in one click",
    body: "Open the link, check the agent and the address it wants, approve. Nothing gets an inbox without a human saying yes.",
    visual: (
      <div className="flex items-center gap-3">
        <AgentAvatar name="Scout" color="sky" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold">Scout</div>
          <div className="truncate font-mono text-[11.5px] text-muted">scout@bot.agmx.io</div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-lg bg-ink px-2.5 py-1 text-[12px] font-medium text-bg">
          <Check className="size-3.5" /> Approve
        </span>
      </div>
    )
  },
  {
    n: "03",
    title: "It sends, receives and replies",
    body: "The agent picks up a scoped API key by polling, then uses REST or MCP. Codes and links are pulled out of every email for it.",
    visual: (
      <div className="flex flex-wrap gap-1.5">
        {["wait_for_email", "send_email", "reply_to_email", "get_thread"].map((t) => (
          <span key={t} className="rounded-md border border-line bg-surface px-2 py-0.5 font-mono text-[11px] text-ink-2">
            {t}
          </span>
        ))}
      </div>
    )
  }
]

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <SectionTitle
        eyebrow="How it works"
        title={
          <>
            From zero to a working inbox <span className="text-muted">before your coffee cools.</span>
          </>
        }
        description="Agents can onboard themselves. You stay in control: every agent needs approval, gets its own scoped key, and can be paused at any time."
      />
      <div className="relative mt-14 grid gap-4 md:grid-cols-3">
        <div className="pointer-events-none absolute top-[34px] right-[16%] left-[16%] hidden h-px bg-[linear-gradient(to_right,var(--line-strong)_50%,transparent_50%)] bg-[length:8px_1px] md:block" />
        {STEPS.map((step) => (
          <div key={step.n} className="group relative rounded-2xl border border-line bg-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop">
            <div className="relative z-10 flex size-[38px] items-center justify-center rounded-xl border border-line bg-bg font-mono text-[12px] font-semibold text-ink shadow-card">{step.n}</div>
            <h3 className="mt-5 text-[17px] font-semibold tracking-tight">{step.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.body}</p>
            <div className="mt-6 rounded-xl border border-line bg-surface-2 p-3.5">{step.visual}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

const FEATURES: Array<{ icon: typeof AtSign; title: string; body: string; span?: string; extra?: ReactNode }> = [
  {
    icon: Sparkles,
    title: "Codes and links, already extracted",
    body: "Every inbound email is scanned for one-time codes and action links. Agents read message.extracted.codes[0] instead of parsing HTML.",
    span: "md:col-span-2",
    extra: (
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed">
          <div className="text-muted">"codes": [</div>
          <div className="pl-4">
            <span className="rounded bg-accent-soft px-1 text-accent-ink">"482913"</span>
          </div>
          <div className="text-muted">]</div>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed">
          <div className="text-muted">"links": [{"{"}</div>
          <div className="pl-4">
            "kind": <span className="text-accent-ink">"verify"</span>,
          </div>
          <div className="truncate pl-4 text-muted">"url": "https://github.com/…"</div>
          <div className="text-muted">{"}"}]</div>
        </div>
      </div>
    )
  },
  {
    icon: Clock3,
    title: "Long-poll for the next email",
    body: "GET /messages/wait holds the connection until mail arrives — up to 60 seconds. No polling loops, no sleeps.",
    extra: (
      <div className="mt-5 rounded-xl border border-line bg-surface-2 p-3 font-mono text-[11.5px] leading-relaxed">
        <div>
          <span className="text-accent-ink">GET</span> /messages/wait
        </div>
        <div className="mt-2 flex items-center gap-2 text-muted">
          <span className="relative h-1 flex-1 overflow-hidden rounded-full bg-bg-subtle">
            <span className="absolute inset-y-0 left-0 w-[28%] rounded-full bg-accent" />
          </span>
          1.8s
        </div>
        <div className="mt-2 text-muted">
          → <span className="text-ink">200</span> {"{ message, timedOut: false }"}
        </div>
      </div>
    )
  },
  {
    icon: AtSign,
    title: "Instant addresses",
    body: "Claim scout@bot.agmx.io in one call, or let AGMX pick a friendly random one like swift-otter-4821."
  },
  {
    icon: MessagesSquare,
    title: "Real threading",
    body: "Replies set In-Reply-To and References, so conversations stay threaded in Gmail, Outlook and in AGMX."
  },
  {
    icon: Plug,
    title: "Native MCP server",
    body: "13 tools over Streamable HTTP at /mcp. Point Claude, Cursor or any MCP client at it with a Bearer key."
  },
  {
    icon: Webhook,
    title: "Signed webhooks",
    body: "message.received, sent, delivered, bounced and complained — HMAC-SHA256 signed and retried with backoff."
  },
  {
    icon: Tag,
    title: "Plus-addressing labels",
    body: "Mail to scout+github@bot.agmx.io lands in scout's inbox labelled github. One inbox, tidy per-service mail."
  },
  {
    icon: Globe,
    title: "Bring your own domain",
    body: "Add a domain, publish the DKIM and MX records we generate, and give agents addresses at your brand."
  },
  {
    icon: KeyRound,
    title: "Scoped keys",
    body: "Agent keys only see their own inboxes. Account keys manage everything. Revoke either instantly."
  },
  {
    icon: Gauge,
    title: "Plan quotas built in",
    body: "Per-plan limits on agents, inboxes per agent and daily or monthly sends, enforced atomically."
  },
  {
    icon: ShieldCheck,
    title: "Deliverability guardrails",
    body: "SPF, DKIM and DMARC verdicts on inbound mail. Hard bounces and complaints suppress addresses automatically."
  },
  {
    icon: GitBranch,
    title: "Open source on Amazon SES",
    body: "MIT licensed. TanStack Start, Effect, Drizzle, Better Auth and Postgres. Deploy it yourself with your own SES credentials.",
    span: "md:col-span-3",
    extra: (
      <div className="mt-5 flex flex-wrap gap-2">
        {["TanStack Start", "Effect", "Drizzle ORM", "Better Auth", "PostgreSQL", "Amazon SES", "Railway-ready"].map((t) => (
          <span key={t} className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 font-mono text-[11.5px] text-ink-2">
            {t}
          </span>
        ))}
      </div>
    )
  }
]

export function Features() {
  return (
    <section id="features" className="border-y border-line bg-bg-subtle/50">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <SectionTitle
          eyebrow="Features"
          title="Everything an agent needs from email. Nothing it doesn't."
          description="Designed API-first for software that reads mail, and still a pleasant inbox for the humans supervising it."
        />
        <div className="mt-14 grid gap-3 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className={cn("group rounded-2xl border border-line bg-surface p-6 shadow-card transition hover:border-line-strong", f.span)}>
              <div className="flex size-9 items-center justify-center rounded-xl bg-[#0c0c0d] text-accent dark:bg-accent-soft dark:ring-1 dark:ring-accent/25">
                <f.icon className="size-[18px]" />
              </div>
              <h3 className="mt-5 text-[15.5px] font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{f.body}</p>
              {f.extra}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

export const codeSamples = (origin = "https://agmx.io") => [
  {
    label: "curl",
    lang: "bash" as const,
    code: `# Send an email from your agent's inbox
curl ${origin}/api/v1/messages \\
  -H "Authorization: Bearer $AGMX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "alice@example.com",
    "subject": "Your weekly report",
    "text": "Hi Alice — the report is attached."
  }'

# Then wait (up to 60s) for the reply
curl "${origin}/api/v1/messages/wait?timeout=60" \\
  -H "Authorization: Bearer $AGMX_API_KEY"`
  },
  {
    label: "TypeScript",
    lang: "ts" as const,
    code: `const agmx = (path: string, init?: RequestInit) =>
  fetch(\`${origin}/api/v1\${path}\`, {
    ...init,
    headers: { Authorization: \`Bearer \${process.env.AGMX_API_KEY}\`, "Content-Type": "application/json" }
  }).then((r) => r.json())

// Sign up for a service, then grab the code it emails you
const since = new Date().toISOString()
await signUpOnSomeSite("scout@bot.agmx.io")

const { message } = await agmx(\`/messages/wait?timeout=60&since=\${since}\`)
const code = message?.extracted.codes[0] // "482913"`
  },
  {
    label: "Python",
    lang: "py" as const,
    code: `import os, requests

API = "${origin}/api/v1"
H = {"Authorization": f"Bearer {os.environ['AGMX_API_KEY']}"}

# Newest unread messages
page = requests.get(f"{API}/messages", headers=H,
                    params={"folder": "inbox", "unread": "true"}).json()

for m in page["messages"]:
    print(m["from"]["address"], m["subject"], m["extracted"]["codes"])

# Reply in-thread
requests.post(f"{API}/messages/{page['messages'][0]['id']}/reply",
              headers=H, json={"text": "Thanks, received!"})`
  },
  {
    label: "MCP config",
    lang: "json" as const,
    code: `{
  "mcpServers": {
    "agmx": {
      "type": "http",
      "url": "${origin}/mcp",
      "headers": {
        "Authorization": "Bearer agmx_agt_…"
      }
    }
  }
}`
  }
]

export function CodeShowcase() {
  return (
    <section id="api" className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.15fr]">
        <div className="min-w-0">
          <SectionTitle
            eyebrow="Developer experience"
            title="A small API you can hold in your head."
            description="Typed end to end with Effect Schema, documented with OpenAPI 3.1, and every error carries a stable _tag your agent can branch on."
          />
          <ul className="mt-8 flex flex-col gap-3 text-[14px]">
            {[
              ["REST", "JSON over HTTPS with Bearer keys"],
              ["MCP", "13 tools, Streamable HTTP"],
              ["Webhooks", "Signed, retried for ~6 hours"],
              ["OpenAPI", "Interactive reference included"]
            ].map(([k, v]) => (
              <li key={k} className="flex items-center gap-3">
                <span className="flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg">
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span className="font-medium">{k}</span>
                <span className="text-muted">{v}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-2">
            <Link to="/docs">
              <Button variant="secondary">Read the docs</Button>
            </Link>
            <a href="/api/v1/reference">
              <Button variant="ghost">
                API reference <ArrowRight />
              </Button>
            </a>
          </div>
        </div>
        <div className="min-w-0">
          <CodeTabs tabs={codeSamples()} />
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

const MOCK_MESSAGES = [
  { from: "GitHub", subject: "[GitHub] Please verify your device", snippet: "Verification code: 482913", time: "2m", unread: true, code: "482913", agent: ["Scout", "sky"] },
  { from: "Alice Chen", subject: "Re: Q3 vendor shortlist", snippet: "Thanks Scout — can you add pricing for the last two?", time: "14m", unread: true, agent: ["Scout", "sky"] },
  { from: "Linear", subject: "Your magic sign-in link", snippet: "Click to sign in to Linear. Expires in 10 minutes.", time: "1h", unread: false, code: "link", agent: ["Ledger", "lime"] },
  { from: "Stripe", subject: "Your receipt from Acme Inc", snippet: "Receipt #2291-4410 · $49.00 paid", time: "3h", unread: false, agent: ["Ledger", "lime"] },
  { from: "Notion", subject: "Confirm your email", snippet: "Your login code is 771 204", time: "Yesterday", unread: false, code: "771204", agent: ["Research", "violet"] }
] as const

export function DashboardTeaser() {
  return (
    <section className="relative overflow-hidden border-y border-line bg-[#0b0b0c] text-white">
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:56px_56px]" />
      <div className="absolute top-0 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-accent/15 blur-[140px]" />
      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 font-mono text-[11.5px] font-medium tracking-[0.14em] text-accent uppercase">
            <span className="h-px w-5 bg-accent/60" /> Built for agents and humans <span className="h-px w-5 bg-accent/60" />
          </div>
          <h2 className="mt-4 text-[32px] leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-[42px]">A real inbox for you to watch over them.</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-white/55">
            Every agent's mail in one live, keyboard-driven dashboard. Read along, step in to reply, approve new agents and see exactly what got sent.
          </p>
        </div>

        <div className="mt-14 overflow-hidden rounded-2xl border border-white/10 bg-[#111113] shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <div className="mx-auto rounded-md bg-white/[0.06] px-3 py-1 font-mono text-[11px] text-white/40">agmx.io/app/mail</div>
          </div>
          <div className="grid md:grid-cols-[200px_1fr] lg:grid-cols-[200px_1fr_1fr]">
            <div className="hidden border-r border-white/[0.07] p-3 md:block">
              {[
                ["Inbox", 2, true],
                ["Sent", 0, false],
                ["Starred", 0, false],
                ["Archived", 0, false]
              ].map(([label, n, active]) => (
                <div key={label as string} className={cn("flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[12.5px]", active ? "bg-white/[0.07] text-white" : "text-white/50")}>
                  {label}
                  {n ? <span className="rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-black">{n}</span> : null}
                </div>
              ))}
              <div className="mt-5 px-2.5 text-[10.5px] font-medium tracking-wider text-white/30 uppercase">Agents</div>
              {[
                ["Scout", "sky", "scout@"],
                ["Ledger", "lime", "ledger@"],
                ["Research", "violet", "research@"]
              ].map(([name, color, addr]) => (
                <div key={name} className="mt-1 flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] text-white/60">
                  <AgentAvatar name={name!} color={color!} size="xs" /> {addr}
                </div>
              ))}
            </div>
            <div className="border-r border-white/[0.07]">
              {MOCK_MESSAGES.map((m, i) => (
                <div key={i} className={cn("flex gap-3 border-b border-white/[0.05] px-4 py-3", i === 0 && "bg-white/[0.04]")}>
                  <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", m.unread ? "bg-accent" : "bg-transparent")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn("truncate text-[13px]", m.unread ? "font-semibold text-white" : "text-white/70")}>{m.from}</span>
                      <span className="shrink-0 text-[11px] text-white/35">{m.time}</span>
                    </div>
                    <div className={cn("truncate text-[12.5px]", m.unread ? "text-white/85" : "text-white/55")}>{m.subject}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <AgentAvatar name={m.agent[0]} color={m.agent[1]} size="xs" />
                      <span className="truncate text-[11.5px] text-white/35">{m.snippet}</span>
                      {"code" in m && m.code !== "link" ? (
                        <span className="ml-auto shrink-0 rounded bg-accent/15 px-1.5 font-mono text-[10.5px] text-accent">{m.code}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden p-6 lg:block">
              <div className="text-[17px] font-semibold tracking-tight">[GitHub] Please verify your device</div>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">GH</span>
                <div className="text-[12.5px]">
                  <div className="text-white/85">GitHub &lt;noreply@github.com&gt;</div>
                  <div className="text-white/40">to scout@bot.agmx.io</div>
                </div>
              </div>
              <div className="mt-5 rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
                <div className="flex items-center gap-2 text-[11px] font-medium tracking-wider text-accent uppercase">
                  <Sparkles className="size-3.5" /> Extracted for your agent
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <span className="font-mono text-[26px] font-semibold tracking-[0.2em] text-white">482913</span>
                  <span className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-white/60">verify link</span>
                </div>
              </div>
              <div className="mt-5 space-y-2 text-[13px] leading-relaxed text-white/60">
                <p>Hey scout!</p>
                <p>A sign in attempt requires further verification. To complete the sign in, enter the verification code on the unrecognized device.</p>
              </div>
              <div className="mt-5 flex items-center gap-2 text-[11.5px] text-white/40">
                <BadgeCheck className="size-3.5 text-accent" /> SPF pass · DKIM pass · DMARC pass
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

const planRows = (plan: Plan) => [
  ["Agents", formatLimit(plan.maxAgents)],
  ["Inboxes per agent", formatLimit(plan.inboxesPerAgent)],
  ["Sends / month", formatLimit(plan.monthlySends)],
  ["Sends / day", formatLimit(plan.dailySends)],
  ["Received / month", formatLimit(plan.monthlyReceives)],
  ["Custom domains", plan.customDomains === 0 ? "—" : formatLimit(plan.customDomains)],
  ["Retention", plan.retentionDays === null ? "Forever" : `${plan.retentionDays} days`]
]

export function PricingCards({ compact }: { compact?: boolean }) {
  const plans = Object.values(PLANS).filter((p) => !p.hidden)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className={cn(
            "relative flex flex-col rounded-2xl border bg-surface p-6 shadow-card transition hover:shadow-pop",
            plan.highlight ? "border-ink ring-1 ring-ink dark:border-accent/60 dark:ring-accent/40" : "border-line"
          )}
        >
          {plan.highlight ? (
            <span className="absolute -top-3 left-6 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-fg shadow-card">Most popular</span>
          ) : null}
          <div className="flex items-baseline justify-between">
            <h3 className="text-[17px] font-semibold tracking-tight">{plan.name}</h3>
          </div>
          <p className="mt-1 text-[13.5px] text-muted">{plan.tagline}</p>
          <div className="mt-6 flex items-baseline gap-1.5">
            <span className="text-[44px] leading-none font-semibold tracking-[-0.04em]">${plan.priceMonthly}</span>
            <span className="text-[13px] text-muted">/ month</span>
          </div>
          <Link to="/login" className="mt-6">
            <Button variant={plan.highlight ? "primary" : "secondary"} className="w-full">
              {plan.priceMonthly === 0 ? "Start free" : `Request ${plan.name}`}
            </Button>
          </Link>
          <div className="mt-6 flex-1 border-t border-line pt-5">
            {compact ? (
              <ul className="flex flex-col gap-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[13.5px] text-ink-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-accent-ink" />
                    {f}
                  </li>
                ))}
              </ul>
            ) : (
              <dl className="flex flex-col gap-2.5">
                {planRows(plan).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-[13.5px]">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
                <div className="mt-2 flex flex-col gap-2 border-t border-line pt-4">
                  {["Receiving included", "REST API, MCP & webhooks", `${plan.maxMessageMb} MB max message`].map((f) => (
                    <div key={f} className="flex items-center gap-2.5 text-[13.5px] text-ink-2">
                      <Check className="size-4 shrink-0 text-accent-ink" /> {f}
                    </div>
                  ))}
                </div>
              </dl>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function PricingPreview() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl px-5 pt-24 pb-12 sm:px-8 sm:pt-32 sm:pb-16">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <SectionTitle eyebrow="Pricing" title="Priced per agent fleet, not per seat." description="Receiving is always unlimited. Plans differ in how many agents and inboxes you run and how much you send." />
        <Link to="/pricing">
          <Button variant="ghost">
            Compare plans <ArrowRight />
          </Button>
        </Link>
      </div>
      <div className="mt-12">
        <PricingCards compact />
      </div>
      <SelfHostBanner className="mt-4" />
    </section>
  )
}

export const SelfHostBanner = ({ className }: { className?: string }) => (
  <div className={cn("flex flex-col items-start justify-between gap-4 rounded-2xl border border-dashed border-line-strong bg-surface-2 p-6 sm:flex-row sm:items-center", className)}>
    <div className="flex items-start gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-bg">
        <GithubIcon />
      </span>
      <div>
        <div className="text-[15px] font-semibold tracking-tight">Self-host for free</div>
        <p className="mt-0.5 text-[13.5px] text-muted">AGMX is MIT licensed. Run it on your own infrastructure with your own Amazon SES account — no limits but AWS's.</p>
      </div>
    </div>
    <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="shrink-0">
      <Button variant="secondary">
        <GithubIcon /> View on GitHub
      </Button>
    </a>
  </div>
)

// ---------------------------------------------------------------------------

export const FAQS = [
  {
    q: "Are these real email addresses?",
    a: "Yes. Inboxes are real, routable addresses (scout@bot.agmx.io or your own domain). Mail from anywhere on the internet is received through Amazon SES, and outbound mail is sent through SES with DKIM signing."
  },
  {
    q: "How does an agent sign itself up?",
    a: "It calls POST /api/v1/signup with a name and preferred username. AGMX returns an approval URL and a short code for the human. Once you approve, the agent's next poll returns an agent-scoped API key — exactly once."
  },
  {
    q: "Can my agent get verification codes reliably?",
    a: "That's the core use case. Call GET /api/v1/messages/wait right after triggering the email; it returns the moment it lands, with codes in extracted.codes and links (verify, login, reset…) in extracted.links."
  },
  {
    q: "Do I need MCP, or can I just use HTTP?",
    a: "Either. The MCP server at /mcp wraps the same services as the REST API, so limits, permissions and errors are identical. Use whichever your agent framework prefers."
  },
  {
    q: "What counts toward my send quota?",
    a: "Each recipient of an outbound message counts as one send (to, cc and bcc). Received mail has its own, much larger monthly allowance. Daily limits reset at 00:00 UTC, monthly limits on the 1st."
  },
  {
    q: "Can I use my own domain?",
    a: "On Pro and Scale. Add the domain, publish the MX, DKIM and DMARC records AGMX shows you, and create inboxes on it once DKIM verifies."
  },
  {
    q: "Is it open source?",
    a: "Yes — MIT licensed. Deploy it anywhere that runs Node and Postgres, configure your AWS SES credentials, and you have your own agent mail platform."
  }
]

export function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="mx-auto max-w-6xl px-5 pt-12 pb-24 sm:px-8 sm:pt-16 sm:pb-28">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
        <SectionTitle eyebrow="FAQ" title="Questions, answered." description="Something else? The docs go deep, and skill.md is what your agent will read." />
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
          {FAQS.map((item, i) => (
            <div key={item.q}>
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-medium transition hover:bg-surface-2"
                aria-expanded={open === i}
              >
                {item.q}
                <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform duration-200", open === i && "rotate-180")} />
              </button>
              <div className={cn("grid transition-all duration-300 ease-out", open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-[14px] leading-relaxed text-muted">{item.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-16 text-center shadow-card sm:px-12 sm:py-20">
        <div className="dot-bg absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <div className="relative">
          <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-line bg-bg px-3 py-1 font-mono text-[12px] text-muted shadow-card">
            <span className="size-1.5 rounded-full bg-accent animate-pulse-dot" /> 250 OK — ready to receive
          </div>
          <h2 className="mx-auto mt-6 max-w-2xl text-[34px] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-[52px]">Give your agent an inbox today.</h2>
          <p className="mx-auto mt-4 max-w-lg text-[16px] text-muted">Start with the free plan, or hand your agent one line and let it sign itself up.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/login">
              <Button size="lg" className="group">
                Get started free <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link to="/docs">
              <Button size="lg" variant="secondary">
                Read the docs
              </Button>
            </Link>
          </div>
          <SkillPrompt className="mx-auto mt-8 w-fit" />
        </div>
      </div>
    </section>
  )
}
