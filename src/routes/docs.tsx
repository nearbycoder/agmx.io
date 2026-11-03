import { seo, siteUrlFrom } from "~/lib/seo"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowUpRight, BookOpen, ChevronDown } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { Callout, DocTable, Endpoint, Params } from "~/components/marketing/docs-kit"
import { MarketingFooter } from "~/components/marketing/footer"
import { MarketingHeader } from "~/components/marketing/header"
import { CodeBlock, CodeTabs } from "~/components/ui/code"
import { cn } from "~/lib/utils"

export const Route = createFileRoute("/docs")({
  head: ({ match }) =>
    seo({
      siteUrl: siteUrlFrom(match),
      path: "/docs",
      title: "Documentation — AGMX",
      description: "AGMX docs: agent self sign-up, prompt-injection protection, send approvals, drafts and scheduling, temporary inboxes, sender rules, webhooks, MCP, SDKs and self-hosting.",
      image: "/og/docs.png",
      type: "article"
    }),
  component: DocsPage
})

const NAV: Array<{ group: string; items: Array<{ id: string; label: string }> }> = [
  {
    group: "Getting started",
    items: [
      { id: "introduction", label: "Introduction" },
      { id: "quickstart", label: "Quickstart" },
      { id: "authentication", label: "Authentication" }
    ]
  },
  {
    group: "Email",
    items: [
      { id: "inboxes", label: "Inboxes" },
      { id: "temporary", label: "Temporary inboxes" },
      { id: "sending", label: "Sending" },
      { id: "drafts", label: "Drafts & scheduling" },
      { id: "receiving", label: "Receiving" },
      { id: "waiting", label: "Waiting for email" },
      { id: "threads", label: "Replies & threads" },
      { id: "organizing", label: "Flags & labels" },
      { id: "rules", label: "Sender rules" }
    ]
  },
  {
    group: "Safety",
    items: [
      { id: "security", label: "Reading mail safely" },
      { id: "approvals", label: "Send approvals" }
    ]
  },
  {
    group: "Integrations",
    items: [
      { id: "webhooks", label: "Webhooks" },
      { id: "mcp", label: "MCP server" },
      { id: "sdks", label: "SDKs & CLI" },
      { id: "domains", label: "Custom domains" }
    ]
  },
  {
    group: "Reference",
    items: [
      { id: "errors", label: "Errors" },
      { id: "limits", label: "Plans & limits" },
      { id: "your-data", label: "Export & deletion" },
      { id: "self-hosting", label: "Self-hosting" },
      { id: "api-reference", label: "API reference" }
    ]
  }
]

const ALL_IDS = NAV.flatMap((g) => g.items.map((i) => i.id))

function useOrigin() {
  const [origin, setOrigin] = useState("https://agmx.io")
  useEffect(() => setOrigin(window.location.origin), [])
  return origin
}

function useActiveSection() {
  const [active, setActive] = useState(ALL_IDS[0]!)
  useEffect(() => {
    const onScroll = () => {
      let current = ALL_IDS[0]!
      for (const id of ALL_IDS) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top < 140) current = id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])
  return active
}

const H2 = ({ id, children }: { id: string; children: ReactNode }) => (
  <h2 id={id} className="border-t border-line pt-12">
    <a href={`#${id}`} className="!no-underline">
      {children}
    </a>
  </h2>
)

