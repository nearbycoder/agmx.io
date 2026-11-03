import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Inbox, Paperclip, Plus, Send } from "lucide-react"
import { useState } from "react"
import { Page, PageHeader } from "~/components/app/page"
import { AgentAvatar, SenderAvatar } from "~/components/brand"
import { CopyField, origin, SectionLink } from "~/components/dashboard/common"
import { CreateAgentDialog } from "~/components/dashboard/create-agent-dialog"
import { Panel, PanelEmpty, Section } from "~/components/dashboard/section"
import { SignupCallout } from "~/components/dashboard/signup-callout"
import { StatStrip } from "~/components/dashboard/stat-card"
import { UsageChart } from "~/components/dashboard/usage-chart"
import { Button } from "~/components/ui/button"
import { CodeTabs } from "~/components/ui/code"
import { CopyButton, Skeleton } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { useAgents, useMe, useUsage } from "~/lib/queries"
import { cn, mailTime } from "~/lib/utils"

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Overview — AGMX" }] }),
  component: OverviewPage
})

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

const plural = (n: number, word: string, many = `${word}s`) => `${n.toLocaleString()} ${n === 1 ? word : many}`

function OverviewPage() {
  const { user } = Route.useRouteContext()
  const { data: me, isLoading: meLoading } = useMe()
  const { data: agents, isLoading: agentsLoading } = useAgents()
  const { data: usage } = useUsage(14)
  const [createOpen, setCreateOpen] = useState(false)
  const recent = useQuery({
    queryKey: ["messages", { overview: true }],
    queryFn: () => api((c) => c.messages.list({ query: { limit: 6 } }))
  })
  const firstName = (user.name || user.email).split(/[\s@]/)[0]
  const noAgents = agents !== undefined && agents.length === 0
  const plan = me?.plan

  const stats = [
    {
      label: "Agents",
      value: me?.usage.agents ?? 0,
      caption: plan ? (plan.maxAgents === null ? "No limit" : `of ${plan.maxAgents} on ${plan.name}`) : undefined,
      used: me?.usage.agents,
      max: plan?.maxAgents
    },
    {
      label: "Sent this month",
      value: (me?.usage.sentThisMonth ?? 0).toLocaleString(),
      caption: me
        ? plan?.monthlySends === null
          ? `${me.usage.sentToday.toLocaleString()} today`
          : `${me.usage.sentToday.toLocaleString()} today · of ${plan?.monthlySends?.toLocaleString()}`
        : undefined,
      used: me?.usage.sentThisMonth,
      max: plan?.monthlySends
    },
    {
      label: "Received this month",
      value: (me?.usage.receivedThisMonth ?? 0).toLocaleString(),
      caption: me
        ? me.usage.droppedThisMonth > 0
          ? `${me.usage.droppedThisMonth.toLocaleString()} dropped over limit`
          : plan?.monthlyReceives === null
            ? "No limit"
            : `of ${plan?.monthlyReceives?.toLocaleString()}`
        : undefined,
      used: me?.usage.receivedThisMonth,
      max: plan?.monthlyReceives
    },
    {
      label: "Stored messages",
      value: (me?.usage.messagesStored ?? 0).toLocaleString(),
      caption: plan ? (plan.retentionDays === null ? "Kept indefinitely" : `Kept for ${plan.retentionDays} days`) : undefined
    }
  ]

  return (
    <Page>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          me
            ? `${plural(me.usage.inboxes, "inbox", "inboxes")} across ${plural(me.usage.agents, "agent")} · ${me.plan.name} plan`
            : "Your agents' mail at a glance."
        }
        actions={
          <>
            <Link to="/app/mail">
              <Button variant="secondary">
                <Inbox /> Open mail
              </Button>
            </Link>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> New agent
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-8">
        <SignupCallout />
        {noAgents ? <GettingStarted onCreate={() => setCreateOpen(true)} /> : null}
        <StatStrip stats={stats} loading={meLoading} />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-8">
            <Section title="Activity" action={<span className="text-[12px] text-muted">Last 14 days · UTC</span>}>
              <Panel className="p-5">{usage ? <UsageChart days={usage.days} /> : <Skeleton className="h-[220px] w-full" />}</Panel>
            </Section>

            <Section title="Recent mail" action={<SectionLink to="/app/mail">Open mail <ArrowRight className="size-3.5" /></SectionLink>}>
              <Panel divided>
                {recent.isLoading ? (
                  Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                      <Skeleton className="size-8 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-1/3" />
                        <Skeleton className="h-3 w-2/3" />
                      </div>
                    </div>
                  ))
                ) : recent.data?.messages.length ? (
                  recent.data.messages.map((m) => {
                    const counterpart = m.direction === "inbound" ? m.from : (m.to[0] ?? m.from)
                    const unread = !m.isRead && m.direction === "inbound"
                    return (
                      <Link
                        key={m.id}
                        to="/app/mail"
                        search={{ t: m.threadId, inbox: m.inboxId }}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-bg-subtle/50"
                      >
                        <SenderAvatar name={counterpart.name} address={counterpart.address} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {m.direction === "outbound" ? <Send className="size-3 shrink-0 text-faint" /> : null}
                            <span className={cn("truncate text-[13.5px]", unread ? "font-semibold text-ink" : "font-medium text-ink-2")}>
                              {m.direction === "outbound" ? `To ${counterpart.name || counterpart.address}` : counterpart.name || counterpart.address}
                            </span>
                            {m.attachmentCount ? <Paperclip className="size-3 shrink-0 text-faint" /> : null}
                          </div>
                          <div className="truncate text-[13px] text-muted">
                            <span className={unread ? "text-ink-2" : undefined}>{m.subject || "(no subject)"}</span>
                            {m.snippet ? ` — ${m.snippet}` : ""}
                          </div>
                        </div>
                        {m.extracted.codes[0] ? (
                          <span className="hidden rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[12px] font-medium text-accent-ink sm:inline">{m.extracted.codes[0]}</span>
                        ) : null}
                        <span className="w-14 shrink-0 text-right text-[12px] text-muted tabular-nums">{mailTime(m.createdAt)}</span>
                      </Link>
                    )
                  })
                ) : (
                  <PanelEmpty>No mail yet. Messages your agents send and receive appear here as they happen.</PanelEmpty>
                )}
              </Panel>
            </Section>
          </div>

          <div className="flex min-w-0 flex-col gap-8">
            <Section title="Agents" action={<SectionLink to="/app/agents">View all <ArrowRight className="size-3.5" /></SectionLink>}>
              <Panel divided>
                {agentsLoading ? (
                  Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                      <Skeleton className="size-8 rounded-lg" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))
                ) : agents?.length ? (
                  agents.slice(0, 6).map((agent) => {
                    const unread = agent.inboxes.reduce((s, i) => s + i.unreadCount, 0)
                    return (
                      <Link
                        key={agent.id}
                        to="/app/agents/$agentId"
                        params={{ agentId: agent.id }}
                        className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-bg-subtle/50"
                      >
                        <AgentAvatar name={agent.name} color={agent.color} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-medium">{agent.name}</span>
                            {agent.status === "paused" ? <span className="text-[12px] text-warn">Paused</span> : null}
                          </div>
                          <div className="truncate font-mono text-[12px] text-muted">{agent.inboxes[0]?.address ?? "No inbox yet"}</div>
                        </div>
                        {unread ? (
                          <span className="flex items-center gap-1.5 text-[12px] font-medium tabular-nums">
                            <span className="size-1.5 rounded-full bg-accent ring-1 ring-black/10" />
                            {unread}
                          </span>
                        ) : null}
                      </Link>
                    )
                  })
                ) : (
                  <PanelEmpty>No agents yet.</PanelEmpty>
                )}
              </Panel>
            </Section>

            <QuickConnect />
          </div>
        </div>
      </div>

      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Page>
  )
}

