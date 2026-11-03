import { Link } from "@tanstack/react-router"
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ChevronDown,
  Clock,
  Copy,
  Download,
  FileText,
  Forward,
  MailOpen,
  Pencil,
  MoreHorizontal,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X
} from "lucide-react"
import { toast } from "sonner"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { MessageT } from "~/shared/api/domain"
import { SenderAvatar } from "~/components/brand"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { ConfirmDialog } from "~/components/ui/dialog"
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "~/components/ui/menu"
import { copyText, Skeleton } from "~/components/ui/misc"
import { useThread } from "~/lib/queries"
import { cn, formatBytes, fullDate, mailTime, messageDate } from "~/lib/utils"
import { HtmlFrame, PlainBody } from "./email-body"
import { ExtractedPanel, hasExtracted } from "./extracted-panel"
import { formatWhen, useCancelScheduled } from "./queries"
import { defaultBodyView, SecurityBanner, type BodyView } from "./security-banner"
import { UNSENT, useMailActions } from "./use-mail-actions"

export type ReplyMode = "reply" | "replyAll" | "forward"

/** Short file type for an attachment: the extension when there is one ("PDF", "ICS"), else the MIME subtype. */
const fileKind = (filename: string | null | undefined, contentType: string) => {
  const ext = filename?.match(/\.([a-z0-9]{1,5})$/i)?.[1]
  if (ext) return ext.toUpperCase()
  const sub = (contentType.split("/")[1] ?? contentType).split(/[;+]/)[0]!
  return sub.replace(/^(x-|vnd\.)/, "").toUpperCase()
}

const formatAddr = (a: { name?: string | null; address: string }) => (a.name ? `${a.name} <${a.address}>` : a.address)