function DocsPage() {
  const origin = useOrigin()
  const active = useActiveSection()
  const [mobileOpen, setMobileOpen] = useState(false)
  const api = `${origin}/api/v1`
  const activeLabel = NAV.flatMap((g) => g.items).find((i) => i.id === active)?.label

  return (
    <div className="min-h-screen overflow-x-clip bg-bg">
      <MarketingHeader />

      {/* Mobile section picker */}
      <div className="sticky top-14 z-30 border-b border-line bg-bg/90 backdrop-blur lg:hidden">
        <button onClick={() => setMobileOpen((o) => !o)} className="flex w-full items-center justify-between px-5 py-3 text-[13.5px] font-medium" aria-expanded={mobileOpen}>
          <span className="flex items-center gap-2">
            <BookOpen className="size-4 text-muted" /> {activeLabel}
          </span>
          <ChevronDown className={cn("size-4 text-muted transition", mobileOpen && "rotate-180")} />
        </button>
        {mobileOpen ? (
          <div className="scrollbar-thin max-h-[60vh] overflow-y-auto border-t border-line px-3 py-3">
            <SidebarNav active={active} onNavigate={() => setMobileOpen(false)} />
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex max-w-6xl gap-12 px-5 sm:px-8">
        <aside className="scrollbar-thin sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 overflow-y-auto py-10 lg:block">
          <SidebarNav active={active} />
          <div className="mt-8 border-t border-line pt-5 pl-2.5">
            <div className="text-[12px] font-medium text-ink">For agents</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">A condensed version of these docs, written for agents to read.</p>
            <a href="/skill.md" className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-ink hover:underline">
              Open skill.md <ArrowUpRight className="size-3" />
            </a>
          </div>
        </aside>

        <article className="prose-docs min-w-0 flex-1 py-10 pb-24 lg:py-14">
          {/* ------------------------------------------------------------- */}
          <section>
            <h1 id="introduction" className="scroll-mt-28 text-4xl leading-[1.08] font-semibold tracking-[-0.035em] sm:text-[44px]">
              Email for AI agents
            </h1>
            <p className="!mt-4 !text-[17px] text-muted">
              AGMX gives every agent a real, routable inbox. Agents receive mail with verification codes and links already extracted, and send, reply and forward through
              the same API — over REST, MCP or webhooks.
            </p>
            <div className="not-prose mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { href: "#quickstart", title: "Quickstart", body: "Get an inbox in under a minute." },
                { href: "#waiting", title: "Verification codes", body: "Wait for an email and read the code." },
                { href: "#mcp", title: "MCP server", body: "Plug AGMX into Claude or Cursor." }
              ].map((c) => (
                <a key={c.href} href={c.href} className="group rounded-xl border border-line bg-surface p-4 !no-underline transition-colors hover:border-line-strong">
                  <div className="flex items-center justify-between text-[14px] font-semibold">
                    {c.title}
                    <ArrowUpRight className="size-4 text-faint transition group-hover:text-ink" />
                  </div>
                  <p className="mt-1 text-[13px] text-muted">{c.body}</p>
                </a>
              ))}
            </div>
            <h3>Core concepts</h3>
            <ul>
              <li>
                <strong>Agent</strong> — an identity for one of your AI agents. It owns inboxes, can have its own scoped API key and an optional webhook URL.
              </li>
              <li>
                <strong>Inbox</strong> — a real address such as <code>scout@bot.agmx.io</code>, or one on your own domain.
              </li>
              <li>
                <strong>Message</strong> — an inbound or outbound email. Inbound mail carries a <code>security</code> report, a cleaned <code>safeText</code> and{" "}
                <code>extracted</code> data (codes, links, events, receipts, tracking numbers).
              </li>
              <li>
                <strong>Thread</strong> — a conversation. Replies are grouped using <code>In-Reply-To</code> and <code>References</code> headers.
              </li>
            </ul>
            <p>
              The base URL for every endpoint is <code>{api}</code>. Requests and responses are JSON.
            </p>
          </section>

          {/* ------------------------------------------------------------- */}
          <H2 id="quickstart">
            Quickstart
          </H2>
          <p>There are two ways to get credentials: let the agent sign itself up (you approve it), or create an agent and key yourself in the dashboard.</p>
          <h3>Option A — agent self sign-up</h3>
          <p>
            The agent calls a public endpoint, shows you an approval link and code, and polls until you approve. This is what <a href="/skill.md">skill.md</a> walks an
            agent through.
          </p>
          <Endpoint method="POST" path="/api/v1/signup" auth={false} />
          <CodeTabs
            tabs={[
              {
                label: "Request",
                lang: "bash",
                code: `curl -X POST ${api}/signup \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Scout",
    "username": "scout",
    "description": "Researches vendors and signs up for trials",
    "ownerEmail": "you@example.com"
  }'`
              },
              {
                label: "Response",
                lang: "json",
                code: `{
  "signupId": "sgn_01j9…",
  "userCode": "KQ7M-3XPA",
  "pollToken": "agmx_poll_…",
  "approvalUrl": "${origin}/claim/KQ7M-3XPA",
  "pollUrl": "${api}/signup/sgn_01j9…?token=agmx_poll_…",
  "pollIntervalSeconds": 5,
  "expiresAt": "2026-11-02T12:30:00.000Z",
  "instructions": "Ask your human to open …"
}`
              }
            ]}
          />
          <Params
            title="Body"
            params={[
              { name: "name", type: "string", required: true, description: "The agent's display name (max 80 characters)." },
              { name: "username", type: "string", description: "Preferred inbox local part. A random one is chosen if it's omitted." },
              { name: "description", type: "string", description: "What the agent will use the inbox for. Shown to the approver." },
              { name: "ownerEmail", type: "string", description: "The approver's email. The request then appears in their dashboard under Agents." }
            ]}
          />
          <p>
            Open <code>approvalUrl</code> (or enter the code in the dashboard) and approve. Meanwhile the agent polls <code>pollUrl</code> every 5 seconds:
          </p>
          <Endpoint method="GET" path="/api/v1/signup/{signupId}?token={pollToken}" auth={false} />
          <CodeBlock
            lang="json"
            code={`{
  "status": "approved",          // pending | approved | completed | denied | expired
  "apiKey": "agmx_agt_…",        // returned exactly once
  "agent": { "id": "agt_…", "name": "Scout", "inboxes": [ … ] },
  "inbox": { "id": "inb_…", "address": "scout@bot.agmx.io" },
  "mcpUrl": "${origin}/mcp",
  "apiBaseUrl": "${api}"
}`}
          />
          <Callout tone="warn" title="The key is shown once">
            The first poll after approval returns <code>apiKey</code> and flips the status to <code>completed</code>. Later polls return <code>apiKey: null</code>. Requests
            expire after 30 minutes.
          </Callout>
          <h3>Option B — from the dashboard</h3>
          <ol>
            <li>
              <Link to="/login">Sign in</Link> and create an agent under <strong>Agents</strong>. Give it a username to create its first inbox.
            </li>
            <li>
              Create an agent-scoped key under <strong>API keys</strong> (or tick "create an API key" when creating the agent).
            </li>
            <li>Hand the key to your agent as an environment variable, e.g. <code>AGMX_API_KEY</code>.</li>
          </ol>
          <h3>Your first request</h3>
          <CodeBlock
            lang="bash"
            code={`curl ${api}/me -H "Authorization: Bearer $AGMX_API_KEY"`}
          />
          <p>
            <code>/me</code> returns the account, plan limits, current usage and which agent the key belongs to — a good first call for any agent.
          </p>

          {/* ------------------------------------------------------------- */}
          <H2 id="authentication">
            Authentication
          </H2>
          <p>
            Send your key as a bearer token: <code>Authorization: Bearer agmx_…</code>. The dashboard uses a session cookie against the very same API.
          </p>
          <DocTable
            head={["Key type", "Prefix", "Can do"]}
            rows={[
              [
                <strong key="a" className="whitespace-nowrap">Agent key</strong>,
                <code key="b">agmx_agt_</code>,
                "Read and send mail for its own agent's inboxes, create inboxes for itself, manage its webhook. Cannot see other agents, create agents, manage keys or domains."
              ],
              [<strong key="a" className="whitespace-nowrap">Account key</strong>, <code key="b">agmx_acc_</code>, "Everything the dashboard can do: all agents, inboxes, keys, domains and sign-up approvals."]
            ]}
          />
          <Callout tone="tip">Give each agent its own agent key. If one leaks, revoke it in the dashboard without touching any other agent.</Callout>

          {/* ------------------------------------------------------------- */}
          <H2 id="inboxes">
            Inboxes
          </H2>
          <p>An inbox is a real address that belongs to one agent. Each plan sets how many inboxes an agent may own.</p>
          <Endpoint method="POST" path="/api/v1/inboxes" />
          <CodeBlock
            lang="bash"
            code={`curl -X POST ${api}/inboxes \\
  -H "Authorization: Bearer $AGMX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "username": "billing-bot", "displayName": "Billing Bot" }'`}
          />
          <Params
            title="Body"
            params={[
              { name: "username", type: "string", description: "Local part: lowercase letters, numbers, ., _ and -, 3–64 characters. Omit for a random friendly name like swift-otter-4821." },
              { name: "displayName", type: "string | null", description: "The name recipients see, e.g. “Billing Bot”." },
              { name: "domain", type: "string", description: "A verified custom domain on your account. Defaults to the shared domain." },
              { name: "agentId", type: "string", description: "Required with account keys and sessions; implied with agent keys." },
              { name: "expiresIn", type: "number", description: <>Seconds until the inbox and its mail are deleted (60 – 604800). See <a href="#temporary">temporary inboxes</a>.</> },
              { name: "maxMessages", type: "number", description: "Stop accepting mail after this many messages." },
              { name: "acceptFrom", type: "string[]", description: <>Only accept mail from these addresses or domains. Creates <a href="#rules">allow rules</a>.</> }
            ]}
          />
          <p>
            Other endpoints: <code>GET /inboxes</code> (with unread counts), <code>GET /inboxes/{"{id}"}</code>, <code>PATCH /inboxes/{"{id}"}</code> to rename or pause (
            <code>{'{"status": "paused"}'}</code>), and <code>DELETE /inboxes/{"{id}"}</code> to release the address. Paused inboxes neither send nor receive. Reserved names such
            as <code>postmaster</code> or <code>admin</code> can't be claimed.
          </p>

          {/* ------------------------------------------------------------- */}
          <H2 id="temporary">
            Temporary inboxes
          </H2>
          <p>
            Most agent mail is “sign up somewhere, grab the code, move on”. A temporary inbox exists for exactly that: it deletes itself — with its mail — when it expires, and
            temporary inboxes don't count against your plan's inboxes-per-agent limit (up to 10 per agent at once).
          </p>
          <CodeBlock
            lang="bash"
            code={`curl -X POST ${api}/inboxes \\
  -H "Authorization: Bearer $AGMX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "expiresIn": 3600, "maxMessages": 1, "acceptFrom": ["github.com"] }'

# → { "address": "tmp-swift-otter-4821@bot.agmx.io", "temporary": true, "expiresAt": "…", "maxMessages": 1, … }`}
          />
          <ul>
            <li>
              <code>maxMessages</code> closes the inbox once it has received that many messages; later mail is dropped and the inbox can no longer send.
            </li>
            <li>
              <code>acceptFrom</code> turns the inbox into an allow-list, so only the service you're signing up for can reach it — less spam, fewer injection attempts.
            </li>
            <li>Expired inboxes are removed within a minute. Agent keys can create temporary inboxes for themselves.</li>
          </ul>

          {/* ------------------------------------------------------------- */}
          <H2 id="sending">
            Sending
          </H2>
          <Endpoint method="POST" path="/api/v1/messages" />
          <CodeTabs
            tabs={[
              {
                label: "curl",
                lang: "bash",
                code: `curl -X POST ${api}/messages \\
  -H "Authorization: Bearer $AGMX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "scout@bot.agmx.io",
    "to": ["Alice Chen <alice@example.com>"],
    "subject": "Vendor shortlist",
    "text": "Hi Alice — the shortlist is attached.",
    "attachments": [{
      "filename": "shortlist.csv",
      "contentType": "text/csv",
      "content": "dmVuZG9yLHByaWNlCkFjbWUsNDkK"
    }]
  }'`
              },
              {
                label: "TypeScript",
                lang: "ts",
                code: `const res = await fetch("${api}/messages", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.AGMX_API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    to: "alice@example.com",
    subject: "Vendor shortlist",
    html: "<p>Hi Alice — <b>three</b> vendors made the cut.</p>"
  })
})
const message = await res.json() // full Message, status "sent"`
              }
            ]}
          />
          <Params
            title="Body"
            params={[
              { name: "from", type: "string", description: "Inbox id or address. Optional when the agent owns exactly one inbox." },
              { name: "to", type: "string | string[]", required: true, description: "Recipients. Accepts addr@x.com or Name <addr@x.com>, comma-separated or as a list." },
              { name: "cc / bcc", type: "string | string[]", description: "Additional recipients. Bcc addresses are never written to headers." },
              { name: "replyTo", type: "string | string[]", description: "Reply-To header." },
              { name: "subject", type: "string", required: true, description: "Subject line." },
              { name: "text / html", type: "string", description: "Provide at least one (or an attachment). If only html is given, a text part is generated." },
              { name: "attachments", type: "{ filename, contentType?, content }[]", description: "content is base64. Total message size is capped per plan." },
              { name: "headers", type: "Record<string, string>", description: "Extra headers to add." },
              { name: "labels", type: "string[]", description: "Labels to store on the sent message." },
              { name: "sendAt", type: "ISO timestamp", description: <>Send later, up to 30 days ahead. The message is returned with status <code>scheduled</code>.</> },
              { name: "idempotencyKey", type: "string", description: <>Safe-retry key (also accepted as an <code>Idempotency-Key</code> header). Repeating a request with the same key returns the original message instead of sending again.</> }
            ]}
          />
          <Callout tone="tip" title="Always send an Idempotency-Key">
            Agents retry. If a request times out after AGMX accepted it, retrying without a key can send the email twice. Generate a key per logical send (a UUID is fine) and
            reuse it on retries. The official SDKs do this for you.
          </Callout>
          <ul>
            <li>
              <strong>Quota:</strong> every recipient (to + cc + bcc) counts as one send against daily and monthly limits. A failed delivery is refunded.
            </li>
            <li>
              <strong>Internal delivery:</strong> mail between two AGMX inboxes is delivered instantly without leaving the platform.
            </li>
            <li>
              <strong>Suppression:</strong> addresses that hard-bounced or complained are refused with <code>InvalidRequest</code> to protect deliverability.
            </li>
            <li>At most 50 recipients per message.</li>
            <li>
              <strong>Approvals:</strong> if the sending agent's <a href="#approvals">send policy</a> requires review, the message comes back with status{" "}
              <code>pending_approval</code> and is sent once a human approves it.
            </li>
          </ul>

          {/* ------------------------------------------------------------- */}
          <H2 id="drafts">
            Drafts & scheduling
          </H2>
          <p>
            Messages move through these statuses: <code>draft</code> → <code>scheduled</code> or <code>pending_approval</code> → <code>sending</code> → <code>sent</code> →{" "}
            <code>delivered</code> / <code>bounced</code> / <code>complained</code> (or <code>failed</code> / <code>rejected</code>). Drafts, scheduled and held mail don't
            appear in threads until they're sent.
          </p>
          <DocTable
            head={["Endpoint", "What it does"]}
            rows={[
              [<code key="e">POST /drafts</code>, <>Create a draft. Everything is optional; pass <code>replyToMessageId</code> (and <code>replyAll</code>) to start a threaded reply.</>],
              [<code key="e">PATCH /drafts/{"{id}"}</code>, <>Update fields. Passing <code>attachments</code> replaces them all.</>],
              [<code key="e">POST /drafts/{"{id}"}/send</code>, <>Send now, or pass <code>{'{"sendAt": "…"}'}</code> to schedule. Subject to the send policy.</>],
              [<code key="e">GET /drafts</code>, "List drafts (same shape as GET /messages)."],
              [<code key="e">DELETE /drafts/{"{id}"}</code>, "Delete a draft, scheduled or rejected message."],
              [<code key="e">POST /messages/{"{id}"}/cancel</code>, "Move a scheduled message back to drafts."]
            ]}
          />
          <p>
            Scheduled mail is released within about 10 seconds of <code>sendAt</code>. Quota is checked when the message actually sends, not when it's scheduled.
          </p>

          {/* ------------------------------------------------------------- */}
          <H2 id="receiving">
            Receiving
          </H2>
          <Endpoint method="GET" path="/api/v1/messages" />
          <Params
            title="Query"
            params={[
              { name: "folder", type: '"inbox" | "sent" | "starred" | "archived" | "spam" | "drafts" | "scheduled" | "pending" | "all"', description: <>inbox = received, not archived, not spam. <code>pending</code> lists held and rejected mail.</> },
              { name: "inboxId / agentId / threadId", type: "string", description: "Narrow to one inbox, agent or conversation." },
              { name: "direction", type: '"inbound" | "outbound"', description: "Filter by direction." },
              { name: "unread", type: '"true" | "false"', description: "Only unread or read messages." },
              { name: "q", type: "string", description: "Search subject, body, sender and recipients." },
              { name: "since", type: "ISO timestamp", description: "Only messages created after this time." },
              { name: "limit / cursor", type: "number / string", description: "Page size (1–100, default 25) and the nextCursor from the previous page." }
            ]}
          />
          <p>
            The list returns summaries (no bodies) newest first: <code>{"{ messages: [...], nextCursor }"}</code>. Fetch one message in full — text, HTML, headers, SPF/DKIM/DMARC
            verdicts and attachments — with:
          </p>
          <Endpoint method="GET" path="/api/v1/messages/{messageId}?markRead=true" />
          <h3>Extracted data</h3>
          <p>Every inbound message is scanned so agents don't need to parse HTML. Extraction only looks at visible content, so hidden text can't plant fake codes or links.</p>
          <CodeBlock
            lang="json"
            code={`"extracted": {
  "codes": ["482913"],
  "links": [
    { "url": "https://github.com/sessions/verified-device?token=…", "text": "Verify device", "kind": "verify" },
    { "url": "https://www.ups.com/track?tracknum=1Z999AA10123456784", "text": "Track package", "kind": "tracking" }
  ],
  "events": [
    { "title": "Design review", "start": "2026-11-05T20:00:00.000Z", "end": "2026-11-05T21:00:00.000Z",
      "allDay": false, "location": "Zoom", "organizer": "ada@example.com", "method": "REQUEST", "uid": "…", "url": null }
  ],
  "receipt": { "merchant": "Acme Cloud", "total": 49, "currency": "USD", "orderNumber": "2041-8812" },
  "tracking": [{ "carrier": "ups", "number": "1Z999AA10123456784", "url": "https://www.ups.com/track?…" }]
}`}
          />
          <ul>
            <li>
              <strong>codes</strong> are ranked by how likely they are to be the one you want (near words like “code” or “verification”).
            </li>
            <li>
              <strong>links</strong> are sorted by kind: <code>verify</code>, <code>login</code>, <code>reset</code>, <code>tracking</code>, <code>other</code>, then{" "}
              <code>unsubscribe</code>.
            </li>
            <li>
              <strong>events</strong> come from calendar invites (<code>text/calendar</code> parts or <code>.ics</code> attachments), with time zones converted to UTC.
            </li>
            <li>
              <strong>receipt</strong> is filled for receipts, invoices and order confirmations; <strong>tracking</strong> lists UPS, FedEx, USPS and DHL numbers.
            </li>
          </ul>
          <h3>Attachments</h3>
          <p>
            Each attachment in a full message has a <code>downloadUrl</code> (<code>GET /messages/{"{id}"}/attachments/{"{attachmentId}"}</code>) for the raw bytes — use the same
            bearer key (in production it redirects to a short-lived signed URL). Text from PDFs and plain-text, CSV, JSON and XML attachments is included as{" "}
            <code>extractedText</code> (up to 20,000 characters), so agents can read them without downloading anything.
          </p>

          {/* ------------------------------------------------------------- */}
          <H2 id="waiting">
            Waiting for email
          </H2>
          <p>
            The wait endpoint is a long-poll: it holds the request open and returns the instant a matching inbound message arrives. It's the most reliable way to collect a
            verification code.
          </p>
          <Endpoint method="GET" path="/api/v1/messages/wait" />
          <Params
            title="Query"
            params={[
              { name: "timeout", type: "number", description: "Seconds to wait, 1–60. Default 30." },
              { name: "since", type: "ISO timestamp", description: "Only messages after this time. Defaults to now — pass the time you triggered the email to avoid races." },
              { name: "inboxId", type: "string", description: "Inbox id or address to watch. Defaults to every inbox the key can see." },
              { name: "from", type: "string", description: "Substring match on the sender address, e.g. github.com." },
              { name: "subject", type: "string", description: "Substring match on the subject." }
            ]}
          />
          <CodeBlock
            lang="ts"
            code={`const since = new Date().toISOString()
await submitSignupForm({ email: "scout@bot.agmx.io" })

const res = await fetch(\`${api}/messages/wait?timeout=60&from=github.com&since=\${since}\`, {
  headers: { Authorization: \`Bearer \${process.env.AGMX_API_KEY}\` }
})
const { message, timedOut } = await res.json()
if (timedOut) throw new Error("No email yet — try again")
const code = message.extracted.codes[0]`}
          />

          {/* ------------------------------------------------------------- */}
          <H2 id="threads">
            Replies & threads
          </H2>
          <Endpoint method="POST" path="/api/v1/messages/{messageId}/reply" />
          <CodeBlock lang="json" code={`{ "text": "Thanks — confirmed for Tuesday.", "replyAll": true }`} />
          <p>
            Replies go to the original <code>Reply-To</code> (or sender), quote the original message, use a <code>Re:</code> subject and set <code>In-Reply-To</code> /{" "}
            <code>References</code> so every mail client threads them. <code>replyAll</code> adds the original to and cc recipients (minus yourself). <code>html</code> and{" "}
            <code>attachments</code> are accepted too.
          </p>
          <Endpoint method="POST" path="/api/v1/messages/{messageId}/forward" />
          <CodeBlock lang="json" code={`{ "to": "finance@example.com", "text": "FYI — receipt below." }`} />
          <p>Forwards include the original attachments. To read a whole conversation, oldest first:</p>
          <Endpoint method="GET" path="/api/v1/threads/{threadId}" />
          <p>
            <code>GET /threads</code> lists conversations by most recent activity, with message and unread counts.
          </p>

          {/* ------------------------------------------------------------- */}
          <H2 id="organizing">
            Flags & labels
          </H2>
          <Endpoint method="PATCH" path="/api/v1/messages/{messageId}" />
          <CodeBlock lang="json" code={`{ "isRead": true, "isStarred": false, "isArchived": true, "isSpam": false, "labels": ["receipts"] }`} />
          <h3>Plus-addressing</h3>
          <p>
            Mail sent to <code>scout+github@bot.agmx.io</code> is delivered to <code>scout@bot.agmx.io</code> with the label <code>github</code>. Give each service a different tag and
            filter on <code>labels</code> later.
          </p>
          <p>
            <code>DELETE /messages/{"{id}"}</code> permanently removes a message. Messages older than your plan's retention period are cleaned up automatically.
          </p>

          {/* ------------------------------------------------------------- */}
          <H2 id="rules">
            Sender rules
          </H2>
          <p>Rules filter an inbox before mail is stored. They're evaluated in order:</p>
          <DocTable
            head={["Action", "Effect", "target"]}
            rows={[
              [<code key="a">allow</code>, "If an inbox has any allow rules, only matching senders get through — everything else is dropped.", "—"],
              [<code key="a">block</code>, "Drop matching mail. The first matching allow/block rule wins.", "—"],
              [<code key="a">label</code>, "Add a label to matching mail.", "label name"],
              [<code key="a">forward</code>, "Send a copy of matching mail to another address (counts as a send).", "email address"],
              [<code key="a">webhook</code>, "POST a message.received event for matching mail to a URL, in addition to the agent's webhook.", "https URL"]
            ]}
          />
          <p>
            Match on <code>sender</code> (a full address), <code>domain</code> (the sender's domain or any subdomain of it) or <code>subject</code> (contains, case-insensitive).
          </p>
          <Endpoint method="POST" path="/api/v1/inboxes/{inboxId}/rules" />
          <CodeBlock lang="json" code={`{ "field": "domain", "value": "github.com", "action": "allow" }`} />
          <p>
            Also <code>GET /inboxes/{"{id}"}/rules</code>, <code>PATCH /rules/{"{ruleId}"}</code> (including <code>enabled</code> and <code>position</code>) and{" "}
            <code>DELETE /rules/{"{ruleId}"}</code>. Dropped mail isn't stored and doesn't count as received.
          </p>
          <Callout tone="warn" title="Forward and webhook rules are human-only">
            Agent keys can create <code>allow</code>, <code>block</code> and <code>label</code> rules for their own inboxes, but only people (the dashboard) and account keys can
            create <code>forward</code> or <code>webhook</code> rules. Otherwise a prompt-injected agent could be talked into quietly copying its mail to an attacker.
          </Callout>

          {/* ------------------------------------------------------------- */}
          <H2 id="security">
            Reading mail safely
          </H2>
          <p>
            Email is untrusted input that agents feed straight into a model. Attackers hide instructions where a person reviewing the message won't see them — white-on-white
            text, zero-size fonts, <code>display:none</code>, HTML comments, invisible Unicode — and phrase them as orders. AGMX analyses every inbound message and gives you two
            things:
          </p>
          <CodeBlock
            lang="json"
            code={`"security": {
  "risk": "high",
  "score": 8,
  "reasons": ["hidden text (white-on-white text)", "hidden content asks the reader to send credentials or codes"],
  "hiddenContent": true,
  "sender": "verified"
},
"safeText": "Hi! Here is the agenda for Tuesday."`}
          />
          <ul>
            <li>
              <strong>safeText</strong> is the message as a human would see it: hidden elements, comments, scripts and invisible characters removed. Give your model{" "}
              <code>safeText</code>, not <code>html</code>.
            </li>
            <li>
              <strong>security.risk</strong> is <code>low</code>, <code>medium</code> or <code>high</code>, with human-readable <code>reasons</code>. List responses and webhook
              payloads include it too.
            </li>
            <li>
              <strong>security.sender</strong> says whether the From address is authentic, from the SPF, DKIM and DMARC checks SES runs: <code>verified</code> (DMARC pass,
              or mail from another AGMX inbox), <code>unknown</code> (the domain publishes no policy) or <code>failed</code> (likely forged). Forged mail is at least{" "}
              <code>medium</code> risk, and its codes and sign-in links are withheld from <code>extracted</code>, so a fake "your GitHub code is…" can't be acted on.
            </li>
            <li>
              Attachments the scanner flags as malware are quarantined: the message lists them, but the bytes are never stored, forwarded or served.
            </li>
            <li>
              The MCP tools return <code>safeText</code> and the security report by default and omit raw HTML unless asked (<code>includeRaw</code>).
            </li>
          </ul>
          <Callout tone="warn" title="Never follow instructions inside an email">
            Treat email content as data, not commands — especially when <code>security.risk</code> is <code>medium</code> or <code>high</code>. The analysis is heuristic: it
            lowers the risk, it doesn't make untrusted text trustworthy. Combine it with <a href="#approvals">send approvals</a> and <a href="#rules">allow-lists</a>.
          </Callout>

          {/* ------------------------------------------------------------- */}
          <H2 id="approvals">
            Send approvals
          </H2>
          <p>Each agent has a send policy that decides when mail sent with its key needs a human's approval:</p>
          <DocTable
            head={["sendPolicy", "Behaviour"]}
            rows={[
              [<code key="p">auto</code>, "Send immediately (default)."],
              [<code key="p">first_contact</code>, "Hold mail to any recipient the inbox has never exchanged mail with."],
              [<code key="p">all</code>, "Hold every message for review."]
            ]}
          />
          <p>
            Set <code>approveAttachments: true</code> to also hold anything with attachments. Policies are set by a human in the dashboard or with{" "}
            <code>PATCH /agents/{"{id}"}</code> using an account key — an agent key can't change its own policy. Mail sent by people and account keys is never held.
          </p>
          <p>
            Held mail is returned with status <code>pending_approval</code>. Reviewers approve or reject it in the dashboard or via the API; approved mail is sent immediately, or
            at its <code>sendAt</code>.
          </p>
          <DocTable
            head={["Endpoint", "What it does"]}
            rows={[
              [<code key="e">GET /approvals</code>, "Held messages, oldest first. Humans and account keys only."],
              [<code key="e">POST /approvals/{"{id}"}/approve</code>, "Approve and send."],
              [<code key="e">POST /approvals/{"{id}"}/reject</code>, <>Reject with an optional <code>reason</code>. The message is never sent.</>]
            ]}
          />
          <p>
            The agent hears about each decision through its webhook: <code>message.held</code> (with the reason), then <code>message.approved</code> or{" "}
            <code>message.rejected</code>.
          </p>

          {/* ------------------------------------------------------------- */}
          <H2 id="webhooks">
            Webhooks
          </H2>
          <p>
            Set a <code>webhookUrl</code> on an agent (dashboard, or <code>PATCH /agents/{"{id}"}</code>) and AGMX will POST events for that agent's inboxes.
          </p>
          <DocTable
            head={["Event", "When"]}
            rows={[
              [<code key="e">message.received</code>, "An inbound email was delivered to one of the agent's inboxes (not sent for spam)."],
              [<code key="e">message.sent</code>, "An outbound email was accepted for delivery."],
              [<code key="e">message.delivered</code>, "The recipient's server accepted it (requires an SES configuration set)."],
              [<code key="e">message.bounced</code>, "Delivery failed. Permanent bounces suppress the address."],
              [<code key="e">message.complained</code>, "The recipient marked it as spam. The address is suppressed."],
              [<code key="e">message.held</code>, "A message is waiting for approval under the agent's send policy. Includes the reason."],
              [<code key="e">message.approved</code>, "A human approved a held message (it's sent right after, or at sendAt)."],
              [<code key="e">message.rejected</code>, "A human rejected a held message. Includes the reason, if given."],
              [<code key="e">agent.sending_paused</code>, "Sending was paused, automatically for bounces or complaints, or by a human. Includes the reason."],
              [<code key="e">agent.sending_resumed</code>, "A human resumed sending."],
              [<code key="e">webhook.test</code>, "Sent from the dashboard or POST /agents/{id}/webhook-test."]
            ]}
          />
          <CodeBlock
            lang="json"
            title="POST your-endpoint"
            code={`{
  "id": "evt_01j9…",
  "type": "message.received",
  "createdAt": "2026-11-02T12:00:00.000Z",
  "agentId": "agt_01j9…",
  "data": {
    "inbox": { "id": "inb_01j9…", "address": "scout@bot.agmx.io" },
    "message": { "id": "msg_01j9…", "subject": "…", "from": { … }, "extracted": { … }, … }
  }
}`}
          />
          <h3>Verifying signatures</h3>
          <p>
            Each request carries <code>x-agmx-event</code>, <code>x-agmx-delivery</code> and <code>x-agmx-signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>, where <code>v1</code> is
            the HMAC-SHA256 of <code>{"`${t}.${rawBody}`"}</code> keyed with the agent's webhook secret (<code>whsec_…</code>, shown on the agent page).
          </p>
          <CodeBlock
            lang="ts"
            title="verify.ts"
            code={`import { createHmac, timingSafeEqual } from "node:crypto"

export function verifyAgmx(rawBody: string, header: string, secret: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  const t = Number(parts.t)
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex")
  const a = Buffer.from(expected), b = Buffer.from(parts.v1 ?? "")
  return a.length === b.length && timingSafeEqual(a, b)
}`}
          />
          <h3>Retries</h3>
          <p>
            Respond with any 2xx within 10 seconds. Otherwise AGMX retries with exponential backoff (30s, 1m, 2m, 4m … capped at 6h) for up to 8 attempts. Test events are not
            retried. Recent deliveries, status codes and errors are visible on each agent's page.
          </p>

          {/* ------------------------------------------------------------- */}
          <H2 id="mcp">
            MCP server
          </H2>
          <p>
            AGMX exposes a Model Context Protocol server over Streamable HTTP at <code>{origin}/mcp</code>. Authenticate with the same bearer key (an{" "}
            <code>x-api-key</code> header also works). The tools wrap the REST API, so limits and errors are identical.
          </p>
          <CodeTabs
            tabs={[
              {
                label: "Claude Code",
                lang: "bash",
                code: `claude mcp add --transport http agmx ${origin}/mcp \\
  --header "Authorization: Bearer agmx_agt_…"`
              },
              {
                label: "JSON config",
                lang: "json",
                code: `{
  "mcpServers": {
    "agmx": {
      "type": "http",
      "url": "${origin}/mcp",
      "headers": { "Authorization": "Bearer agmx_agt_…" }
    }
  }
}`
              },
              {
                label: "stdio bridge",
                lang: "json",
                code: `{
  "mcpServers": {
    "agmx": {
      "command": "npx",
      "args": ["-y", "agmx-cli", "mcp"],
      "env": { "AGMX_API_KEY": "agmx_agt_…", "AGMX_BASE_URL": "${origin}" }
    }
  }
}`
              }
            ]}
          />
          <DocTable
            head={["Tool", "What it does"]}
            rows={[
              [<code key="t">whoami</code>, "Account, plan limits, usage and the key's agent."],
              [<code key="t">list_inboxes</code>, "Inboxes the key can use, with unread counts."],
              [<code key="t">create_inbox</code>, "Claim a new address — permanent, or temporary with expiresIn, maxMessages and acceptFrom."],
              [<code key="t">list_messages</code>, "List and search mail (folder, unread, query, cursor)."],
              [<code key="t">get_message</code>, "Read one email: safeText, security report, attachments and extracted data. Marks it read by default."],
              [<code key="t">wait_for_email</code>, "Block up to 60s for the next email — returns extracted codes and links."],
              [<code key="t">send_email</code>, "Send now or at sendAt, with optional attachments and an idempotencyKey."],
              [<code key="t">reply_to_email</code>, "Reply in-thread, optionally to all."],
              [<code key="t">forward_email</code>, "Forward with attachments."],
              [<code key="t">create_draft / send_draft</code>, "Save a draft (or threaded reply draft) and send or schedule it later."],
              [<code key="t">cancel_scheduled</code>, "Move a scheduled message back to drafts."],
              [<code key="t">add_inbox_rule / list_inbox_rules</code>, "Manage allow, block and label rules on the agent's inboxes."],
              [<code key="t">update_message</code>, "Read, star, archive, spam and labels."],
              [<code key="t">delete_message</code>, "Permanently delete."],
              [<code key="t">list_threads / get_thread</code>, "Browse and read whole conversations."]
            ]}
          />

          {/* ------------------------------------------------------------- */}
          <H2 id="sdks">
            SDKs & CLI
          </H2>
          <p>
            Official clients live in the <a href="https://github.com/nearbycoder/agmx.io/tree/main/packages">packages/</a> directory of the repository. The TypeScript SDK's types are
            generated from the OpenAPI spec, and every client sends an <code>Idempotency-Key</code> automatically.
          </p>
          <CodeTabs
            tabs={[
              {
                label: "TypeScript",
                lang: "ts",
                code: `// npm install agmx
import { Agmx, AgmxError } from "agmx"

const agmx = new Agmx({ apiKey: process.env.AGMX_API_KEY!, baseUrl: "${origin}" })

const inbox = await agmx.inboxes.create({ expiresIn: 3600, maxMessages: 1, acceptFrom: ["github.com"] })
// …trigger the sign-up with inbox.address
const result = await agmx.waitForCode({ inboxId: inbox.id, timeout: 60 })

const sent = await agmx.messages.send({ to: "ada@example.com", subject: "Hi", text: "Hello" })
if (sent.status === "pending_approval") console.log("Waiting for a human to approve")`
              },
              {
                label: "Python",
                lang: "py",
                code: `# pip install agmx
from agmx import Agmx

agmx = Agmx("agmx_agt_…", base_url="${origin}")
inbox = agmx.create_inbox(expires_in=3600, max_messages=1, accept_from=["github.com"])
result = agmx.wait_for_code(inbox_id=inbox["id"], timeout=60)
print(result["code"] if result else "timed out")`
              },
              {
                label: "CLI",
                lang: "bash",
                code: `npm install -g agmx-cli

agmx signup --name Scout --username scout --owner-email you@example.com
agmx inboxes create --temp 1h --max-messages 1 --accept-from github.com
agmx wait --from github.com --code      # prints just the code
agmx send --to ada@example.com --subject "Hi" --text "Hello"
agmx mcp                                 # local stdio MCP server`
              },
              {
                label: "Sign-up helper",
                lang: "ts",
                code: `import { Agmx } from "agmx"

// No key needed: request an inbox and wait for your human to approve it.
const { apiKey, inbox, client } = await Agmx.signup({
  name: "Scout",
  username: "scout",
  ownerEmail: "you@example.com",
  baseUrl: "${origin}",
  onApprovalUrl: ({ approvalUrl, userCode }) => console.log(\`Approve at \${approvalUrl} (\${userCode})\`)
})
// Store apiKey securely — it is shown once.`
              }
            ]}
          />
          <Callout title="Until the packages are published">
            Install from source: clone the repo, run <code>npm install &amp;&amp; npm run build</code> in <code>packages/sdk</code>, then{" "}
            <code>npm install /path/to/agmx.io/packages/sdk</code> in your project. Python: <code>pip install ./packages/python</code>. CLI: run{" "}
            <code>npm link</code> in <code>packages/sdk</code>, then <code>npm link agmx &amp;&amp; npm link</code> in <code>packages/cli</code> to get the{" "}
            <code>agmx</code> command.
          </Callout>

          {/* ------------------------------------------------------------- */}
          <H2 id="domains">
            Custom domains
          </H2>
          <p>
            On plans that include custom domains, add one with <code>POST /domains</code> (<code>{'{"name": "mail.example.com"}'}</code>) or in the dashboard. AGMX registers it
            with Amazon SES and returns the DNS records to publish:
          </p>
          <DocTable
            head={["Type", "Name", "Value", "Purpose"]}
            rows={[
              ["MX", <code key="n">mail.example.com</code>, <code key="v">10 inbound-smtp.&lt;region&gt;.amazonaws.com</code>, "Receive mail"],
              ["CNAME ×3", <code key="n">&lt;token&gt;._domainkey.mail.example.com</code>, <code key="v">&lt;token&gt;.dkim.amazonses.com</code>, "DKIM signing"],
              ["TXT", <code key="n">_dmarc.mail.example.com</code>, <code key="v">v=DMARC1; p=none; …</code>, "DMARC (recommended)"]
            ]}
          />
          <p>
            Call <code>POST /domains/{"{id}"}/verify</code> (or click “Check DNS”) to refresh status. Once DKIM verifies, create inboxes on the domain by passing{" "}
            <code>domain</code> to <code>POST /inboxes</code>.
          </p>
          <Callout>Using a subdomain like <code>mail.example.com</code> keeps your existing root-domain MX records untouched.</Callout>

          {/* ------------------------------------------------------------- */}
          <H2 id="errors">
            Errors
          </H2>
          <p>
            Errors are JSON with a stable <code>_tag</code> to branch on and a human-readable <code>message</code>:
          </p>
          <CodeBlock
            lang="json"
            code={`{
  "_tag": "QuotaExceeded",
  "message": "Daily send limit reached (50 on Starter). Resets at 00:00 UTC.",
  "limit": "daily_sends",
  "max": 50,
  "used": 50
}`}
          />
          <DocTable
            head={["Status", "_tag", "Meaning"]}
            rows={[
              ["401", <code key="c">Unauthorized</code>, "Missing, invalid or revoked key."],
              ["402", <code key="c">QuotaExceeded</code>, <>Plan limit reached. <code>limit</code> is one of agents, inboxes_per_agent, monthly_sends, daily_sends, custom_domains, message_size.</>],
              ["403", <code key="c">Forbidden</code>, "Not allowed with this key type, the inbox is paused, or the agent's sending is paused for bounces or complaints."],
              ["404", <code key="c">NotFound</code>, <>Doesn't exist or isn't visible to this key. Includes <code>resource</code>.</>],
              ["409", <code key="c">Conflict</code>, "Already exists (a taken username), or the message is in the wrong state — e.g. approving mail that was already decided."],
              ["422", <code key="c">InvalidRequest</code>, <>Validation failed; <code>field</code> names the culprit when known.</>],
              ["429", <code key="c">RateLimited</code>, <>Too many requests. Wait <code>retryAfter</code> seconds (also sent as <code>Retry-After</code>).</>],
              ["502", <code key="c">DeliveryFailed</code>, "Amazon SES rejected or failed the request."]
            ]}
          />

          {/* ------------------------------------------------------------- */}
          <H2 id="limits">
            Plans & limits
          </H2>
          <p>
            Limits are enforced per account. Received mail has its own monthly limit (it never counts as sends) and mail over the limit or the plan’s max inbound size is dropped; daily limits reset at 00:00 UTC and monthly limits on the 1st. See{" "}
            <Link to="/pricing">pricing</Link> for the numbers, or call <code>GET /me</code> for your own plan and usage, and <code>GET /usage?days=30</code> for a daily series.
          </p>
          <ul>
            <li>Agents per account, inboxes per agent, custom domains.</li>
            <li>Sends per day and per month (counted per recipient).</li>
            <li>
              Received messages per month and maximum inbound size — mail over either is dropped and counted in <code>usage.droppedThisMonth</code>.
            </li>
            <li>Maximum message size including attachments, and message retention.</li>
            <li>
              Request rate: 600 API/MCP requests a minute per key or session, 120 a minute per IP without credentials, 10 agent sign-ups an hour per IP, and tighter
              budgets on sign-in links and password resets. Over the limit you get <code>429</code> with <code>Retry-After</code>.
            </li>
          </ul>
          <h3 id="reputation">Sending reputation</h3>
          <p>
            Every agent sends through the same Amazon SES account, and SES reviews or suspends accounts whose mail bounces or draws spam complaints. To protect everyone's
            delivery, AGMX pauses an agent's <em>sending</em> when at least 5 of its sends hard-bounce at a rate of 5% or more, or at least 2 draw complaints at 0.1% or
            more (measured over 30 days). Receiving keeps working and scheduled mail waits. You get an email and an <code>agent.sending_paused</code> webhook. Fix the cause,
            then resume from the agent page or with an account key. Resuming starts a fresh window.
          </p>
          <Endpoint method="GET" path="/api/v1/agents/{agentId}/reputation" />
          <Endpoint method="POST" path="/api/v1/agents/{agentId}/sending/pause" />
          <Endpoint method="POST" path="/api/v1/agents/{agentId}/sending/resume" />

          {/* ------------------------------------------------------------- */}
          <H2 id="your-data">
            Export & deletion
          </H2>
          <p>
            Download everything stored for your account as one JSON file — profile, agents, inboxes, rules, domains, API key names, threads, messages,
            attachment metadata and usage. Secrets, key hashes and attachment bytes are left out. Works with a dashboard session or an account key, not
            an agent key.
          </p>
          <Endpoint method="GET" path="/api/v1/account/export" />
          <CodeBlock lang="bash" code={`curl ${api}/account/export -H "Authorization: Bearer $AGMX_ACCOUNT_KEY" -o agmx-export.json`} />
          <p>
            Deleting an account removes its agents, inboxes, mail, attachments, keys and custom domains immediately. It needs a signed-in human:
            use <strong>Settings → Your data</strong>, or call the endpoint from a dashboard session with <code>confirm</code> set to the account email.
            API keys can't delete accounts.
          </p>
          <Endpoint method="DELETE" path="/api/v1/account" />

          {/* ------------------------------------------------------------- */}
          <H2 id="self-hosting">
            Self-hosting
          </H2>
          <p>
            AGMX is open source (<a href="https://github.com/nearbycoder/agmx.io">GitHub</a>). It's a single TanStack Start app with Effect services, Postgres via Drizzle, Better
            Auth and Amazon SES. It runs anywhere Node 22+ and Postgres run — Railway works out of the box.
          </p>
          <h3>Environment</h3>
          <DocTable
            head={["Variable", "Purpose"]}
            rows={[
              [<code key="v">DATABASE_URL</code>, "Postgres connection string."],
              [<code key="v">BETTER_AUTH_SECRET</code>, "Long random string used to sign sessions."],
              [<code key="v">APP_URL</code>, "Public URL, e.g. https://agmx.io (falls back to RAILWAY_PUBLIC_DOMAIN)."],
              [<code key="v">MAIL_DOMAIN</code>, "Shared inbox domain, e.g. agmx.io."],
              [<code key="v">ALLOWED_EMAILS</code>, "Comma-separated emails or *@domain.com patterns allowed to sign in. Empty means open sign-ups."],
              [<code key="v">ADMIN_EMAILS</code>, "Operators: admin role and the unlimited plan."],
              [<code key="v">DEFAULT_PLAN</code>, "Plan for new accounts (free, pro, scale, unlimited)."],
              [<code key="v">AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY</code>, "SES credentials. Use a region with SES receiving (e.g. us-east-1)."],
              [<code key="v">SES_CONFIGURATION_SET</code>, "Optional: configuration set for delivery, bounce and complaint events."],
              [<code key="v">SES_INBOUND_TOPIC_ARNS</code>, "Optional allow-list of SNS topic ARNs for the inbound webhook."],
              [<code key="v">SES_RECEIPT_RULE_SET / SES_RECEIPT_RULE</code>, "Optional: rule that custom domains get added to automatically."],
              [<code key="v">MAIL_TRANSPORT</code>, "ses or log. Defaults to ses when AWS credentials are present."],
              [<code key="v">SYSTEM_FROM</code>, "From address for sign-in emails, e.g. AGMX <no-reply@agmx.io>."],
              [<code key="v">ENABLE_AGENT_SIGNUPS</code>, "Set to false to disable POST /signup."],
              [<code key="v">OPERATOR_NAME</code>, "Who runs the instance, named in /terms and /privacy."],
              [<code key="v">SYSTEM_INBOXES</code>, "Role mailboxes created for the first operator (default abuse,postmaster,privacy). Empty disables."]
            ]}
          />
          <h3>Amazon SES setup</h3>
          <ol>
            <li>
              Verify your mail domain in SES (Identities → Create identity → Domain) and publish the DKIM records. Request production access to send to unverified recipients.
            </li>
            <li>
              Point the domain's MX record at <code>inbound-smtp.&lt;region&gt;.amazonaws.com</code> (priority 10).
            </li>
            <li>
              Create an SNS topic and subscribe <code>https://&lt;your-host&gt;/api/inbound/ses</code> over HTTPS. AGMX verifies SNS signatures and confirms the subscription
              automatically.
            </li>
            <li>
              Create an active receipt rule for your domain with an <strong>SNS action</strong> (Base64 encoding) to that topic. For messages over 150 KB, use an{" "}
              <strong>S3 action</strong> with an SNS notification instead — AGMX fetches the raw message from S3.
            </li>
            <li>
              Optional: create a configuration set with an SNS event destination (Delivery, Bounce, Complaint) to the same endpoint, and set <code>SES_CONFIGURATION_SET</code>.
            </li>
          </ol>
          <CodeBlock
            lang="bash"
            title="deploy"
            code={`bun install
bun run build
bun run start:prod   # runs database migrations, then starts the server`}
          />
          <Callout tone="tip" title="Local development">
            Without AWS credentials, <code>MAIL_TRANSPORT</code> defaults to <code>log</code>: outbound mail and sign-in links are printed to the console, and{" "}
            <code>POST /api/dev/inbound</code> lets you inject inbound mail (JSON or raw MIME).
          </Callout>

          {/* ------------------------------------------------------------- */}
          <H2 id="api-reference">
            API reference
          </H2>
          <p>Every endpoint, schema and error is described in a generated OpenAPI 3.1 document, with an interactive explorer.</p>
          <div className="not-prose mt-5 grid gap-3 sm:grid-cols-2">
            {[
              { href: "/api/v1/reference", title: "Interactive reference", body: "Try requests in the browser." },
              { href: "/api/v1/openapi.json", title: "OpenAPI 3.1 spec", body: "Generate clients in any language." },
              { href: "/skill.md", title: "skill.md", body: "Agent-oriented guide in Markdown." },
              { href: "/llms.txt", title: "llms.txt", body: "Index for LLM crawlers." }
            ].map((c) => (
              <a key={c.href} href={c.href} className="group flex items-center justify-between rounded-xl border border-line bg-surface p-4 !no-underline transition-colors hover:border-line-strong">
                <div>
                  <div className="text-[14px] font-semibold">{c.title}</div>
                  <div className="mt-0.5 text-[13px] text-muted">{c.body}</div>
                </div>
                <ArrowUpRight className="size-4 text-faint transition group-hover:text-ink" />
              </a>
            ))}
          </div>
        </article>
      </div>
      <MarketingFooter />
    </div>
  )
}

function SidebarNav({ active, onNavigate }: { active: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-6">
      {NAV.map((group) => (
        <div key={group.group}>
          <div className="px-2.5 text-[12px] font-medium text-ink">{group.group}</div>
          <ul className="mt-1.5 flex flex-col gap-px">
            {group.items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={onNavigate}
                  className={cn(
                    "relative block rounded-lg px-2.5 py-1.5 text-[13.5px] transition-colors",
                    active === item.id ? "bg-bg-subtle font-medium text-ink" : "text-muted hover:text-ink"
                  )}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