function QuickConnect() {
  const prompt = `Read ${origin()}/skill.md and follow it to set up your own email inbox.`
  return (
    <Section title="Connect an agent" description="Any agent can sign itself up. You approve it here.">
      <div className="flex flex-col gap-3">
        <Panel className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-muted">Tell your agent</div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-ink">{prompt}</p>
            </div>
            <CopyButton value={prompt} label="Prompt copied" className="-mt-1 -mr-1 shrink-0" />
          </div>
        </Panel>
        <CopyField
          value={`${origin()}/mcp`}
          label="MCP URL"
          display={
            <>
              <span className="mr-2 font-sans text-muted">MCP</span>
              {origin()}/mcp
            </>
          }
        />
        <CodeTabs
          tabs={[
            {
              label: "Self sign-up",
              lang: "bash",
              code: `curl -X POST ${origin()}/api/v1/signup \\\n  -H "Content-Type: application/json" \\\n  -d '{"name":"My agent","username":"my-agent"}'`
            },
            {
              label: "Wait for mail",
              lang: "bash",
              code: `curl "${origin()}/api/v1/messages/wait?timeout=30" \\\n  -H "Authorization: Bearer $AGMX_KEY"`
            }
          ]}
        />
        <Link to="/docs" className="inline-flex items-center gap-1 text-[13px] text-muted transition-colors hover:text-ink">
          Read the docs <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </Section>
  )
}

function GettingStarted({ onCreate }: { onCreate: () => void }) {
  const steps = [
    { title: "Create an agent", body: "Give it a name and an address on the shared domain." },
    { title: "Connect it", body: "Hand it the API key, or point it at the MCP server." },
    { title: "Receive a verification email", body: "Codes and sign-in links are extracted automatically." }
  ]
  return (
    <Panel>
      <div className="flex flex-col gap-4 border-b border-line p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">Give your first agent an inbox</h2>
          <p className="mt-0.5 text-[13px] text-muted">Three steps, and your agent can sign up for anything that needs an email address.</p>
        </div>
        <Button onClick={onCreate} className="self-start sm:self-auto">
          <Plus /> Create agent
        </Button>
      </div>
      <ol className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 p-5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] font-medium text-muted tabular-nums">{i + 1}</span>
            <div>
              <div className="text-[13.5px] font-medium">{s.title}</div>
              <div className="mt-0.5 text-[13px] leading-relaxed text-muted">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
