import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Bot, Plus, Search, Webhook } from "lucide-react"
import { useMemo, useState } from "react"
import { Page, PageHeader } from "~/components/app/page"
import { AgentAvatar } from "~/components/brand"
import { CreateAgentDialog } from "~/components/dashboard/create-agent-dialog"
import { SignupCallout } from "~/components/dashboard/signup-callout"
import { Badge, StatusDot } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Input } from "~/components/ui/input"
import { Tooltip } from "~/components/ui/menu"
import { CopyButton, EmptyState, Skeleton } from "~/components/ui/misc"
import { useAgents, useMe } from "~/lib/queries"
import type { AgentT } from "~/shared/api/domain"
import { cn, relativeTime } from "~/lib/utils"

export const Route = createFileRoute("/app/agents/")({
  validateSearch: (search: Record<string, unknown>): { new?: boolean } => ({ new: search.new === true || search.new === "true" ? true : undefined }),
  head: () => ({ meta: [{ title: "Agents — AGMX" }] }),
  component: AgentsPage
})

type Filter = "all" | "active" | "paused"

function AgentsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: "/app/agents/" })
  const { data: agents, isLoading } = useAgents()
  const { data: me } = useMe()
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const open = Boolean(search.new)
  const setOpen = (value: boolean) => void navigate({ search: value ? { new: true } : {}, replace: true })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (agents ?? []).filter(
      (a) =>
        (filter === "all" || a.status === filter) &&
        (!q || a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q) || a.inboxes.some((i) => i.address.includes(q)))
    )
  }, [agents, query, filter])

  const atLimit = me && me.plan.maxAgents !== null && me.usage.agents >= me.plan.maxAgents

  return (
    <Page>
      <PageHeader
        title="Agents"
        description="Each agent owns its inboxes, API keys and webhook. Give one to every bot, workflow or teammate-in-silicon."
        actions={
          <Tooltip content={atLimit ? `Your ${me?.plan.name} plan allows ${me?.plan.maxAgents} agents` : "Create agent"}>
            <span>
              <Button onClick={() => setOpen(true)}>
                <Plus /> New agent
              </Button>
            </span>
          </Tooltip>
        }
      />

      <div className="flex flex-col gap-6">
        <SignupCallout />

        {agents && agents.length > 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <Input placeholder="Search agents or addresses" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search agents" />
            </div>
            <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-bg-subtle p-1">
              {(["all", "active", "paused"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-lg px-3 py-1 text-[13px] font-medium capitalize transition",
                    filter === f ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
                  )}
                >
                  {f}
                  <span className="ml-1.5 text-[11px] text-faint tabular-nums">
                    {f === "all" ? agents.length : agents.filter((a) => a.status === f).length}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : agents?.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50">
            <EmptyState
              icon={<Bot />}
              title="No agents yet"
              description="Create an agent to claim an address like scout@bot.agmx.io — or let your agent sign itself up via the API and approve it here."
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus /> Create your first agent
                </Button>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={<Search />} title="No matches" description="Try a different search or filter." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((agent, i) => (
              <AgentCard key={agent.id} agent={agent} index={i} />
            ))}
            <button
              onClick={() => setOpen(true)}
              className="group flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong text-muted transition hover:border-ink/30 hover:bg-surface hover:text-ink"
            >
              <span className="flex size-10 items-center justify-center rounded-xl border border-line bg-surface shadow-card transition group-hover:scale-105">
                <Plus className="size-5" />
              </span>
              <span className="text-[13px] font-medium">New agent</span>
            </button>
          </div>
        )}
      </div>

      <CreateAgentDialog open={open} onOpenChange={setOpen} />
    </Page>
  )
}

function AgentCard({ agent, index }: { agent: AgentT; index: number }) {
  const unread = agent.inboxes.reduce((s, i) => s + i.unreadCount, 0)
  const messages = agent.inboxes.reduce((s, i) => s + i.messageCount, 0)
  const last = agent.inboxes.map((i) => i.lastMessageAt).filter(Boolean).sort().at(-1) ?? null
  return (
    <Link
      to="/app/agents/$agentId"
      params={{ agentId: agent.id }}
      className="group relative flex animate-rise flex-col rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      <div className="flex items-start gap-3">
        <AgentAvatar name={agent.name} color={agent.color} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold tracking-tight">{agent.name}</h3>
            {unread ? <span className="rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-fg tabular-nums">{unread}</span> : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
            <StatusDot tone={agent.status === "active" ? "ok" : "warn"} />
            <span className="capitalize">{agent.status}</span>
            <span className="text-faint">·</span>
            <span>{last ? `active ${relativeTime(last)}` : "no mail yet"}</span>
          </div>
        </div>
        {agent.webhookUrl ? (
          <Tooltip content="Webhook configured">
            <span className="flex size-7 items-center justify-center rounded-lg bg-bg-subtle text-muted">
              <Webhook className="size-3.5" />
            </span>
          </Tooltip>
        ) : null}
      </div>
      <p className="mt-3 line-clamp-2 min-h-[2.6em] text-[13px] leading-relaxed text-muted">{agent.description || "No description."}</p>
      <div className="mt-4 flex flex-col gap-1.5">
        {agent.inboxes.slice(0, 3).map((inbox) => (
          <div key={inbox.id} className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 py-1 pr-1 pl-2.5" onClick={(e) => e.preventDefault()}>
            <span className={cn("size-1.5 shrink-0 rounded-full", inbox.status === "active" ? "bg-ok" : "bg-warn")} />
            <code className="min-w-0 flex-1 truncate font-mono text-[12px]">{inbox.address}</code>
            {inbox.unreadCount ? <span className="text-[11px] font-semibold tabular-nums">{inbox.unreadCount}</span> : null}
            <CopyButton value={inbox.address} size="xs" label="Address copied" />
          </div>
        ))}
        {agent.inboxes.length > 3 ? <span className="pl-1 text-[12px] text-muted">+{agent.inboxes.length - 3} more</span> : null}
        {agent.inboxes.length === 0 ? <Badge tone="warn" className="w-fit">No inbox yet</Badge> : null}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12px] text-muted">
        <span className="tabular-nums">
          {agent.inboxes.length} inbox{agent.inboxes.length === 1 ? "" : "es"} · {messages.toLocaleString()} message{messages === 1 ? "" : "s"}
        </span>
        <span className="font-mono text-[11px] text-faint">{agent.id.slice(0, 12)}…</span>
      </div>
    </Link>
  )
}
