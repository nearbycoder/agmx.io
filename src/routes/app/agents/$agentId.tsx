import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Inbox as InboxIcon,
  KeyRound,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
  Zap
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCompose } from "~/components/app/compose-context"
import { Page } from "~/components/app/page"
import { AgentAvatar } from "~/components/brand"
import { ColorPicker, type AgentColorName } from "~/components/dashboard/color-picker"
import { FailureNote, NativeSelect, origin, toastFailure } from "~/components/dashboard/common"
import { connectSnippets } from "~/components/dashboard/connect"
import { CreateKeyDialog } from "~/components/dashboard/create-key-dialog"
import { usernameProblem } from "~/components/dashboard/username-hint"
import { Badge, StatusDot } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card, CardBody, CardHeader } from "~/components/ui/card"
import { CodeTabs } from "~/components/ui/code"
import { ConfirmDialog, Dialog, DialogContent } from "~/components/ui/dialog"
import { AddonInput, Field, Input, Textarea } from "~/components/ui/input"
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "~/components/ui/menu"
import { CopyButton, EmptyState, Skeleton } from "~/components/ui/misc"
import { api, ApiFailure } from "~/lib/api"
import { qk, useAgent, useApiKeys, useDeliveries, useDomains, useMe } from "~/lib/queries"
import type { InboxT } from "~/shared/api/domain"
import { cn, relativeTime } from "~/lib/utils"

export const Route = createFileRoute("/app/agents/$agentId")({
  head: () => ({ meta: [{ title: "Agent — AGMX" }] }),
  component: AgentPage
})

function useInvalidateAgent(agentId: string) {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: qk.agent(agentId) })
    void queryClient.invalidateQueries({ queryKey: qk.agents })
    void queryClient.invalidateQueries({ queryKey: qk.inboxes })
    void queryClient.invalidateQueries({ queryKey: qk.me })
  }
}

