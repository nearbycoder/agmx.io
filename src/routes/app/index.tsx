import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, ArrowUpRight, Bot, Check, Inbox, Mailbox, Paperclip, Plus, Send, Sparkles } from "lucide-react"
import { useState } from "react"
import { Page, PageHeader } from "~/components/app/page"
import { AgentAvatar, SenderAvatar } from "~/components/brand"
import { origin } from "~/components/dashboard/common"
import { CreateAgentDialog } from "~/components/dashboard/create-agent-dialog"
import { SignupCallout } from "~/components/dashboard/signup-callout"
import { StatCard } from "~/components/dashboard/stat-card"
import { UsageChart } from "~/components/dashboard/usage-chart"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardHeader } from "~/components/ui/card"
import { CodeTabs } from "~/components/ui/code"
import { CopyButton, EmptyState, Skeleton } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { useAgents, useMe, useUsage } from "~/lib/queries"
import { cn, mailTime } from "~/lib/utils"
import { formatLimit } from "~/shared/plans"

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Overview — AGMX" }] }),
  component: OverviewPage
})

const greeting = () => {
  const h = new Date().getHours()
  return h < 5 ? "Working late" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}

function OverviewPage() {
  const { user } = Route.useRouteContext()
  const { data: me, isLoading: meLoading } = useMe()
  const { data: agents, isLoading: agentsLoading } = useAgents()
  const { data: usage } = useUsage(30)
  const [createOpen, setCreateOpen] = useState(false)
  const recent = useQuery({
    queryKey: ["messages", { overview: true }],
    queryFn: () => api((c) => c.messages.list({ query: { limit: 8 } }))
  })
  const firstName = (user.name || user.email).split(/[\s@]/)[0]
  const noAgents = agents !== undefined && agents.length === 0

  return (
    <Page>
      <PageHeader
        eyebrow={new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        title={`${greeting()}, ${firstName}`}
        description={
          me ? (
            <>
              {me.usage.inboxes} inbox{me.usage.inboxes === 1 ? "" : "es"} across {me.usage.agents} agent{me.usage.agents === 1 ? "" : "s"} on the{" "}
              <span className="font-medium text-ink">{me.plan.name}</span> plan.
            </>
          ) : (
            "Your agents' mail at a glance."
          )
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

      <div className="flex flex-col gap-6">
        <SignupCallout />

        {noAgents ? <GettingStarted onCreate={() => setCreateOpen(true)} /> : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Agents"
            icon={<Bot />}
            loading={meLoading}
            value={me?.usage.agents ?? 0}
            hint={me ? (me.plan.maxAgents === null ? "Unlimited on your plan" : `of ${me.plan.maxAgents} on ${me.plan.name}`) : undefined}
            used={me?.usage.agents}
            max={me?.plan.maxAgents}
          />
          <StatCard
            label="Sent this month"
            icon={<Send />}
            loading={meLoading}
            value={(me?.usage.sentThisMonth ?? 0).toLocaleString()}
            used={me?.usage.sentThisMonth}
            max={me?.plan.monthlySends}
            hint={me ? `${me.usage.sentToday.toLocaleString()} today · limit ${formatLimit(me.plan.monthlySends)}` : undefined}
          />
          <StatCard
            label="Received this month"
            icon={<Inbox />}
            loading={meLoading}
            value={(me?.usage.receivedThisMonth ?? 0).toLocaleString()}
            hint="Receiving is unlimited"
          />
          <StatCard
            label="Stored messages"
            icon={<Mailbox />}
            loading={meLoading}
            value={(me?.usage.messagesStored ?? 0).toLocaleString()}
            hint={me ? (me.plan.retentionDays === null ? "Kept forever" : `Kept for ${me.plan.retentionDays} days`) : undefined}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title="Activity" description="Daily mail volume across all inboxes (UTC)." />
            <div className="p-5">{usage ? <UsageChart days={usage.days} /> : <Skeleton className="h-[230px] w-full" />}</div>
          </Card>

          <Card className="flex flex-col">
            <CardHeader
              title="Agents"
              action={
                <Link to="/app/agents" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
                  View all <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <div className="flex-1 divide-y divide-line">
              {agentsLoading
                ? Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                      <Skeleton className="size-8 rounded-[28%]" />
                      <Skeleton className="h-4 flex-1" />
                    </div>
                  ))
                : agents?.slice(0, 6).map((agent) => {
                    const unread = agent.inboxes.reduce((s, i) => s + i.unreadCount, 0)
                    return (
                      <Link
                        key={agent.id}
                        to="/app/agents/$agentId"
                        params={{ agentId: agent.id }}
                        className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2"
                      >
                        <AgentAvatar name={agent.name} color={agent.color} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13.5px] font-medium">{agent.name}</span>
                            {agent.status === "paused" ? <Badge tone="warn">paused</Badge> : null}
                          </div>
                          <div className="truncate font-mono text-[12px] text-muted">{agent.inboxes[0]?.address ?? "no inbox yet"}</div>
                        </div>
                        {unread ? (
                          <span className="rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-fg tabular-nums">{unread}</span>
                        ) : null}
                      </Link>
                    )
                  })}
              {noAgents ? <p className="px-5 py-8 text-center text-[13px] text-muted">No agents yet.</p> : null}
            </div>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader
              title="Recent mail"
              action={
                <Link to="/app/mail" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
                  Open mail <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            {recent.isLoading ? (
              <div className="divide-y divide-line">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 px-5 py-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recent.data?.messages.length ? (
              <div className="divide-y divide-line">
                {recent.data.messages.map((m) => {
                  const counterpart = m.direction === "inbound" ? m.from : m.to[0] ?? m.from
                  return (
                    <Link
                      key={m.id}
                      to="/app/mail"
                      search={{ t: m.threadId, inbox: m.inboxId }}
                      className="group flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2"
                    >
                      <SenderAvatar name={counterpart.name} address={counterpart.address} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {m.direction === "outbound" ? <Send className="size-3 shrink-0 text-faint" /> : null}
                          <span className={cn("truncate text-[13.5px]", !m.isRead && m.direction === "inbound" ? "font-semibold" : "font-medium text-ink-2")}>
                            {m.direction === "outbound" ? `To ${counterpart.name || counterpart.address}` : counterpart.name || counterpart.address}
                          </span>
                          {m.extracted.codes[0] ? (
                            <span className="rounded-md bg-accent-soft px-1.5 font-mono text-[11px] font-semibold text-accent-ink">{m.extracted.codes[0]}</span>
                          ) : null}
                          {m.attachmentCount ? <Paperclip className="size-3 shrink-0 text-faint" /> : null}
                        </div>
                        <div className="truncate text-[12.5px] text-muted">
                          <span className="text-ink-2">{m.subject || "(no subject)"}</span> — {m.snippet}
                        </div>
                      </div>
                      <span className="shrink-0 text-[12px] text-faint tabular-nums">{mailTime(m.createdAt)}</span>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <EmptyState icon={<Inbox />} title="No mail yet" description="Messages your agents send and receive show up here in real time." />
            )}
          </Card>

          <QuickConnect />
        </div>
      </div>

      <CreateAgentDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Page>
  )
}

function QuickConnect() {
  const prompt = `Read ${origin()}/skill.md and follow it to set up your own email inbox.`
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader title="Connect an agent" description="Point any agent at AGMX — it can sign itself up." />
      <div className="flex flex-col gap-4 p-5">
        <div className="rounded-xl border border-accent/40 bg-accent-soft/60 p-3.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-accent-ink">
              <Sparkles className="size-3.5" /> Paste into your agent
            </span>
            <CopyButton value={prompt} label="Prompt copied" />
          </div>
          <p className="text-[13px] leading-relaxed text-ink">{prompt}</p>
        </div>
        <div className="flex items-center gap-1 rounded-[10px] border border-line bg-surface-2 py-1 pr-1 pl-3">
          <span className="text-[12px] text-muted">MCP</span>
          <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{origin()}/mcp</code>
          <CopyButton value={`${origin()}/mcp`} label="MCP URL copied" />
        </div>
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
        <Link to="/docs" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:underline">
          Read the docs <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </Card>
  )
}

function GettingStarted({ onCreate }: { onCreate: () => void }) {
  const steps = [
    { title: "Create your first agent", body: "Give it a name and an address like scout@bot.agmx.io.", done: false, action: <Button size="sm" onClick={onCreate}><Plus /> Create agent</Button> },
    { title: "Connect it", body: "Use the API key with MCP, the REST API or the CLI.", done: false },
    { title: "Receive a verification email", body: "Codes and magic links are extracted automatically.", done: false }
  ]
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="absolute -top-28 -right-20 size-72 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative">
        <Badge tone="accent">Getting started</Badge>
        <h2 className="mt-3 text-xl font-semibold tracking-tight">Give your first agent an inbox</h2>
        <p className="mt-1 text-sm text-muted">Three steps and your agent can sign up for anything that needs an email address.</p>
        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-4">
              <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px] font-semibold", s.done ? "bg-ok text-white" : "bg-ink text-bg")}>
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="text-[14px] font-medium">{s.title}</span>
              <span className="text-[12.5px] leading-relaxed text-muted">{s.body}</span>
              {s.action ? <div className="mt-1">{s.action}</div> : null}
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
