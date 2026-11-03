import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Check, Clock, Paperclip, ShieldCheck, ShieldQuestion, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Page, PageHeader } from "~/components/app/page"
import { AgentAvatar } from "~/components/brand"
import { QueryError, toastFailure } from "~/components/dashboard/common"
import { dk, useApprovals } from "~/components/dashboard/queries"
import { Panel } from "~/components/dashboard/section"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent } from "~/components/ui/dialog"
import { Field, Textarea } from "~/components/ui/input"
import { EmptyState, Skeleton } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { useAgents } from "~/lib/queries"
import { formatAddress } from "~/shared/address"
import type { AgentT, MessageT } from "~/shared/api/domain"
import { formatWhen } from "~/components/mail/queries"
import { cn, formatBytes, fullDate, relativeTime } from "~/lib/utils"

export const Route = createFileRoute("/app/approvals")({
  head: () => ({ meta: [{ title: "Approvals — AGMX" }] }),
  component: ApprovalsPage
})

function ApprovalsPage() {
  const { data, isLoading, error, refetch } = useApprovals()
  const { data: agents } = useAgents()
  const queryClient = useQueryClient()
  const [rejecting, setRejecting] = useState<MessageT | null>(null)

  const agentByInbox = useMemo(() => {
    const map = new Map<string, AgentT>()
    for (const a of agents ?? []) for (const i of a.inboxes) map.set(i.id, a)
    return map
  }, [agents])

  /** Remove the item from the queue right away; restore it if the request fails. */
  const optimistic = (id: string) => {
    const previous = queryClient.getQueryData<ReadonlyArray<MessageT>>(dk.approvals)
    queryClient.setQueryData<ReadonlyArray<MessageT>>(dk.approvals, (list) => list?.filter((m) => m.id !== id))
    return { previous }
  }
  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: dk.approvals })
    void queryClient.invalidateQueries({ queryKey: ["messages"] })
    void queryClient.invalidateQueries({ queryKey: ["thread"] })
  }

  const approve = useMutation({
    mutationFn: (m: MessageT) => api((c) => c.approvals.approve({ params: { messageId: m.id } })),
    onMutate: (m) => optimistic(m.id),
    onSuccess: (sent) =>
      toast.success(sent.status === "scheduled" ? "Approved" : "Approved and sent", {
        description: sent.status === "scheduled" ? "It will send at its scheduled time." : sent.to.map((t) => t.address).join(", ")
      }),
    onError: (e, _m, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(dk.approvals, ctx.previous)
      toastFailure(e)
    },
    onSettled: settle
  })

  const reject = useMutation({
    mutationFn: (input: { m: MessageT; reason: string }) =>
      api((c) => c.approvals.reject({ params: { messageId: input.m.id }, payload: { reason: input.reason.trim() || undefined } })),
    onMutate: (input) => {
      setRejecting(null)
      return optimistic(input.m.id)
    },
    onSuccess: () => toast.success("Rejected", { description: "The agent has been notified." }),
    onError: (e, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(dk.approvals, ctx.previous)
      toastFailure(e)
    },
    onSettled: settle
  })

  return (
    <Page>
      <PageHeader
        title="Approvals"
        description="Mail your agents tried to send that their send policy holds for review. Nothing goes out until you approve it."
      />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      ) : error && !data ? (
        <Panel>
          <QueryError error={error} onRetry={refetch} what="approvals" />
        </Panel>
      ) : !data?.length ? (
        <Panel>
          <EmptyState
            icon={<ShieldCheck />}
            title="Nothing waiting"
            description="Agents with a send policy will queue mail here. Set a policy under an agent's Sending section."
            action={
              <Link to="/app/agents">
                <Button variant="secondary" size="sm">
                  Go to agents
                </Button>
              </Link>
            }
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-muted">
            {data.length === 1 ? "1 message" : `${data.length} messages`} waiting · oldest first
          </p>
          {data.map((m) => (
            <ApprovalItem
              key={m.id}
              message={m}
              agent={agentByInbox.get(m.inboxId) ?? null}
              busy={(approve.isPending && approve.variables?.id === m.id) || (reject.isPending && reject.variables?.m.id === m.id)}
              onApprove={() => approve.mutate(m)}
              onReject={() => setRejecting(m)}
            />
          ))}
        </div>
      )}

      <RejectDialog message={rejecting} onOpenChange={(o) => !o && setRejecting(null)} onConfirm={(reason) => rejecting && reject.mutate({ m: rejecting, reason })} />
    </Page>
  )
}

