import { Link } from "@tanstack/react-router"
import { ArrowRight, Check, KeyRound, Minus, Plus } from "lucide-react"
import { useState, type ReactNode } from "react"
import { AgentAvatar } from "~/components/brand"
import { Button } from "~/components/ui/button"
import { CodeBlock, CodeTabs } from "~/components/ui/code"
import { CopyButton } from "~/components/ui/misc"
import { cn } from "~/lib/utils"
import { formatLimit, PLANS, type Plan } from "~/shared/plans"
import { GITHUB_URL, GithubIcon } from "./header"

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export const CONTAINER = "mx-auto w-full max-w-6xl px-5 sm:px-8"

export const Section = ({ id, children, className, divider = true }: { id?: string; children: ReactNode; className?: string; divider?: boolean }) => (
  <section id={id} className={cn("scroll-mt-14", divider && "border-t border-line")}>
    <div className={cn(CONTAINER, "py-24 sm:py-32", className)}>{children}</div>
  </section>
)

export const SectionHeading = ({ title, description, center, className }: { title: ReactNode; description?: ReactNode; center?: boolean; className?: string }) => (
  <div className={cn("max-w-2xl", center && "mx-auto text-center", className)}>
    <h2 className="text-3xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-4xl">{title}</h2>
    {description ? <p className="mt-4 text-[16px] leading-relaxed text-muted text-pretty">{description}</p> : null}
  </div>
)

/** Small dark code panel used for inline visuals; matches CodeBlock. */
const Terminal = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0f] p-4 font-mono text-[12px] leading-[1.75] text-white/75", className)}>{children}</div>
)

/** The "point your agent here" one-liner. */
export const SkillPrompt = ({ className, origin = "agmx.io" }: { className?: string; origin?: string }) => {
  const prompt = `Read ${origin}/skill.md and set up your own inbox.`
  return (
    <div className={cn("flex max-w-full items-center gap-3 rounded-lg border border-line bg-surface py-1 pr-1 pl-3.5", className)}>
      <span className="shrink-0 text-[13px] text-muted">Tell your agent</span>
      <span className="h-4 w-px shrink-0 bg-line" />
      <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink">{prompt}</code>
      <CopyButton value={prompt} label="Prompt copied — paste it into your agent" className="shrink-0" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

const STEPS: Array<{ title: string; body: string; visual: ReactNode }> = [
  {
    title: "Your agent asks for an inbox",
    body: "One unauthenticated call to POST /api/v1/signup. It gets back an approval link and a short code to show you.",
    visual: (
      <Terminal>
        <div>
          <span className="text-accent">POST</span> /api/v1/signup
        </div>
        <div className="text-white/45">{'{ "name": "Scout", "username": "scout" }'}</div>
        <div className="mt-2 text-white/45">
          → userCode <span className="text-[#e5c07b]">"KQ7M-3XPA"</span>
        </div>
      </Terminal>
    )
  },
  {
    title: "You approve it",
    body: "Open the link, check the agent and the address it wants, and approve. Nothing gets an inbox without a human saying yes.",
    visual: (
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-5">
        <AgentAvatar name="Scout" color="sky" />
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">Scout</div>
          <div className="truncate font-mono text-[12px] text-muted">scout@bot.agmx.io</div>
        </div>
        <span className="inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-ink px-2.5 text-[13px] font-medium text-bg">
          <Check className="size-3.5" /> Approve
        </span>
      </div>
    )
  },
  {
    title: "It sends, receives and replies",
    body: "The agent collects its own scoped API key, then works over REST or MCP. Codes and links come pre-extracted from every email.",
    visual: (
      <div className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[13.5px] font-medium">GitHub</span>
            <span className="text-[12px] text-muted">now</span>
          </div>
          <div className="truncate text-[13px] text-ink-2">Please verify your device</div>
          <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-bg-subtle px-1.5 py-0.5 font-mono text-[12px] font-medium">
            <KeyRound className="size-3 text-muted" /> 482913
          </div>
        </div>
      </div>
    )
  }
]

export function HowItWorks() {
  return (
    <Section id="how">
      <SectionHeading
        title="From sign-up to first email in three steps."
        description="Agents onboard themselves, and you stay in control: every agent needs your approval, gets its own scoped key, and can be paused at any time."
      />
      <ol className="mt-16 grid gap-12 md:grid-cols-3 md:gap-8">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex flex-col border-t border-line pt-6">
            <div className="text-[13px] text-muted tabular-nums">Step {i + 1}</div>
            <h3 className="mt-2 text-[17px] font-semibold tracking-[-0.01em]">{step.title}</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.body}</p>
            <div className="mt-6 md:h-[108px] md:[&>*]:h-full">{step.visual}</div>
          </li>
        ))}
      </ol>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Product band (the single dark section on the page)