export function ThreadView({
  threadId,
  onClose,
  onReply,
  onDeleted,
  onArchived,
  onEditDraft
}: {
  threadId: string
  onClose: () => void
  onReply: (message: MessageT, mode: ReplyMode) => void
  onDeleted: () => void
  onArchived: () => void
  onEditDraft: (message: MessageT) => void
}) {
  const { data: thread, isLoading, error } = useThread(threadId)
  const actions = useMailActions()
  /** Message ids awaiting delete confirmation: the whole thread, or one message from it. */
  const [confirmDelete, setConfirmDelete] = useState<ReadonlyArray<string> | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const messages = thread?.messages ?? []
  // Replies and thread-level actions target real mail, not drafts or held messages.
  const sentMessages = messages.filter((m) => !UNSENT.has(m.status))
  const latest = sentMessages[sentMessages.length - 1] ?? messages[messages.length - 1]
  const replyable = sentMessages.length > 0
  const latestInbound = [...messages].reverse().find((m) => m.direction === "inbound")
  const ids = messages.map((m) => m.id)
  const allArchived = messages.length > 0 && messages.filter((m) => m.direction === "inbound").every((m) => m.isArchived)
  const anySpam = messages.some((m) => m.isSpam)
  const starred = latest?.isStarred ?? false

  // Expand the latest message and anything unread; collapse the rest.
  useEffect(() => {
    if (!thread) return
    const open = new Set<string>()
    thread.messages.forEach((m, i) => {
      if (i === thread.messages.length - 1 || (!m.isRead && m.direction === "inbound")) open.add(m.id)
    })
    setExpanded(open)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, thread?.messages.length])

  // Mark unread inbound messages as read once the thread is open.
  useEffect(() => {
    if (!thread) return
    const unread = thread.messages.filter((m) => m.direction === "inbound" && !m.isRead).map((m) => m.id)
    if (unread.length) actions.update(unread, { isRead: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, thread?.messages.length])

  if (isLoading) return <ReaderSkeleton onClose={onClose} />
  if (error || !thread) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted">This conversation couldn't be loaded. It may have been deleted.</p>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    )
  }

  // Threads holding only drafts or held mail have no participants yet; derive them from the messages.
  const participants = thread.participants.length
    ? thread.participants
    : [...new Map(messages.flatMap((m) => [m.from, ...m.to]).map((a) => [a.address, a])).values()]
  const participantLine = participants
    .slice(0, 5)
    .map((p) => p.name || p.address)
    .join(", ")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[52px] shrink-0 items-center gap-0.5 border-b border-line px-3">
        <ToolbarButton label="Close" shortcut="Esc" onClick={onClose}>
          <ArrowLeft className="md:hidden" />
          <X className="hidden md:block" />
        </ToolbarButton>
        <div className="mx-1.5 h-4 w-px bg-line" />
        <ToolbarButton
          label={allArchived ? "Move to inbox" : "Archive"}
          shortcut="E"
          onClick={() => {
            actions.update(ids, { isArchived: !allArchived })
            if (!allArchived) onArchived()
          }}
        >
          {allArchived ? <ArchiveRestore /> : <Archive />}
        </ToolbarButton>
        {latestInbound ? (
          <>
            <ToolbarButton
              label={anySpam ? "Not spam" : "Report spam"}
              onClick={() => {
                actions.update(ids, { isSpam: !anySpam })
                toast.success(anySpam ? "Moved to Inbox" : "Moved to Spam")
                onArchived()
              }}
            >
              {anySpam ? <ShieldCheck /> : <ShieldAlert />}
            </ToolbarButton>
            <ToolbarButton
              label="Mark unread"
              shortcut="U"
              onClick={() => {
                actions.update([latestInbound.id], { isRead: false })
                onClose()
              }}
            >
              <MailOpen />
            </ToolbarButton>
          </>
        ) : null}
        <ToolbarButton label={starred ? "Unstar" : "Star"} shortcut="S" onClick={() => latest && actions.update([latest.id], { isStarred: !starred })}>
          <Star className={cn(starred && "fill-warn text-warn")} />
        </ToolbarButton>
        <ToolbarButton label="Delete" shortcut="#" onClick={() => setConfirmDelete(ids)}>
          <Trash2 />
        </ToolbarButton>
        <div className="ml-auto flex items-center">
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<Copy />} onSelect={() => void copyText(thread.id, "Thread id copied")}>
                Copy thread id
              </DropdownItem>
              {latest ? (
                <DropdownItem icon={<Copy />} onSelect={() => void copyText(latest.id, "Message id copied")}>
                  Copy latest message id
                </DropdownItem>
              ) : null}
            </DropdownContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-5 pt-7 pb-12 sm:px-8">
          <h1 className="text-[20px] leading-snug font-semibold tracking-[-0.015em] text-balance">{thread.subject || "(no subject)"}</h1>
          <p className="mt-1.5 text-[13px] text-muted">
            {participantLine}
            {participants.length > 5 ? ` and ${participants.length - 5} more` : ""}
            <span className="mx-1.5 text-faint">·</span>
            {messages.length} message{messages.length === 1 ? "" : "s"}
          </p>

          <div className="mt-6 border-t border-line">
            {messages.map((m) =>
              expanded.has(m.id) ? (
                <MessageItem
                  key={m.id}
                  message={m}
                  collapsible={messages.length > 1}
                  onCollapse={() => setExpanded((s) => new Set([...s].filter((x) => x !== m.id)))}
                  onReply={(mode) => onReply(m, mode)}
                  onStar={() => actions.update([m.id], { isStarred: !m.isStarred })}
                  onDelete={() => setConfirmDelete([m.id])}
                  onEditDraft={() => onEditDraft(m)}
                />
              ) : (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setExpanded((s) => new Set([...s, m.id]))}
                  className="flex h-11 w-full items-center gap-3 border-b border-line text-left transition-colors hover:bg-bg-subtle/50"
                >
                  <SenderAvatar name={m.from.name} address={m.from.address} className="size-6 text-[9px]" />
                  <span className="w-40 shrink-0 truncate text-[13px] font-medium">{m.from.name || m.from.address}</span>
                  {UNSENT.has(m.status) ? <StatusBadge status={m.status} sendAt={m.sendAt} /> : null}
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{m.snippet}</span>
                  <span className="shrink-0 pr-1 text-[12px] text-muted tabular-nums">{mailTime(m.createdAt)}</span>
                </button>
              )
            )}
          </div>

          {latest && replyable ? (
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onReply(latestInbound ?? latest, "reply")}>
                <Reply /> Reply
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onReply(latestInbound ?? latest, "replyAll")}>
                <ReplyAll /> Reply all
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onReply(latest, "forward")}>
                <Forward /> Forward
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={(confirmDelete?.length ?? 0) > 1 ? "Delete this conversation?" : "Delete this message?"}
        description={
          (confirmDelete?.length ?? 0) > 1
            ? `All ${confirmDelete!.length} messages in this thread will be permanently deleted, including attachments. This can't be undone.`
            : "The message and its attachments will be permanently deleted. This can't be undone."
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (!confirmDelete) return
          actions.remove(confirmDelete)
          // Deleting the last message (or the whole thread) leaves nothing to show.
          const emptied = ids.every((id) => confirmDelete.includes(id))
          setConfirmDelete(null)
          if (emptied) onDeleted()
        }}
      />
    </div>
  )
}

