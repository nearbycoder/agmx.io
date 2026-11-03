import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Bot, Plus, Search, Webhook } from "lucide-react"
import { useMemo, useState } from "react"
import { Page, PageHeader } from "~/components/app/page"
import { AgentAvatar } from "~/components/brand"
import { InboxStatusBadge } from "~/components/dashboard/inbox-badges"
import { CreateAgentDialog } from "~/components/dashboard/create-agent-dialog"
import { Panel } from "~/components/dashboard/section"
import { SignupCallout } from "~/components/dashboard/signup-callout"
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
        description="Each agent has its own inboxes, API keys and webhook."
        actions={
          <Tooltip content={atLimit ? `Your ${me?.plan.name} plan allows ${me?.plan.maxAgents} agents` : "Create an agent"}>
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
            <div className="inline-flex items-center gap-0.5 self-start rounded-lg border border-line bg-surface p-0.5 sm:self-auto">
              {(["all", "active", "paused"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[13px] capitalize transition-colors",
                    filter === f ? "bg-ink/[0.06] font-medium text-ink dark:bg-white/[0.08]" : "text-muted hover:text-ink"
                  )}
                >
                  {f}
                  <span className="ml-1.5 text-[12px] text-faint tabular-nums">{f === "all" ? agents.length : agents.filter((a) => a.status === f).length}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : agents?.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<Bot />}
              title="No agents yet"
              description={`Create an agent to give it an address like scout@${me?.mailDomain ?? "bot.agmx.io"}, or let your agent sign itself up and approve it here.`}
              action={
                <Button onClick={() => setOpen(true)}>
                  <Plus /> Create agent
                </Button>
              }
            />
          </Panel>
        ) : filtered.length === 0 ? (
          <Panel>
            <EmptyState icon={<Search />} title="No matching agents" description="Try a different search or filter." />
          </Panel>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>

      <CreateAgentDialog open={open} onOpenChange={setOpen} />
    </Page>
  )
}

function AgentCard({ agent }: { agent: AgentT }) {
  const unread = agent.inboxes.reduce((s, i) => s + i.unreadCount, 0)
  const messages = agent.inboxes.reduce((s, i) => s + i.messageCount, 0)
  const last = agent.inboxes.map((i) => i.lastMessageAt).filter(Boolean).sort().at(-1) ?? null
  const paused = agent.status === "paused"
  return (
    <Link
      to="/app/agents/$agentId"
      params={{ agentId: agent.id }}
      className="group flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
    >
      <div className="flex items-start gap-3">
        <AgentAvatar name={agent.name} color={agent.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold">{agent.name}</h3>
            {unread ? (
              <span className="flex items-center gap-1 text-[12px] font-medium tabular-nums">
                <span className="size-1.5 rounded-full bg-accent ring-1 ring-black/10" />
                {unread}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
            <span className={cn("size-1.5 rounded-full", paused ? "bg-warn" : "bg-ok")} />
            {paused ? "Paused" : "Active"}
            {agent.sendingPaused && !paused ? (
              <>
                <span className="text-faint">·</span>
                <span className="font-medium text-danger">Sending paused</span>
              </>
            ) : null}
            <span className="text-faint">·</span>
            {last ? `Last mail ${relativeTime(last)}` : "No mail yet"}
          </div>
        </div>
      </div>

      {agent.description ? <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted">{agent.description}</p> : null}

      <div className="mt-3 flex flex-col gap-1">
        {agent.inboxes.slice(0, 3).map((inbox) => (
          <div key={inbox.id} className="flex min-w-0 items-center gap-1" onClick={(e) => e.preventDefault()}>
            <code className={cn("min-w-0 truncate font-mono text-[12.5px]", inbox.status === "active" ? "text-ink-2" : "text-faint")}>{inbox.address}</code>
            <InboxStatusBadge inbox={inbox} className="shrink-0" />
            <CopyButton value={inbox.address} size="xs" label="Address copied" className="opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        ))}
        {agent.inboxes.length > 3 ? <span className="text-[12px] text-muted">+{agent.inboxes.length - 3} more</span> : null}
        {agent.inboxes.length === 0 ? <span className="text-[12.5px] text-warn">No inbox yet</span> : null}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-[12px] text-muted">
        <span className="tabular-nums">
          {agent.inboxes.length} {agent.inboxes.length === 1 ? "inbox" : "inboxes"} · {messages.toLocaleString()} {messages === 1 ? "message" : "messages"}
        </span>
        {agent.webhookUrl ? (
          <Tooltip content="Webhook configured">
            <Webhook className="size-3.5 text-faint" />
          </Tooltip>
        ) : null}
      </div>
    </Link>
  )
}
