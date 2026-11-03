import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useDocumentTitle } from "~/lib/use-document-title"
import {
  ArrowLeft,
  Check,
  Filter,
  Inbox as InboxIcon,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Zap
} from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useCompose } from "~/components/app/compose-context"
import { Page } from "~/components/app/page"
import { AgentAvatar } from "~/components/brand"
import { ColorPicker, type AgentColorName } from "~/components/dashboard/color-picker"
import { FailureNote, NativeSelect, Notice, origin, QueryError, SecretField, toastFailure } from "~/components/dashboard/common"
import { Panel, PanelEmpty, Section } from "~/components/dashboard/section"
import { connectSnippets } from "~/components/dashboard/connect"
import { CreateKeyDialog } from "~/components/dashboard/create-key-dialog"
import { InboxStatusBadge } from "~/components/dashboard/inbox-badges"
import { InboxRulesDialog, useRuleCount } from "~/components/dashboard/inbox-rules-dialog"
import { ReputationSection, SendingPausedNotice } from "~/components/dashboard/reputation-section"
import { SendingSection } from "~/components/dashboard/sending-section"
import { usernameProblem } from "~/components/dashboard/username-hint"
import { Button } from "~/components/ui/button"
import { CodeTabs } from "~/components/ui/code"
import { ConfirmDialog, Dialog, DialogContent } from "~/components/ui/dialog"
import { AddonInput, Field, Input, Textarea } from "~/components/ui/input"
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger } from "~/components/ui/menu"
import { CopyButton, EmptyState, Skeleton, Switch } from "~/components/ui/misc"
import { Table, TBody, Td, Th, THead, Tr } from "~/components/ui/table"
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
  const { data: agent, isLoading, error, refetch } = useAgent(agentId)
  const invalidate = useInvalidateAgent(agentId)
  const [editing, setEditing] = useState(false)
  useDocumentTitle(agent ? `${agent.name} — AGMX` : null)

  const status = useMutation({
    mutationFn: (next: "active" | "paused") => api((c) => c.agents.update({ params: { agentId }, payload: { status: next } })),
    onSuccess: (a) => {
      invalidate()
      if (a.status === "paused") toast.success(`${a.name} paused`, { description: "It won't send or receive until you resume it." })
      else toast.success(`${a.name} is active again`)
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

  if (error && !agent) {
    return (
      <Page>
        <QueryError error={error} onRetry={refetch} what="this agent" />
      </Page>
    )
  }

  if (isLoading || !agent) {
    return (
      <Page>
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-11 rounded-[10px]" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
        <div className="mt-10 flex max-w-4xl flex-col gap-8">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </Page>
    )
  }

  const paused = agent.status === "paused"

  return (
    <Page>
      <Link to="/app/agents" className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-ink">
        <ArrowLeft className="size-3.5" /> Agents
      </Link>

      <div className="flex max-w-4xl flex-col gap-5 pb-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <AgentAvatar name={agent.name} color={agent.color} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-[22px] leading-tight font-semibold tracking-[-0.02em]">{agent.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full", paused ? "bg-warn" : "bg-ok")} />
                {paused ? "Paused" : "Active"}
              </span>
              {agent.sendingPaused && !paused ? (
                <>
                  <span className="text-faint">·</span>
                  <span className="font-medium text-danger">Sending paused</span>
                </>
              ) : null}
              <span className="text-faint">·</span>
              <span>Created {relativeTime(agent.createdAt)}</span>
            </div>
            <div className="mt-0.5 flex min-w-0 items-center text-muted">
              <code className="truncate font-mono text-[12px]">{agent.id}</code>
              <CopyButton value={agent.id} size="xs" label="Agent id copied" />
            </div>
            {agent.description ? <p className="mt-2 max-w-2xl text-[13.5px] text-ink-2">{agent.description}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil /> Edit
          </Button>
          <Button variant="secondary" loading={status.isPending} onClick={() => status.mutate(paused ? "active" : "paused")}>
            {paused ? <Play /> : <Pause />} {paused ? "Resume agent" : "Pause agent"}
          </Button>
        </div>
      </div>

      <div className="flex max-w-4xl flex-col gap-10">
        {paused ? <Notice tone="warn">This agent is paused. Incoming mail is dropped and sending is blocked until you resume it.</Notice> : null}
        <SendingPausedNotice agent={agent} />
        <InboxesSection agentId={agent.id} agentName={agent.name} inboxes={agent.inboxes} />
        <SendingSection agentId={agent.id} sendPolicy={agent.sendPolicy} approveAttachments={agent.approveAttachments} />
        <ReputationSection agent={agent} />
        <KeysSection agentId={agent.id} />
        <WebhookSection agentId={agent.id} webhookUrl={agent.webhookUrl} secret={agent.webhookSecret} />
        <ConnectSection />
        <DangerZone agentId={agent.id} name={agent.name} />
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

function InboxesSection({ agentId, agentName, inboxes }: { agentId: string; agentName: string; inboxes: ReadonlyArray<InboxT> }) {
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<InboxT | null>(null)
  const [rulesFor, setRulesFor] = useState<InboxT | null>(null)
  const invalidate = useInvalidateAgent(agentId)
  const compose = useCompose()
  const navigate = useNavigate()
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
  const permanent = inboxes.filter((i) => !i.temporary).length

  return (
    <Section
      title="Inboxes"
      description={
        limit === null
          ? "Addresses this agent sends and receives from."
          : `${permanent} of ${limit} allowed on your plan. Temporary inboxes don't count.`
      }
      action={
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <Plus /> Add inbox
        </Button>
      }
    >
      {inboxes.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<InboxIcon />}
            title="No inbox yet"
            description="Add an address so this agent can receive verification emails and send mail."
            action={
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus /> Add inbox
              </Button>
            }
          />
        </Panel>
      ) : (
        <Panel divided>
          {inboxes.map((inbox) => (
            <div key={inbox.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <code className={cn("truncate font-mono text-[13.5px]", inbox.status !== "active" && "text-muted")}>{inbox.address}</code>
                  <CopyButton value={inbox.address} size="xs" label="Address copied" />
                  <InboxStatusBadge inbox={inbox} className="ml-1" />
                </div>
                <div className="mt-0.5 text-[12.5px] text-muted tabular-nums">
                  {inbox.displayName ? `${inbox.displayName} · ` : ""}
                  {inbox.messageCount.toLocaleString()} {inbox.messageCount === 1 ? "message" : "messages"}
                  {inbox.unreadCount ? <span className="text-ink-2"> · {inbox.unreadCount} unread</span> : null}
                  {" · "}
                  {inbox.lastMessageAt ? `last ${relativeTime(inbox.lastMessageAt)}` : "no mail yet"}
                  {inbox.maxMessages !== null ? ` · stops after ${inbox.maxMessages.toLocaleString()}` : ""}
                  <RuleCount inboxId={inbox.id} />
                </div>
              </div>
              <Link to="/app/mail" search={{ inbox: inbox.id }} className="hidden sm:block">
                <Button size="sm" variant="ghost">
                  Open in Mail
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
                    Send email from this inbox
                  </DropdownItem>
                  <DropdownItem icon={<InboxIcon />} onSelect={() => void navigate({ to: "/app/mail", search: { inbox: inbox.id } })}>
                    Open in Mail
                  </DropdownItem>
                  <DropdownItem icon={<Filter />} onSelect={() => setRulesFor(inbox)}>
                    Sender rules
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
                            text: `Hi ${agentName},\n\nYour verification code is ${Math.floor(100000 + Math.random() * 900000)}.\n\nConfirm here: https://example.com/verify?token=demo`
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
                  {inbox.status !== "closed" ? (
                    <DropdownItem
                      icon={inbox.status === "active" ? <Pause /> : <Play />}
                      onSelect={() => update.mutate({ id: inbox.id, status: inbox.status === "active" ? "paused" : "active" })}
                    >
                      {inbox.status === "active" ? "Pause inbox" : "Resume inbox"}
                    </DropdownItem>
                  ) : null}
                  <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleting(inbox)}>
                    Delete inbox
                  </DropdownItem>
                </DropdownContent>
              </DropdownMenu>
            </div>
          ))}
        </Panel>
      )}
      <AddInboxDialog open={adding} onOpenChange={setAdding} agentId={agentId} />
      <InboxRulesDialog inbox={rulesFor} onOpenChange={(o) => !o && setRulesFor(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.address}?`}
        description="The address is released and every message in it is permanently deleted. This can't be undone."
        confirmLabel="Delete inbox"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </Section>
  )
}

function AddInboxDialog({ open, onOpenChange, agentId }: { open: boolean; onOpenChange: (o: boolean) => void; agentId: string }) {
  const invalidate = useInvalidateAgent(agentId)
  const { data: me } = useMe()
  const { data: domains } = useDomains()
  const [username, setUsername] = useState("")
  const [domain, setDomain] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [temporary, setTemporary] = useState(false)
  const [lifetime, setLifetime] = useState("86400")
  const [maxMessages, setMaxMessages] = useState("")
  const [acceptFrom, setAcceptFrom] = useState("")
  const mailDomain = me?.mailDomain ?? "agmx.io"
  const verified = domains?.filter((d) => d.status === "verified") ?? []
  const maxParsed = maxMessages.trim() ? Number(maxMessages) : undefined
  const maxProblem = maxParsed !== undefined && (!Number.isInteger(maxParsed) || maxParsed < 1) ? "Enter a whole number of 1 or more." : undefined
  const senders = acceptFrom
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const domainOptions = [...(me?.operatorDomain ? [me.operatorDomain] : []), ...verified.map((d) => d.name)]
  const problem = usernameProblem(username, (domain || mailDomain) === mailDomain)
  useEffect(() => {
    if (!open) {
      setUsername("")
      setDomain("")
      setDisplayName("")
      setTemporary(false)
      setLifetime("86400")
      setMaxMessages("")
      setAcceptFrom("")
      mutation.reset()
    }
  }, [open])
  const mutation = useMutation({
    mutationFn: () =>
      api((c) =>
        c.inboxes.create({
          payload: {
            agentId,
            username: username.trim() || undefined,
            domain: domain || undefined,
            displayName: displayName.trim() || null,
            expiresIn: temporary ? Number(lifetime) : undefined,
            maxMessages: maxParsed,
            acceptFrom: senders.length ? senders : undefined
          }
        })
      ),
    onSuccess: (inbox) => {
      invalidate()
      toast.success(`${inbox.address} is ready`, inbox.temporary ? { description: "It deletes itself, with its mail, when it expires." } : undefined)
      onOpenChange(false)
    }
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add inbox"
        description="An agent can have several addresses, for example one per service it signs up for."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-inbox" loading={mutation.isPending} disabled={Boolean(problem || maxProblem)}>
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
            if (!problem && !maxProblem) mutation.mutate()
          }}
        >
          <Field
            label="Address"
            htmlFor="inbox-username"
            error={problem}
            hint={username ? undefined : temporary ? "Leave blank for a random tmp- address." : "Leave blank for a random friendly address."}
          >
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
          <div className="overflow-hidden rounded-xl border border-line">
            <label htmlFor="inbox-temporary" className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium">Temporary inbox</span>
                <span className="mt-0.5 block text-[12.5px] text-muted">Deletes itself and its mail after a while. Good for one-off sign-ups.</span>
              </span>
              <Switch id="inbox-temporary" checked={temporary} onCheckedChange={setTemporary} />
            </label>
            {temporary ? (
              <div className="grid animate-fade-in gap-3 border-t border-line bg-bg-subtle/40 p-4 sm:grid-cols-2">
                <Field label="Delete after" htmlFor="inbox-lifetime">
                  <NativeSelect id="inbox-lifetime" value={lifetime} onChange={setLifetime}>
                    <option value="3600">1 hour</option>
                    <option value="86400">1 day</option>
                    <option value="604800">7 days</option>
                  </NativeSelect>
                </Field>
                <Field label="Stop after" htmlFor="inbox-max" error={maxProblem}>
                  <AddonInput
                    id="inbox-max"
                    inputMode="numeric"
                    placeholder="No limit"
                    value={maxMessages}
                    onChange={(e) => setMaxMessages(e.target.value.replace(/[^0-9]/g, ""))}
                    suffix="messages"
                  />
                </Field>
              </div>
            ) : null}
          </div>
          <Field
            label="Only accept mail from"
            htmlFor="inbox-accept"
            hint="Optional. Comma-separated domains or addresses, e.g. github.com. Everyone else is dropped."
          >
            <Input id="inbox-accept" placeholder="github.com, noreply@stripe.com" value={acceptFrom} onChange={(e) => setAcceptFrom(e.target.value)} spellCheck={false} />
          </Field>
          <FailureNote error={mutation.error} />
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RuleCount({ inboxId }: { inboxId: string }) {
  const count = useRuleCount(inboxId)
  return count ? <span>{` · ${count} ${count === 1 ? "rule" : "rules"}`}</span> : null
}

// ---------------------------------------------------------------------------

function WebhookSection({ agentId, webhookUrl, secret }: { agentId: string; webhookUrl: string | null; secret: string }) {
  const invalidate = useInvalidateAgent(agentId)
  const queryClient = useQueryClient()
  const [url, setUrl] = useState(webhookUrl ?? "")
  const [rotating, setRotating] = useState(false)
  const { data: deliveries, isLoading, error: deliveriesError, refetch: refetchDeliveries } = useDeliveries(agentId)
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
      toast.success("Signing secret rotated", { description: "Update your endpoint to verify with the new secret." })
    },
    onError: (e) => toastFailure(e)
  })

  return (
    <Section
      title="Webhook"
      description="Signed JSON events for received, sent, bounced and complained mail. Failed deliveries retry for about 6 hours."
    >
      <Panel divided>
        <form
          className="flex flex-col gap-2 p-5 sm:flex-row"
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
        <div className="flex flex-col gap-2 p-5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-medium text-ink-2">Signing secret</span>
            <button onClick={() => setRotating(true)} className="inline-flex items-center gap-1 text-[12.5px] text-muted transition-colors hover:text-ink">
              <RefreshCw className="size-3" /> Rotate
            </button>
          </div>
          <SecretField value={secret} masked={`whsec_${"•".repeat(28)}`} label="Signing secret" />
          <p className="text-[12.5px] text-muted">
            Verify the <code className="font-mono text-[12px]">X-AGMX-Signature</code> header as an HMAC-SHA256 of <code className="font-mono text-[12px]">{"{t}.{body}"}</code>.{" "}
            <Link to="/docs" hash="webhooks" className="underline underline-offset-2 hover:text-ink">
              How to verify
            </Link>
          </p>
        </div>
      </Panel>

      <div className="mt-2 text-[13px] font-medium text-ink-2">Recent deliveries</div>
      {isLoading ? (
        <Skeleton className="h-24 w-full rounded-xl" />
      ) : deliveriesError && !deliveries ? (
        <Panel>
          <QueryError error={deliveriesError} onRetry={refetchDeliveries} what="deliveries" className="py-8" />
        </Panel>
      ) : deliveries?.length ? (
        <Table className="max-h-80">
          <THead>
            <Th>Event</Th>
            <Th>Result</Th>
            <Th className="hidden sm:table-cell">Attempts</Th>
            <Th className="text-right">When</Th>
          </THead>
          <TBody>
            {deliveries.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <span className="flex items-center gap-2">
                    <span className={cn("size-1.5 shrink-0 rounded-full", d.status === "success" ? "bg-ok" : d.status === "failed" ? "bg-danger" : "bg-warn")} />
                    <code className="font-mono text-[12.5px]">{d.event}</code>
                  </span>
                </Td>
                <Td className="max-w-[280px]">
                  <span className="block truncate text-muted" title={d.lastError ?? undefined}>
                    {d.status === "success" ? `Delivered${d.responseStatus ? ` · HTTP ${d.responseStatus}` : ""}` : (d.lastError?.replace(/:\s*$/, "") ?? (d.status === "pending" ? "Queued" : "Failed"))}
                  </span>
                </Td>
                <Td className="hidden text-muted tabular-nums sm:table-cell">{d.attempts}</Td>
                <Td className="text-right whitespace-nowrap text-muted tabular-nums">{relativeTime(d.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <Panel>
          <PanelEmpty>{webhookUrl ? "No deliveries yet. Send a test, or wait for mail to arrive." : "Add a URL to start receiving events."}</PanelEmpty>
        </Panel>
      )}
      <ConfirmDialog
        open={rotating}
        onOpenChange={setRotating}
        title="Rotate signing secret?"
        description="The current secret stops working immediately. Deliveries will be signed with the new one, so update your endpoint right away."
        confirmLabel="Rotate secret"
        loading={rotate.isPending}
        onConfirm={() => rotate.mutate()}
      />
    </Section>
  )
}

// ---------------------------------------------------------------------------

function KeysSection({ agentId }: { agentId: string }) {
  const { data: keys, isLoading, error: keysError, refetch: refetchKeys } = useApiKeys()
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
    <Section
      title="API keys"
      description="These keys can only use this agent's inboxes."
      action={
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          <Plus /> New key
        </Button>
      }
    >
      {isLoading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : keysError && !keys ? (
        <Panel>
          <QueryError error={keysError} onRetry={refetchKeys} what="keys" className="py-8" />
        </Panel>
      ) : agentKeys.length ? (
        <Panel divided>
          {agentKeys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{k.name}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                  <code className="font-mono text-[12px]">{k.prefix}</code>
                  <span className="text-faint">·</span>
                  {k.lastUsedAt ? `Used ${relativeTime(k.lastUsedAt)}` : "Never used"}
                </div>
              </div>
              <DropdownMenu>
                <DropdownTrigger asChild>
                  <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${k.name}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownTrigger>
                <DropdownContent>
                  <DropdownItem icon={<Trash2 />} danger onSelect={() => setRevoking({ id: k.id, name: k.name })}>
                    Revoke key
                  </DropdownItem>
                </DropdownContent>
              </DropdownMenu>
            </div>
          ))}
        </Panel>
      ) : (
        <Panel>
          <PanelEmpty>No keys for this agent yet.</PanelEmpty>
        </Panel>
      )}
      <CreateKeyDialog open={creating} onOpenChange={setCreating} agentId={agentId} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke “${revoking?.name}”?`}
        description="Requests using this key will fail with 401 Unauthorized immediately. This can't be undone."
        confirmLabel="Revoke key"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </Section>
  )
}

function ConnectSection() {
  return (
    <Section title="Connect" description="Replace $AGMX_KEY with one of this agent's keys.">
      <CodeTabs tabs={connectSnippets("$AGMX_KEY")} />
      <p className="text-[12.5px] text-muted">
        Or point the agent at{" "}
        <a href={`${origin()}/skill.md`} target="_blank" rel="noreferrer" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          skill.md
        </a>
        , which explains the whole API for agents.
      </p>
    </Section>
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
  const close = (next: boolean) => {
    setOpen(next)
    if (!next) setConfirm("")
  }
  return (
    <Section title="Delete agent">
      <Panel className="flex flex-col gap-3 border-danger/25 p-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-muted">Permanently delete this agent with all of its inboxes, messages, keys and webhook history.</p>
        <Button variant="secondary" size="sm" className="text-danger" onClick={() => setOpen(true)}>
          <Trash2 /> Delete agent
        </Button>
      </Panel>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          title={`Delete ${name}?`}
          description="This permanently deletes every inbox and message this agent owns. It can't be undone."
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" form="delete-agent" variant="danger" disabled={confirm !== name} loading={remove.isPending}>
                {confirm === name ? <Check /> : <Trash2 />} Delete forever
              </Button>
            </>
          }
        >
          <form
            id="delete-agent"
            onSubmit={(e) => {
              e.preventDefault()
              if (confirm === name && !remove.isPending) remove.mutate()
            }}
          >
            <Field label={<>Type <span className="font-mono font-semibold text-ink">{name}</span> to confirm</>} htmlFor="confirm-delete">
              <Input id="confirm-delete" autoFocus autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          </form>
        </DialogContent>
      </Dialog>
    </Section>
  )
}