// ---------------------------------------------------------------------------

const MOCK_MESSAGES = [
  { from: "GitHub", subject: "Please verify your device", snippet: "Verification code: 482913", time: "2m", unread: true, code: "482913", agent: ["Scout", "sky"] },
  { from: "Alice Chen", subject: "Re: Q3 vendor shortlist", snippet: "Thanks Scout — can you add pricing for the last two?", time: "14m", unread: true, agent: ["Scout", "sky"] },
  { from: "Linear", subject: "Your sign-in link", snippet: "Click to sign in to Linear. Expires in 10 minutes.", time: "1h", unread: false, agent: ["Ledger", "lime"] },
  { from: "Stripe", subject: "Your receipt from Acme Inc", snippet: "Receipt #2291-4410 · $49.00 paid", time: "3h", unread: false, agent: ["Ledger", "lime"] },
  { from: "Notion", subject: "Confirm your email", snippet: "Your login code is 771 204", time: "Yesterday", unread: false, code: "771204", agent: ["Research", "violet"] }
] as const

export function ProductBand() {
  return (
    <section className="bg-[#0b0b0c] text-white dark:border-y dark:border-line dark:bg-[#0e0e10]">
      <div className={cn(CONTAINER, "py-24 sm:py-32")}>
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-4xl">Every agent's mail, in one live inbox.</h2>
          <p className="mt-4 text-[16px] leading-relaxed text-white/55 text-pretty">
            Read along as your agents work, step in to reply, approve new agents and see exactly what was sent — all from one keyboard-driven dashboard.
          </p>
        </div>

        <div className="mt-16 overflow-hidden rounded-xl border border-white/10 bg-[#111113]">
          <div className="flex h-10 items-center border-b border-white/[0.07] px-4">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-white/12" />
              <span className="size-2.5 rounded-full bg-white/12" />
              <span className="size-2.5 rounded-full bg-white/12" />
            </div>
            <div className="mx-auto font-mono text-[11px] text-white/35">agmx.io/app/mail</div>
            <div className="w-[42px]" />
          </div>
          <div className="grid md:grid-cols-[188px_1fr] lg:grid-cols-[188px_1fr_1.1fr]">
            <div className="hidden border-r border-white/[0.07] p-3 md:block">
              {[
                ["Inbox", 2, true],
                ["Sent", 0, false],
                ["Starred", 0, false],
                ["Archived", 0, false]
              ].map(([label, n, active]) => (
                <div key={label as string} className={cn("flex h-8 items-center justify-between rounded-lg px-2.5 text-[13px]", active ? "bg-white/[0.07] text-white" : "text-white/50")}>
                  {label}
                  {n ? <span className="text-[12px] font-medium text-white tabular-nums">{n}</span> : null}
                </div>
              ))}
              <div className="mt-6 px-2.5 text-[11px] font-medium tracking-[0.08em] text-white/30 uppercase">Inboxes</div>
              {[
                ["Scout", "sky", "scout"],
                ["Ledger", "lime", "ledger"],
                ["Research", "violet", "research"]
              ].map(([name, color, addr]) => (
                <div key={name} className="mt-1 flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] text-white/60">
                  <AgentAvatar name={name!} color={color!} size="xs" /> {addr}
                </div>
              ))}
            </div>
            <div className="min-w-0 border-white/[0.07] lg:border-r">
              {MOCK_MESSAGES.map((m, i) => (
                <div key={i} className={cn("flex gap-3 border-b border-white/[0.05] px-4 py-3.5 last:border-0", i === 0 && "bg-white/[0.04]")}>
                  <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", m.unread ? "bg-accent" : "bg-transparent")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={cn("truncate text-[13.5px]", m.unread ? "font-medium text-white" : "text-white/65")}>{m.from}</span>
                      <span className="shrink-0 text-[11.5px] text-white/35 tabular-nums">{m.time}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className={cn("truncate text-[13px]", m.unread ? "text-white/85" : "text-white/55")}>
                        {m.subject} <span className="text-white/35">— {m.snippet}</span>
                      </span>
                      {"code" in m ? <span className="ml-auto shrink-0 rounded-md bg-white/[0.08] px-1.5 font-mono text-[11px] text-white/80">{m.code}</span> : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden p-7 lg:block">
              <div className="text-[17px] font-semibold tracking-[-0.01em]">Please verify your device</div>
              <div className="mt-4 flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">GH</span>
                <div className="text-[12.5px]">
                  <div className="text-white/85">GitHub &lt;noreply@github.com&gt;</div>
                  <div className="text-white/40">to scout@bot.agmx.io</div>
                </div>
              </div>
              <div className="mt-6 rounded-xl border border-white/10 p-4">
                <div className="text-[12px] text-white/45">Verification code</div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span className="font-mono text-[24px] font-semibold tracking-[0.18em] text-accent">482913</span>
                  <span className="rounded-md border border-white/10 px-2 py-0.5 text-[11.5px] text-white/55">verify link</span>
                </div>
              </div>
              <div className="mt-6 space-y-2 text-[13px] leading-relaxed text-white/55">
                <p>Hey scout,</p>
                <p>A sign-in attempt requires further verification. Enter the code above on the unrecognized device to finish signing in.</p>
              </div>
              <div className="mt-6 text-[12px] text-white/35">SPF pass · DKIM pass · DMARC pass</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export const codeSamples = (origin = "https://agmx.io") => [
  {
    label: "curl",
    lang: "bash" as const,
    code: `# Send from your agent's inbox
curl ${origin}/api/v1/messages \\
  -H "Authorization: Bearer $AGMX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "alice@example.com",
    "subject": "Your weekly report",
    "text": "Hi Alice — the report is attached."
  }'`
  },
  {
    label: "TypeScript",
    lang: "ts" as const,
    code: `const agmx = (path: string, init?: RequestInit) =>
  fetch(\`${origin}/api/v1\${path}\`, {
    ...init,
    headers: { Authorization: \`Bearer \${process.env.AGMX_API_KEY}\`, "Content-Type": "application/json" }
  }).then((r) => r.json())

// Sign up somewhere, then read the code it emails you
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

page = requests.get(f"{API}/messages", headers=H,
                    params={"folder": "inbox", "unread": "true"}).json()

for m in page["messages"]:
    print(m["from"]["address"], m["subject"], m["extracted"]["codes"])

# Reply in the same thread
requests.post(f"{API}/messages/{page['messages'][0]['id']}/reply",
              headers=H, json={"text": "Thanks, received."})`
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

const EXTRACTED_JSON = `{
  "subject": "[GitHub] Please verify your device",
  "from": { "address": "noreply@github.com" },
  "extracted": {
    "codes": ["482913"],
    "links": [
      { "kind": "verify", "url": "https://github.com/…" }
    ]
  }
}`

const WAIT_SNIPPET = `# Trigger the email, then wait for it to land
curl "https://agmx.io/api/v1/messages/wait?timeout=60" \\
  -H "Authorization: Bearer $AGMX_API_KEY"

# 200 OK after 1.8s
{
  "timedOut": false,
  "message": { "extracted": { "codes": ["482913"] } }
}`

const FeatureRow = ({ title, body, points, visual, reverse }: { title: string; body: string; points: Array<string>; visual: ReactNode; reverse?: boolean }) => (
  <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
    <div className={cn("min-w-0", reverse && "lg:order-2")}>
      <h3 className="text-2xl leading-tight font-semibold tracking-[-0.02em] text-balance">{title}</h3>
      <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted">{body}</p>
      <ul className="mt-6 flex flex-col gap-2.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-[14px] text-ink-2">
            <Check className="mt-[3px] size-4 shrink-0 text-muted" />
            {p}
          </li>
        ))}
      </ul>
    </div>
    <div className={cn("min-w-0", reverse && "lg:order-1")}>{visual}</div>
  </div>
)

const CAPABILITIES = [
  { title: "Threaded replies", body: "Replies set In-Reply-To and References, so conversations stay threaded in Gmail, Outlook and AGMX." },
  { title: "Signed webhooks", body: "message.received, sent, delivered, bounced and complained — HMAC-signed and retried with backoff for about six hours." },
  { title: "Plus-addressing labels", body: "Mail to scout+github@bot.agmx.io lands in scout's inbox, labelled github. One inbox, sorted per service." },
  { title: "Your own domain", body: "Publish the DKIM and MX records AGMX generates, then create inboxes at your brand. Included on Pro and Scale." },
  { title: "Scoped keys", body: "Agent keys see only their own inboxes. Account keys manage everything. Revoke either instantly." },
  { title: "Deliverability built in", body: "SPF, DKIM and DMARC verdicts on every inbound message. Hard bounces and complaints are suppressed automatically." }
]

export function Features() {
  return (
    <Section id="features">
      <SectionHeading
        title="Built for software that reads email."
        description="An API shaped around what agents actually do with mail — sign up for things, read codes, follow up — and still a pleasant inbox for the people supervising them."
      />
      <div className="mt-20 flex flex-col gap-24 sm:gap-28">
        <FeatureRow
          title="Codes and links, already extracted"
          body="Every inbound email is scanned for one-time codes and action links, so your agent reads a field instead of parsing HTML."
          points={["extracted.codes for OTPs and PINs", "extracted.links classified as verify, login, reset or unsubscribe", "Full text, HTML, headers and attachments when you need them"]}
          visual={<CodeBlock lang="json" title="GET /api/v1/messages/msg_01j9…" code={EXTRACTED_JSON} />}
        />
        <FeatureRow
          reverse
          title="Wait for the next email"
          body="GET /messages/wait holds the connection open until mail arrives, for up to 60 seconds. No polling loops, no sleeps."
          points={["Filter by inbox, sender or subject", "Returns the full message the moment it lands", "Same behaviour over MCP as wait_for_email"]}
          visual={<CodeBlock lang="bash" title="Verification flow" code={WAIT_SNIPPET} />}
        />
        <FeatureRow
          title="REST or MCP. Same tools, same limits."
          body="A small, typed API with an OpenAPI 3.1 spec, and an MCP server that wraps exactly the same operations. Every error has a stable _tag your agent can branch on."
          points={["13 MCP tools over Streamable HTTP at /mcp", "Bearer keys scoped to the account or a single agent", "Interactive reference at /api/v1/reference"]}
          visual={<CodeTabs tabs={codeSamples()} />}
        />
      </div>

      <div className="mt-24 grid gap-x-10 gap-y-9 border-t border-line pt-12 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((c) => (
          <div key={c.title}>
            <h3 className="text-[14px] font-semibold">{c.title}</h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{c.body}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Pricing
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
        <div key={plan.id} className={cn("flex flex-col rounded-xl border bg-surface p-6", plan.highlight ? "border-ink/80 dark:border-ink/60" : "border-line")}>
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold">{plan.name}</h3>
            {plan.highlight ? <span className="rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-medium text-bg">Most popular</span> : null}
          </div>
          <p className="mt-1 text-[13.5px] text-muted">{plan.tagline}</p>
          <div className="mt-6 flex items-baseline gap-1.5">
            <span className="text-[40px] leading-none font-semibold tracking-[-0.04em] tabular-nums">${plan.priceMonthly}</span>
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
                    <Check className="mt-0.5 size-4 shrink-0 text-muted" />
                    {f}
                  </li>
                ))}
              </ul>
            ) : (
              <dl className="flex flex-col gap-2.5">
                {planRows(plan).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 text-[13.5px]">
                    <dt className="text-muted">{k}</dt>
                    <dd className="font-medium tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export const SelfHostNote = ({ className }: { className?: string }) => (
  <div className={cn("flex flex-col items-start justify-between gap-4 rounded-xl border border-line px-6 py-5 sm:flex-row sm:items-center", className)}>
    <div className="flex items-start gap-3.5">
      <GithubIcon className="mt-0.5 size-5 shrink-0 text-muted" />
      <div>
        <div className="text-[14px] font-semibold">Self-host for free</div>
        <p className="mt-0.5 text-[13.5px] text-muted">AGMX is MIT licensed. Run it with your own Amazon SES account, and every limit becomes yours to set.</p>
      </div>
    </div>
    <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="shrink-0">
      <Button variant="secondary">View on GitHub</Button>
    </a>
  </div>
)

export function PricingPreview() {
  return (
    <Section id="pricing">
      <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
        <SectionHeading
          title="Priced by agents, not seats."
          description="Plans differ in how many agents and inboxes you run, and how much mail they send and receive. Each recipient counts as one send."
        />
        <Link to="/pricing" className="shrink-0">
          <Button variant="secondary">
            Compare plans <ArrowRight />
          </Button>
        </Link>
      </div>
      <div className="mt-12">
        <PricingCards compact />
      </div>
      <SelfHostNote className="mt-4" />
    </Section>
  )
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------

export const FAQS = [
  {
    q: "Are these real email addresses?",
    a: "Yes. Inboxes are real, routable addresses such as scout@bot.agmx.io, or addresses on your own domain. Mail from anywhere is received through Amazon SES, and outbound mail is sent through SES with DKIM signing."
  },
  {
    q: "How does an agent sign itself up?",
    a: "It calls POST /api/v1/signup with a name and preferred username. AGMX returns an approval link and a short code for you. Once you approve, the agent's next poll returns an agent-scoped API key — exactly once."
  },
  {
    q: "Can my agent get verification codes reliably?",
    a: "That's the core use case. Call GET /api/v1/messages/wait right after triggering the email. It returns the moment the email lands, with codes in extracted.codes and links in extracted.links."
  },
  {
    q: "Do I need MCP, or can I use plain HTTP?",
    a: "Either. The MCP server at /mcp wraps the same services as the REST API, so limits, permissions and errors are identical."
  },
  {
    q: "What counts toward my limits?",
    a: "Each recipient of an outbound message counts as one send (to, cc and bcc). Received mail has its own, much larger monthly allowance; mail beyond it is dropped. Daily limits reset at 00:00 UTC, monthly limits on the 1st."
  },
  {
    q: "Is it open source?",
    a: "Yes, MIT licensed. Deploy it anywhere that runs Node and Postgres, add your Amazon SES credentials, and you have your own agent mail platform."
  }
]

export function Faq({ divider = true }: { divider?: boolean }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <Section id="faq" divider={divider}>
      <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
        <SectionHeading
          title="Questions"
          description={
            <>
              Something else? The{" "}
              <Link to="/docs" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                docs
              </Link>{" "}
              go deep, and{" "}
              <a href="/skill.md" className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
                skill.md
              </a>{" "}
              is what your agent will read.
            </>
          }
        />
        <div className="border-t border-line">
          {FAQS.map((item, i) => (
            <div key={item.q} className="border-b border-line">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-6 py-5 text-left text-[15px] font-medium transition-colors hover:text-ink-2"
                aria-expanded={open === i}
              >
                {item.q}
                {open === i ? <Minus className="size-4 shrink-0 text-muted" /> : <Plus className="size-4 shrink-0 text-muted" />}
              </button>
              <div className={cn("grid transition-all duration-300 ease-out", open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                <div className="overflow-hidden">
                  <p className="max-w-2xl pb-5 text-[14px] leading-relaxed text-muted">{item.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Final call to action
// ---------------------------------------------------------------------------

export function FinalCta() {
  return (
    <Section className="flex flex-col items-center text-center">
      <h2 className="max-w-2xl text-4xl leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-5xl">Give your agent an inbox today.</h2>
      <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-muted text-balance">Start on the free plan, or hand your agent one line and let it sign itself up.</p>
      <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
        <Link to="/login" className="w-full sm:w-auto">
          <Button size="lg" className="w-full">
            Get started free
          </Button>
        </Link>
        <Link to="/docs" className="w-full sm:w-auto">
          <Button size="lg" variant="secondary" className="w-full">
            Read the docs
          </Button>
        </Link>
      </div>
      <SkillPrompt className="mt-8 w-full max-w-[34rem]" />
    </Section>
  )
}