function AgentPage() {
  const { agentId } = Route.useParams()
  const { data: agent, isLoading, error } = useAgent(agentId)
  const invalidate = useInvalidateAgent(agentId)
  const [editing, setEditing] = useState(false)

  const status = useMutation({
    mutationFn: (next: "active" | "paused") => api((c) => c.agents.update({ params: { agentId }, payload: { status: next } })),
    onSuccess: (a) => {
      invalidate()
      toast.success(a.status === "paused" ? `${a.name} paused — it won't send or receive` : `${a.name} is active again`)
    },
    onError: (e) => toastFailure(e)
  })

  if (error instanceof ApiFailure && error.tag === "NotFound") {
    return (
      <Page>
        <EmptyState
          icon={<InboxIcon />}
          title="Agent not found"
          description="It may have been deleted, or it belongs to another account."
          action={
            <Link to="/app/agents">
              <Button variant="secondary">
                <ArrowLeft /> All agents
              </Button>
            </Link>
          }
        />
      </Page>
    )
  }

  if (isLoading || !agent) {
    return (
      <Page>
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-[28%]" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </Page>
    )
  }

  const paused = agent.status === "paused"

  return (
    <Page>
      <Link to="/app/agents" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <ArrowLeft className="size-3.5" /> Agents
      </Link>

      <div className="flex flex-col gap-5 pb-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <AgentAvatar name={agent.name} color={agent.color} size="lg" className="size-14 text-[19px]" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[26px] leading-tight font-semibold tracking-[-0.03em]">{agent.name}</h1>
              <Badge tone={paused ? "warn" : "ok"}>
                <StatusDot tone={paused ? "warn" : "ok"} /> {agent.status}
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted">{agent.description || "No description yet."}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[12px] text-faint">
              <code className="truncate font-mono">{agent.id}</code>
              <CopyButton value={agent.id} size="xs" label="Agent id copied" />
              <span className="mx-1 hidden sm:inline">·</span>
              <span className="w-full sm:w-auto">created {relativeTime(agent.createdAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          <Button variant="secondary" loading={status.isPending} onClick={() => status.mutate(paused ? "active" : "paused")}>
            {paused ? <Play /> : <Pause />} {paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </div>

      {paused ? (
        <div className="mb-6 rounded-xl border border-warn/25 bg-warn-soft px-4 py-3 text-[13px] text-warn">
          This agent is paused. Incoming mail is dropped and sending is blocked until you resume it.
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <InboxesCard agentId={agent.id} agentName={agent.name} inboxes={agent.inboxes} />
          <WebhookCard agentId={agent.id} webhookUrl={agent.webhookUrl} secret={agent.webhookSecret} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <KeysCard agentId={agent.id} />
          <ConnectCard />
          <DangerZone agentId={agent.id} name={agent.name} />
        </div>
      </div>

      <EditAgentDialog open={editing} onOpenChange={setEditing} agent={agent} />
    </Page>
  )
}

// ---------------------------------------------------------------------------

function EditAgentDialog({
  open,
  onOpenChange,
  agent
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  agent: { id: string; name: string; description: string | null; color: string }
}) {
  const invalidate = useInvalidateAgent(agent.id)
  const [name, setName] = useState(agent.name)
  const [description, setDescription] = useState(agent.description ?? "")
  const [color, setColor] = useState<AgentColorName>(agent.color as AgentColorName)
  useEffect(() => {
    if (open) {
      setName(agent.name)
      setDescription(agent.description ?? "")
      setColor(agent.color as AgentColorName)
    }
  }, [open, agent])
  const mutation = useMutation({
    mutationFn: () => api((c) => c.agents.update({ params: { agentId: agent.id }, payload: { name: name.trim(), description: description.trim() || null, color } })),
    onSuccess: () => {
      invalidate()
      toast.success("Agent updated")
      onOpenChange(false)
    }
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Edit agent"
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-agent" loading={mutation.isPending} disabled={!name.trim()}>
              Save changes
            </Button>
          </>
        }
      >
        <form
          id="edit-agent"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          <Field label="Name" htmlFor="edit-name">
            <Input id="edit-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="edit-desc">
            <Textarea id="edit-desc" className="min-h-20" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Color">
            <ColorPicker value={color} onChange={setColor} />
          </Field>
          <FailureNote error={mutation.error} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

function InboxesCard({ agentId, agentName, inboxes }: { agentId: string; agentName: string; inboxes: ReadonlyArray<InboxT> }) {
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<InboxT | null>(null)
  const invalidate = useInvalidateAgent(agentId)
  const compose = useCompose()
  const { data: me } = useMe()

  const update = useMutation({
    mutationFn: (input: { id: string; status: "active" | "paused" }) => api((c) => c.inboxes.update({ params: { inboxId: input.id }, payload: { status: input.status } })),
    onSuccess: (inbox) => {
      invalidate()
      toast.success(inbox.status === "paused" ? `${inbox.address} paused` : `${inbox.address} resumed`)
    },
    onError: (e) => toastFailure(e)
  })
  const remove = useMutation({
    mutationFn: (id: string) => api((c) => c.inboxes.delete({ params: { inboxId: id } })),
    onSuccess: () => {
      invalidate()
      toast.success("Inbox deleted")
      setDeleting(null)
    },
    onError: (e) => toastFailure(e)
  })

  const limit = me?.plan.inboxesPerAgent ?? null

  return (
    <Card>
      <CardHeader
        title="Inboxes"
        description={limit === null ? "Addresses this agent sends and receives from." : `${inboxes.length} of ${limit} on your plan.`}
        action={
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus /> Add inbox
          </Button>
        }
      />
      {inboxes.length === 0 ? (
        <EmptyState
          icon={<InboxIcon />}
          title="No inbox yet"
          description="Claim an address so this agent can receive verification emails and send mail."
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add inbox
            </Button>
          }
        />
      ) : (
        <div className="divide-y divide-line">
          {inboxes.map((inbox) => (
            <div key={inbox.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl border border-line", inbox.status === "active" ? "bg-accent-soft text-accent-ink" : "bg-warn-soft text-warn")}>
                <InboxIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <code className="truncate font-mono text-[13.5px] font-medium">{inbox.address}</code>
                  <CopyButton value={inbox.address} size="xs" label="Address copied" />
                  {inbox.status === "paused" ? <Badge tone="warn">paused</Badge> : null}
                </div>
                <div className="mt-0.5 text-[12px] text-muted tabular-nums">
                  {inbox.displayName ? `${inbox.displayName} · ` : ""}
                  {inbox.messageCount.toLocaleString()} messages
                  {inbox.unreadCount ? <span className="font-medium text-ink"> · {inbox.unreadCount} unread</span> : null}
                  {" · "}
                  {inbox.lastMessageAt ? `last ${relativeTime(inbox.lastMessageAt)}` : "no mail yet"}
                </div>
              </div>
              <Link to="/app/mail" search={{ inbox: inbox.id }} className="hidden sm:block">
                <Button size="sm" variant="ghost">
                  Open
                </Button>
              </Link>
              <DropdownMenu>
                <DropdownTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${inbox.address}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownItem icon={<Send />} onSelect={() => compose.open({ from: inbox.address, subject: `Hello from ${agentName}` })}>
                    Send email from here
                  </DropdownItem>
                  <DropdownItem icon={<InboxIcon />} onSelect={() => (window.location.href = `/app/mail?inbox=${inbox.id}`)}>
                    Open in Mail
                  </DropdownItem>
{me?.devTools ? (
                  <DropdownItem
                    icon={<Zap />}
                    onSelect={async () => {
                      const res = await fetch("/api/dev/inbound", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                          from: "AGMX Test <test@example.com>",
                          to: inbox.address,
                          subject: "Your AGMX verification code",
                          text: `Hi ${agentName}!\n\nYour verification code is ${Math.floor(100000 + Math.random() * 900000)}.\n\nConfirm here: https://example.com/verify?token=demo`
                        })
                      })
                      if (res.ok) toast.success("Test email delivered")
                      else toast.error("Test delivery is only available in development")
                    }}
                  >
                    Simulate incoming email
                  </DropdownItem>
                  ) : null}
                  <DropdownSeparator />
                  <DropdownItem
                    icon={inbox.status === "active" ? <Pause /> : <Play />}
                    onSelect={() => update.mutate({ id: inbox.id, status: inbox.status === "active" ? "paused" : "active" })}
                  >
                    {inbox.status === "active" ? "Pause inbox" : "Resume inbox"}
                  </DropdownItem>
                  <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleting(inbox)}>
                    Delete inbox
                  </DropdownItem>
                </DropdownContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
      <AddInboxDialog open={adding} onOpenChange={setAdding} agentId={agentId} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.address}?`}
        description="The address is released and every message in it is permanently deleted. This can't be undone."
        confirmLabel="Delete inbox"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Card>
  )
}

function AddInboxDialog({ open, onOpenChange, agentId }: { open: boolean; onOpenChange: (o: boolean) => void; agentId: string }) {
  const invalidate = useInvalidateAgent(agentId)
  const { data: me } = useMe()
  const { data: domains } = useDomains()
  const [username, setUsername] = useState("")
  const [domain, setDomain] = useState("")
  const [displayName, setDisplayName] = useState("")
  const mailDomain = me?.mailDomain ?? "agmx.io"
  const verified = domains?.filter((d) => d.status === "verified") ?? []
  const domainOptions = [...(me?.operatorDomain ? [me.operatorDomain] : []), ...verified.map((d) => d.name)]
  const problem = usernameProblem(username, (domain || mailDomain) === mailDomain)
  useEffect(() => {
    if (!open) {
      setUsername("")
      setDomain("")
      setDisplayName("")
      mutation.reset()
    }
  }, [open])
  const mutation = useMutation({
    mutationFn: () =>
      api((c) =>
        c.inboxes.create({
          payload: { agentId, username: username.trim() || undefined, domain: domain || undefined, displayName: displayName.trim() || null }
        })
      ),
    onSuccess: (inbox) => {
      invalidate()
      toast.success(`${inbox.address} is ready`)
      onOpenChange(false)
    }
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add inbox"
        description="Agents can own several addresses — e.g. one per service they sign up for."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-inbox" loading={mutation.isPending} disabled={Boolean(problem)}>
              <Plus /> Create inbox
            </Button>
          </>
        }
      >
        <form
          id="add-inbox"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!problem) mutation.mutate()
          }}
        >
          <Field label="Address" htmlFor="inbox-username" error={problem} hint={username ? undefined : "Leave blank for a random friendly address."}>
            <div className="flex gap-2">
              <AddonInput
                id="inbox-username"
                autoFocus
                className="flex-1"
                placeholder="billing-bot"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                suffix={domainOptions.length ? undefined : `@${mailDomain}`}
                spellCheck={false}
                autoComplete="off"
              />
              {domainOptions.length ? (
                <NativeSelect value={domain} onChange={setDomain} className="w-44 font-mono text-[13px]" aria-label="Domain">
                  <option value="">@{mailDomain}</option>
                  {domainOptions.map((name) => (
                      <option key={name} value={name}>
                        @{name}
                      </option>
                    ))}
                </NativeSelect>
              ) : null}
            </div>
          </Field>
          <Field label="Display name" htmlFor="inbox-display" hint="Shown to recipients, e.g. “Scout from Acme”.">
            <Input id="inbox-display" placeholder="Optional" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <FailureNote error={mutation.error} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------

function WebhookCard({ agentId, webhookUrl, secret }: { agentId: string; webhookUrl: string | null; secret: string }) {
  const invalidate = useInvalidateAgent(agentId)
  const queryClient = useQueryClient()
  const [url, setUrl] = useState(webhookUrl ?? "")
  const [showSecret, setShowSecret] = useState(false)
  const [rotating, setRotating] = useState(false)
  const { data: deliveries, isLoading } = useDeliveries(agentId)
  useEffect(() => setUrl(webhookUrl ?? ""), [webhookUrl])
  const dirty = (url.trim() || null) !== webhookUrl

  const save = useMutation({
    mutationFn: () => api((c) => c.agents.update({ params: { agentId }, payload: { webhookUrl: url.trim() || null } })),
    onSuccess: () => {
      invalidate()
      toast.success(url.trim() ? "Webhook saved" : "Webhook removed")
    },
    onError: (e) => toastFailure(e)
  })
  const test = useMutation({
    mutationFn: () => api((c) => c.agents.testWebhook({ params: { agentId } })),
    onSuccess: (d) => {
      void queryClient.invalidateQueries({ queryKey: qk.deliveries(agentId) })
      if (d.status === "success") toast.success(`Test delivered · HTTP ${d.responseStatus}`)
      else toast.error("Test delivery failed", { description: d.lastError ?? undefined })
    },
    onError: (e) => toastFailure(e)
  })
  const rotate = useMutation({
    mutationFn: () => api((c) => c.agents.rotateWebhookSecret({ params: { agentId } })),
    onSuccess: () => {
      invalidate()
      setRotating(false)
      setShowSecret(true)
      toast.success("Signing secret rotated — update your endpoint")
    },
    onError: (e) => toastFailure(e)
  })

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Webhook className="size-4 text-muted" /> Webhook
          </span>
        }
        description="We POST signed JSON for message.received, message.sent, bounces and complaints. Failed deliveries retry with backoff for ~6 hours."
      />
      <CardBody className="flex flex-col gap-5">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Input type="url" placeholder="https://example.com/hooks/agmx" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Webhook URL" className="w-full sm:flex-1" />
          <div className="flex gap-2">
            <Button type="submit" variant={dirty ? "primary" : "secondary"} disabled={!dirty} loading={save.isPending}>
              Save
            </Button>
            <Button type="button" variant="secondary" disabled={!webhookUrl || dirty} loading={test.isPending} onClick={() => test.mutate()}>
              <Zap /> Send test
            </Button>
          </div>
        </form>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-medium text-muted">Signing secret</span>
            <button onClick={() => setRotating(true)} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-ink">
              <RefreshCw className="size-3" /> Rotate
            </button>
          </div>
          <div className="flex items-center gap-1 rounded-[10px] border border-line bg-surface-2 py-1 pr-1 pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{showSecret ? secret : `whsec_${"•".repeat(28)}`}</code>
            <button
              onClick={() => setShowSecret((v) => !v)}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-bg-subtle hover:text-ink"
              aria-label={showSecret ? "Hide secret" : "Reveal secret"}
            >
              {showSecret ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <CopyButton value={secret} label="Signing secret copied" />
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            Verify <code className="font-mono">X-AGMX-Signature: t=…,v1=…</code> as HMAC-SHA256 of <code className="font-mono">{"`${t}.${body}`"}</code>.{" "}
            <Link to="/docs" hash="webhooks" className="underline underline-offset-2 hover:text-ink">
              Docs
            </Link>
          </p>
        </div>

        <div>
          <div className="mb-2 text-[12px] font-medium text-muted">Recent deliveries</div>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : deliveries?.length ? (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="scrollbar-thin max-h-72 divide-y divide-line overflow-y-auto">
                {deliveries.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[12.5px]">
                    <StatusDot tone={d.status === "success" ? "ok" : d.status === "failed" ? "danger" : "warn"} />
                    <code className="w-36 shrink-0 truncate font-mono text-[12px]">{d.event}</code>
                    <span className="min-w-0 flex-1 truncate text-muted" title={d.lastError ?? undefined}>
                      {d.status === "success" ? `Delivered${d.responseStatus ? ` · ${d.responseStatus}` : ""}` : d.lastError ?? (d.status === "pending" ? "Queued" : "Failed")}
                    </span>
                    <span className="hidden shrink-0 text-faint tabular-nums sm:inline">
                      {d.attempts} {d.attempts === 1 ? "try" : "tries"}
                    </span>
                    <span className="shrink-0 text-faint tabular-nums">{relativeTime(d.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[12.5px] text-muted">
              {webhookUrl ? "No deliveries yet. Send a test or wait for mail." : "Add a URL to start receiving events."}
            </div>
          )}
        </div>
      </CardBody>
      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title="Rotate signing secret?"
        description="The current secret stops working immediately. Deliveries will be signed with the new one, so update your endpoint right away."
        confirmLabel="Rotate secret"
        loading={rotate.isPending}
        onConfirm={() => rotate.mutate()}
      />
    </Card>
  )
}

// ---------------------------------------------------------------------------

function KeysCard({ agentId }: { agentId: string }) {
  const { data: keys, isLoading } = useApiKeys()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null)
  const agentKeys = keys?.filter((k) => k.agentId === agentId) ?? []
  const revoke = useMutation({
    mutationFn: (id: string) => api((c) => c.apiKeys.revoke({ params: { keyId: id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.keys })
      toast.success("Key revoked")
      setRevoking(null)
    },
    onError: (e) => toastFailure(e)
  })
  return (
    <Card>
      <CardHeader
        title="API keys"
        description="Scoped to this agent's inboxes only."
        action={
          <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
            <Plus /> New key
          </Button>
        }
      />
      {isLoading ? (
        <div className="p-5">
          <Skeleton className="h-10 w-full" />
        </div>
      ) : agentKeys.length ? (
        <div className="divide-y divide-line">
          {agentKeys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 px-5 py-3">
              <KeyRound className="size-4 shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{k.name}</div>
                <div className="truncate font-mono text-[11.5px] text-muted">
                  {k.prefix} · {k.lastUsedAt ? `used ${relativeTime(k.lastUsedAt)}` : "never used"}
                </div>
              </div>
              <Tooltip content="Revoke key">
                <Button size="icon-sm" variant="danger-ghost" onClick={() => setRevoking({ id: k.id, name: k.name })} aria-label={`Revoke ${k.name}`}>
                  <Trash2 />
                </Button>
              </Tooltip>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-6 text-center text-[13px] text-muted">No keys for this agent yet.</div>
      )}
      <CreateKeyDialog open={creating} onOpenChange={setCreating} agentId={agentId} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke “${revoking?.name}”?`}
        description="Anything using this key will immediately start getting 401 Unauthorized."
        confirmLabel="Revoke key"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </Card>
  )
}

function ConnectCard() {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Connect" description="Replace AGMX_KEY with one of this agent's keys." />
      <div className="p-4">
        <CodeTabs tabs={connectSnippets("$AGMX_KEY")} />
        <p className="mt-3 text-[12px] text-muted">
          Or let the agent read{" "}
          <a href={`${origin()}/skill.md`} target="_blank" rel="noreferrer" className="font-mono text-ink underline underline-offset-2">
            /skill.md
          </a>{" "}
          — it explains everything in agent-friendly terms.
        </p>
      </div>
    </Card>
  )
}

function DangerZone({ agentId, name }: { agentId: string; name: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState("")
  const remove = useMutation({
    mutationFn: () => api((c) => c.agents.delete({ params: { agentId } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.agents })
      void queryClient.invalidateQueries({ queryKey: qk.keys })
      void queryClient.invalidateQueries({ queryKey: qk.me })
      toast.success(`${name} deleted`)
      void navigate({ to: "/app/agents" })
    },
    onError: (e) => toastFailure(e)
  })
  return (
    <Card className="border-danger/25">
      <CardHeader title={<span className="text-danger">Danger zone</span>} />
      <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">Delete this agent with all its inboxes, messages, keys and webhook history.</p>
        <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
          <Trash2 /> Delete agent
        </Button>
      </CardBody>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) setConfirm("")
        }}
      >
        <DialogContent
          title={`Delete ${name}?`}
          description="This permanently deletes every inbox and message this agent owns. It can't be undone."
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="danger" disabled={confirm !== name} loading={remove.isPending} onClick={() => remove.mutate()}>
                {confirm === name ? <Check /> : <Trash2 />} Delete forever
              </Button>
            </>
          }
        >
          <Field label={<>Type <span className="font-mono font-semibold text-ink">{name}</span> to confirm</>} htmlFor="confirm-delete">
            <Input id="confirm-delete" autoFocus autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