function ToolbarButton({ label, shortcut, onClick, children, disabled }: { label: string; shortcut?: string; onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <Tooltip
      content={
        <span className="flex items-center gap-1.5">
          {label}
          {shortcut ? <span className="font-mono text-[11px] opacity-60">{shortcut}</span> : null}
        </span>
      }
    >
      <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} disabled={disabled}>
        {children}
      </Button>
    </Tooltip>
  )
}

const verdictPass = (status: string | null | undefined) => (status ? /^pass$/i.test(status) : null)

function MessageItem({
  message: m,
  collapsible,
  onCollapse,
  onReply,
  onStar,
  onDelete,
  onEditDraft
}: {
  message: MessageT
  collapsible: boolean
  onCollapse: () => void
  onReply: (mode: ReplyMode) => void
  onStar: () => void
  onDelete: () => void
  onEditDraft: () => void
}) {
  const [view, setView] = useState<BodyView>(() => defaultBodyView(m))
  const cancelScheduled = useCancelScheduled()
  const unsent = UNSENT.has(m.status)
  const recipients = useMemo(
    () => [...m.to.map((a) => ({ kind: "to", a })), ...m.cc.map((a) => ({ kind: "cc", a })), ...m.bcc.map((a) => ({ kind: "bcc", a }))],
    [m]
  )
  const verdicts = (["spf", "dkim", "dmarc"] as const).map((k) => ({ k, v: m.verdicts[k] })).filter((x) => x.v)
  const allPass = verdicts.length > 0 && verdicts.every((x) => verdictPass(x.v))
  const files = m.attachments.filter((a) => !a.inline)
  const failed = m.error && (m.status === "failed" || m.status === "bounced" || m.status === "complained")

  return (
    <article className="border-b border-line py-5 animate-fade-in">
      <header
        className={cn("flex items-start gap-3", collapsible && "cursor-pointer")}
        onClick={(e) => {
          if (collapsible && !(e.target as HTMLElement).closest("button,a")) onCollapse()
        }}
      >
        <SenderAvatar name={m.from.name} address={m.from.address} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="max-w-full shrink-0 truncate text-[14px] font-semibold">{m.from.name || m.from.address}</span>
            {m.from.name ? <span className="hidden min-w-0 truncate font-mono text-[12px] text-muted sm:inline">{m.from.address}</span> : null}
          </div>
          <div className="mt-0.5 truncate text-[12.5px] text-muted" title={recipients.map((r) => `${r.kind}: ${formatAddr(r.a)}`).join("\n")}>
            {recipients.length === 0
              ? "To undisclosed recipients"
              : `To ${recipients
                  .slice(0, 4)
                  .map((r) => `${r.kind === "to" ? "" : `${r.kind} `}${r.a.name || r.a.address}`)
                  .join(", ")}${recipients.length > 4 ? ` +${recipients.length - 4}` : ""}`}
          </div>
        </div>
        <div className="-mt-1 flex shrink-0 items-center">
          <span className="mr-1.5 hidden text-[12px] whitespace-nowrap text-muted tabular-nums lg:inline" title={fullDate(m.createdAt)}>
            {messageDate(m.createdAt)}
          </span>
          <span className="mr-1.5 text-[12px] whitespace-nowrap text-muted tabular-nums lg:hidden" title={fullDate(m.createdAt)}>
            {mailTime(m.createdAt)}
          </span>
          <Tooltip content={m.isStarred ? "Unstar" : "Star"}>
            <Button variant="ghost" size="icon-sm" onClick={onStar} aria-label={m.isStarred ? "Unstar" : "Star"}>
              <Star className={cn(m.isStarred && "fill-warn text-warn")} />
            </Button>
          </Tooltip>
          {m.status === "draft" ? (
            <Tooltip content="Edit draft">
              <Button variant="ghost" size="icon-sm" onClick={onEditDraft} aria-label="Edit draft">
                <Pencil />
              </Button>
            </Tooltip>
          ) : !unsent ? (
            <Tooltip content="Reply">
              <Button variant="ghost" size="icon-sm" onClick={() => onReply("reply")} aria-label="Reply">
                <Reply />
              </Button>
            </Tooltip>
          ) : null}
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Message actions">
                <MoreHorizontal />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              {m.status === "draft" ? (
                <>
                  <DropdownItem icon={<Pencil />} onSelect={onEditDraft}>
                    Edit draft
                  </DropdownItem>
                  <DropdownSeparator />
                </>
              ) : m.status === "scheduled" ? (
                <>
                  <DropdownItem icon={<Clock />} onSelect={() => cancelScheduled.mutate(m.id)}>
                    Cancel scheduled send
                  </DropdownItem>
                  <DropdownSeparator />
                </>
              ) : !unsent ? (
                <>
                  <DropdownItem icon={<Reply />} onSelect={() => onReply("reply")} shortcut="R">
                    Reply
                  </DropdownItem>
                  <DropdownItem icon={<ReplyAll />} onSelect={() => onReply("replyAll")} shortcut="A">
                    Reply all
                  </DropdownItem>
                  <DropdownItem icon={<Forward />} onSelect={() => onReply("forward")} shortcut="F">
                    Forward
                  </DropdownItem>
                  <DropdownSeparator />
                </>
              ) : null}
              <DropdownItem icon={<Copy />} onSelect={() => void copyText(m.id, "Message id copied")}>
                Copy message id
              </DropdownItem>
              {m.rfcMessageId ? (
                <DropdownItem icon={<Copy />} onSelect={() => void copyText(m.rfcMessageId!, "Message-ID copied")}>
                  Copy Message-ID header
                </DropdownItem>
              ) : null}
              <DropdownSeparator />
              <DropdownItem icon={<Trash2 />} danger onSelect={onDelete}>
                Delete message
              </DropdownItem>
            </DropdownContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="sm:pl-11">
        {(m.direction === "outbound" && !unsent) || m.isSpam || verdicts.length ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
            {m.direction === "outbound" && !unsent ? <StatusBadge status={m.status} sendAt={m.sendAt} /> : null}
            {m.isSpam ? (
              <span className="inline-flex items-center gap-1 font-medium text-danger">
                <ShieldAlert className="size-3.5" /> Marked as spam
              </span>
            ) : null}
            {verdicts.length ? (
              <span className="inline-flex items-center gap-1.5" title={verdicts.map((x) => `${x.k.toUpperCase()}: ${x.v}`).join("\n")}>
                {allPass ? <ShieldCheck className="size-3.5 text-ok" /> : <ShieldAlert className="size-3.5 text-warn" />}
                {verdicts.map(({ k, v }, i) => (
                  <span key={k} className={cn(verdictPass(v) === false && "font-medium text-danger")}>
                    {i > 0 ? <span className="mr-1.5 text-faint">·</span> : null}
                    {k.toUpperCase()} {String(v).toLowerCase()}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        ) : null}

        {failed ? (
          <div className="mt-3 flex gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span className="[overflow-wrap:anywhere]">{m.error}</span>
          </div>
        ) : null}

        {m.status === "scheduled" ? (
          <OutboxNote
            icon={<Clock />}
            tone="info"
            action={
              <Button variant="secondary" size="sm" loading={cancelScheduled.isPending} onClick={() => cancelScheduled.mutate(m.id)}>
                Cancel scheduled send
              </Button>
            }
          >
            {m.sendAt ? `Scheduled to send ${formatWhen(m.sendAt)}.` : "Scheduled to send."}
          </OutboxNote>
        ) : m.status === "pending_approval" ? (
          <OutboxNote
            icon={<ShieldAlert />}
            tone="warn"
            action={
              <Link to="/app/approvals">
                <Button variant="secondary" size="sm">
                  Review
                </Button>
              </Link>
            }
          >
            {m.heldReason ? `Held for approval: ${m.heldReason.charAt(0).toLowerCase()}${m.heldReason.slice(1)}` : "The agent's send policy is holding this message."} It goes out once a
            human approves it.
          </OutboxNote>
        ) : m.status === "rejected" ? (
          <OutboxNote icon={<AlertTriangle />} tone="danger">
            {rejectionText(m.error)}
          </OutboxNote>
        ) : m.status === "draft" ? (
          <OutboxNote
            icon={<Pencil />}
            tone="neutral"
            action={
              <Button variant="secondary" size="sm" onClick={onEditDraft}>
                <Pencil /> Edit draft
              </Button>
            }
          >
            This is an unsent draft.
          </OutboxNote>
        ) : null}

        <SecurityBanner message={m} view={view} onViewChange={setView} />

        {hasExtracted(m) ? <ExtractedPanel extracted={m.extracted} /> : null}

        <div className="mt-4">
          {view === "safe" && m.direction === "inbound" ? (
            <PlainBody text={m.safeText ?? m.text ?? ""} />
          ) : m.html ? (
            <HtmlFrame html={m.html} attachments={m.attachments} />
          ) : m.text ? (
            <PlainBody text={m.text} />
          ) : (
            <p className="text-[13px] text-muted italic">(empty message)</p>
          )}
        </div>

        {files.length ? (
          <div className="mt-5">
            <div className="mb-2 text-[12px] text-muted">
              {files.length} attachment{files.length === 1 ? "" : "s"}
            </div>
            <div className="grid items-start gap-2 sm:grid-cols-2">
              {files.map((a) => (
                <AttachmentTile key={a.id} attachment={a} quarantined={m.verdicts.virus?.toUpperCase() === "FAIL"} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  )
}

export function StatusBadge({ status, sendAt }: { status: string; sendAt?: string | null }) {
  const map: Record<string, { tone: "ok" | "warn" | "danger" | "neutral" | "info"; label: string }> = {
    sending: { tone: "warn", label: "Sending" },
    sent: { tone: "info", label: "Sent" },
    delivered: { tone: "ok", label: "Delivered" },
    bounced: { tone: "danger", label: "Bounced" },
    complained: { tone: "danger", label: "Complaint" },
    failed: { tone: "danger", label: "Failed" },
    draft: { tone: "neutral", label: "Draft" },
    scheduled: { tone: "info", label: sendAt ? `Scheduled · ${formatWhen(sendAt)}` : "Scheduled" },
    pending_approval: { tone: "warn", label: "Awaiting approval" },
    rejected: { tone: "danger", label: "Rejected" }
  }
  const s = map[status] ?? { tone: "neutral" as const, label: status }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

/** "Rejected: Looks like spam" → "Rejected: Looks like spam. It was never sent." */
const rejectionText = (error: string | null) => {
  const reason = (error ?? "Rejected by a reviewer").trim().replace(/[.!?]+$/, "")
  return `${reason}. It was never sent.`
}

function OutboxNote({ icon, tone, action, children }: { icon: ReactNode; tone: "info" | "warn" | "danger" | "neutral"; action?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3.5 py-2.5 text-[12.5px] [&>svg]:size-4 [&>svg]:shrink-0",
        tone === "info" && "border-info/20 bg-info-soft text-info",
        tone === "warn" && "border-warn/25 bg-warn-soft text-warn",
        tone === "danger" && "border-danger/20 bg-danger-soft text-danger",
        tone === "neutral" && "border-line bg-bg-subtle/60 text-muted"
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 text-ink-2 [overflow-wrap:anywhere]">{children}</span>
      {action}
    </div>
  )
}

function AttachmentTile({ attachment: a, quarantined = false }: { attachment: MessageT["attachments"][number]; quarantined?: boolean }) {
  const [open, setOpen] = useState(false)
  if (quarantined) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-danger/20 bg-danger-soft/50 p-2 pr-3" title="The mail scanner flagged this file as malware, so it was never stored.">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-danger-soft text-danger">
          <ShieldAlert className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink-2 line-through decoration-danger/40">{a.filename}</span>
          <span className="block text-[12px] text-danger">Quarantined: flagged as malware</span>
        </span>
      </div>
    )
  }
  return (
    <div className={cn("rounded-lg border border-line transition-colors", open ? "sm:col-span-2" : "hover:border-line-strong")}>
      <a href={a.downloadUrl} className="group flex items-center gap-3 p-2 pr-3 hover:bg-bg-subtle/40">
        {a.contentType.startsWith("image/") ? (
          <img src={`${a.downloadUrl}?inline=1`} alt="" className="size-9 shrink-0 rounded-md object-cover ring-1 ring-line" loading="lazy" />
        ) : (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-muted">
            <FileText className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{a.filename}</span>
          <span className="block text-[12px] text-muted">
            {formatBytes(a.size)} · {fileKind(a.filename, a.contentType)}
          </span>
        </span>
        <Download className="size-4 text-faint transition-colors group-hover:text-ink" />
      </a>
      {a.extractedText ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 border-t border-line px-3 py-1.5 text-left text-[12px] text-muted transition-colors hover:text-ink"
          >
            <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
            {open ? "Hide text preview" : "Text preview"}
          </button>
          {open ? (
            <pre className="scrollbar-thin max-h-64 overflow-auto border-t border-line bg-bg-subtle/50 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">
              {a.extractedText}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function ReaderSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] items-center border-b border-line px-3">
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-3 px-5 pt-7 sm:px-8">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-3.5 w-1/3" />
        <div className="mt-6 space-y-3 border-t border-line pt-5">
          <div className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <div className="space-y-2.5 pl-11">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  )
}