function ApprovalItem({
  message: m,
  agent,
  busy,
  onApprove,
  onReject
}: {
  message: MessageT
  agent: AgentT | null
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const body = (m.safeText ?? m.text ?? m.snippet ?? "").trim()
  const long = body.length > 420 || body.split("\n").length > 8
  const recipients = [
    { label: "To", list: m.to },
    { label: "Cc", list: m.cc },
    { label: "Bcc", list: m.bcc }
  ].filter((r) => r.list.length)

  return (
    <Panel className="animate-fade-in">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {agent ? <AgentAvatar name={agent.name} color={agent.color} /> : <AgentAvatar name={m.from.address} color="slate" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-[13.5px]">
              <span className="font-medium">{agent?.name ?? m.from.name ?? m.from.address}</span>
              <code className="truncate font-mono text-[12.5px] text-muted">{m.from.address}</code>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted">
              <Clock className="size-3" />
              <span title={fullDate(m.createdAt)}>Held {relativeTime(m.createdAt)}</span>
              {m.sendAt ? (
                <span className="whitespace-nowrap">
                  <span className="mr-1.5 text-faint">·</span>Scheduled for {formatWhen(m.sendAt)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onReject}>
            <X /> Reject
          </Button>
          <Button size="sm" loading={busy} onClick={onApprove}>
            <Check /> {m.sendAt ? "Approve" : "Approve and send"}
          </Button>
        </div>
      </div>
      {m.heldReason ? (
        <div className="flex items-start gap-2 border-b border-line bg-warn-soft/50 px-5 py-2.5 text-[12.5px] text-ink-2">
          <ShieldQuestion className="mt-px size-3.5 shrink-0 text-warn" />
          <span>
            <span className="font-medium text-ink">Held because</span> {m.heldReason.charAt(0).toLowerCase() + m.heldReason.slice(1)}
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-5 py-4">
        <dl className="grid grid-cols-[36px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
          {recipients.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-muted">{r.label}</dt>
              <dd className="min-w-0 break-words text-ink-2">{r.list.map(formatAddress).join(", ")}</dd>
            </div>
          ))}
        </dl>
        <h3 className="text-[15px] font-semibold tracking-[-0.01em]">{m.subject || <span className="text-muted">(no subject)</span>}</h3>
        {body ? (
          <div>
            <p className={cn("max-w-[72ch] text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink-2", !expanded && long && "line-clamp-6")}>{body}</p>
            {long ? (
              <button onClick={() => setExpanded((v) => !v)} className="mt-1 text-[12.5px] text-muted underline-offset-2 hover:text-ink hover:underline">
                {expanded ? "Show less" : "Show the whole message"}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="text-[13px] text-muted">No text body.</p>
        )}
        {m.attachments.length ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {m.attachments.map((a) => (
              <a
                key={a.id}
                href={a.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-bg-subtle/50 px-2.5 py-1 text-[12.5px] text-ink-2 transition-colors hover:border-line-strong"
              >
                <Paperclip className="size-3.5 text-muted" />
                <span className="truncate">{a.filename}</span>
                <span className="text-muted tabular-nums">{formatBytes(a.size)}</span>
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  )
}

function RejectDialog({ message, onOpenChange, onConfirm }: { message: MessageT | null; onOpenChange: (o: boolean) => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("")
  useEffect(() => {
    if (message) setReason("")
  }, [message])
  return (
    <Dialog open={message !== null} onOpenChange={onOpenChange}>
      <DialogContent
        title="Reject this message?"
        description="It won't be sent. The agent gets a message.rejected webhook with your reason."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => onConfirm(reason)}>
              <X /> Reject
            </Button>
          </>
        }
      >
        <Field label="Reason" htmlFor="reject-reason" hint="Optional. Helps the agent adjust what it sends.">
          <Textarea
            id="reject-reason"
            autoFocus
            className="min-h-20"
            maxLength={500}
            placeholder="e.g. Don't email customers without checking pricing first."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </DialogContent>
    </Dialog>
  )
}
