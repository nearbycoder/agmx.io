import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Forward,
  KeyRound,
  Link2,
  MailOpen,
  MoreHorizontal,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X
} from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import type { MessageT } from "~/shared/api/domain"
import { SenderAvatar } from "~/components/brand"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { ConfirmDialog } from "~/components/ui/dialog"
import { DropdownContent, DropdownItem, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "~/components/ui/menu"
import { copyText, Kbd, Skeleton } from "~/components/ui/misc"
import { useThread } from "~/lib/queries"
import { cn, formatBytes, fullDate, mailTime } from "~/lib/utils"
import { HtmlFrame, PlainBody } from "./email-body"
import { useMailActions } from "./use-mail-actions"

export type ReplyMode = "reply" | "replyAll" | "forward"

const formatAddr = (a: { name?: string | null; address: string }) => (a.name ? `${a.name} <${a.address}>` : a.address)

export function ThreadView({
  threadId,
  onClose,
  onReply,
  onDeleted,
  onArchived
}: {
  threadId: string
  onClose: () => void
  onReply: (message: MessageT, mode: ReplyMode) => void
  onDeleted: () => void
  onArchived: () => void
}) {
  const { data: thread, isLoading, error } = useThread(threadId)
  const actions = useMailActions()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const messages = thread?.messages ?? []
  const latest = messages[messages.length - 1]
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface/90 px-3 backdrop-blur">
        <Tooltip content={<span>Close <Kbd className="ml-1 h-4 border-white/20 bg-transparent text-bg/70">esc</Kbd></span>}>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close conversation">
            <ArrowLeft className="md:hidden" />
            <X className="hidden md:block" />
          </Button>
        </Tooltip>
        <div className="mx-1 h-5 w-px bg-line" />
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
        <ToolbarButton label={anySpam ? "Not spam" : "Report spam"} onClick={() => actions.update(ids, { isSpam: !anySpam })}>
          <ShieldAlert />
        </ToolbarButton>
        <ToolbarButton label="Mark unread" shortcut="U" disabled={!latestInbound} onClick={() => latestInbound && actions.update([latestInbound.id], { isRead: false })}>
          <MailOpen />
        </ToolbarButton>
        <ToolbarButton label={starred ? "Unstar" : "Star"} shortcut="S" onClick={() => latest && actions.update([latest.id], { isStarred: !starred })}>
          <Star className={cn(starred && "fill-warn text-warn")} />
        </ToolbarButton>
        <ToolbarButton label="Delete" shortcut="#" onClick={() => setConfirmDelete(true)}>
          <Trash2 />
        </ToolbarButton>
        <div className="ml-auto flex items-center gap-1">
          <span className="hidden text-[12px] text-muted tabular-nums sm:inline">
            {messages.length} message{messages.length === 1 ? "" : "s"}
          </span>
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
        <div className="mx-auto max-w-3xl px-4 pt-6 pb-10 sm:px-6">
          <h1 className="text-[21px] leading-snug font-semibold tracking-[-0.02em] text-balance">{thread.subject || "(no subject)"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {thread.participants.slice(0, 6).map((p) => (
              <span key={p.address} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-0.5 pr-2 pl-0.5 text-[11.5px] text-ink-2">
                <SenderAvatar name={p.name} address={p.address} className="size-4 text-[7px]" />
                {p.name || p.address}
              </span>
            ))}
            {thread.participants.length > 6 ? <span className="text-[11.5px] text-muted">+{thread.participants.length - 6}</span> : null}
          </div>

          <div className="mt-6 flex flex-col gap-3">
            {messages.map((m) =>
              expanded.has(m.id) ? (
                <MessageCard
                  key={m.id}
                  message={m}
                  collapsible={messages.length > 1}
                  onCollapse={() => setExpanded((s) => new Set([...s].filter((x) => x !== m.id)))}
                  onReply={(mode) => onReply(m, mode)}
                  onStar={() => actions.update([m.id], { isStarred: !m.isStarred })}
                  onDelete={() => actions.remove([m.id])}
                />
              ) : (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setExpanded((s) => new Set([...s, m.id]))}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-left shadow-card transition hover:border-line-strong"
                >
                  <SenderAvatar name={m.from.name} address={m.from.address} className="size-6 text-[9px]" />
                  <span className="w-36 shrink-0 truncate text-[13px] font-medium">{m.from.name || m.from.address}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{m.snippet}</span>
                  <span className="shrink-0 text-[11.5px] text-muted tabular-nums">{mailTime(m.createdAt)}</span>
                </button>
              )
            )}
          </div>

          {latest ? (
            <div className="mt-6 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => onReply(latestInbound ?? latest, "reply")}>
                <Reply /> Reply
              </Button>
              <Button variant="secondary" onClick={() => onReply(latestInbound ?? latest, "replyAll")}>
                <ReplyAll /> Reply all
              </Button>
              <Button variant="secondary" onClick={() => onReply(latest, "forward")}>
                <Forward /> Forward
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={messages.length > 1 ? `Delete this conversation?` : "Delete this message?"}
        description={
          messages.length > 1
            ? `All ${messages.length} messages in this thread will be permanently deleted, including attachments. This can't be undone.`
            : "The message and its attachments will be permanently deleted. This can't be undone."
        }
        confirmLabel="Delete"
        onConfirm={() => {
          actions.remove(ids)
          setConfirmDelete(false)
          onDeleted()
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
          {shortcut ? <Kbd className="h-4 min-w-4 border-white/20 bg-transparent text-[10px] text-bg/70 shadow-none">{shortcut}</Kbd> : null}
        </span>
      }
    >
      <Button variant="ghost" size="icon-sm" onClick={onClick} aria-label={label} disabled={disabled}>
        {children}
      </Button>
    </Tooltip>
  )
}

const verdictTone = (status: string | null | undefined) =>
  !status ? null : /^pass$/i.test(status) ? "ok" : /^(fail|failed)$/i.test(status) ? "danger" : "neutral"

function MessageCard({
  message: m,
  collapsible,
  onCollapse,
  onReply,
  onStar,
  onDelete
}: {
  message: MessageT
  collapsible: boolean
  onCollapse: () => void
  onReply: (mode: ReplyMode) => void
  onStar: () => void
  onDelete: () => void
}) {
  const recipients = useMemo(
    () => [
      ...m.to.map((a) => ({ kind: "to", a })),
      ...m.cc.map((a) => ({ kind: "cc", a })),
      ...m.bcc.map((a) => ({ kind: "bcc", a }))
    ],
    [m]
  )
  const verdicts = (["spf", "dkim", "dmarc"] as const).map((k) => ({ k, v: m.verdicts[k] })).filter((x) => x.v)
  const actionLinks = m.extracted.links.filter((l) => l.kind === "verify" || l.kind === "login" || l.kind === "reset").slice(0, 3)
  const showExtracted = m.direction === "inbound" && (m.extracted.codes.length > 0 || actionLinks.length > 0)

  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card animate-fade-in">
      <header
        className={cn("flex items-start gap-3 px-4 pt-4 pb-3 sm:px-5", collapsible && "cursor-pointer")}
        onClick={(e) => {
          if (collapsible && !(e.target as HTMLElement).closest("button,a")) onCollapse()
        }}
      >
        <SenderAvatar name={m.from.name} address={m.from.address} className="mt-0.5 size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[14px] font-semibold">{m.from.name || m.from.address}</span>
            {m.from.name ? <span className="truncate font-mono text-[11.5px] text-muted">{m.from.address}</span> : null}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted" title={recipients.map((r) => `${r.kind}: ${formatAddr(r.a)}`).join("\n")}>
            {recipients.length === 0
              ? "to (undisclosed recipients)"
              : recipients
                  .slice(0, 4)
                  .map((r) => `${r.kind === "to" ? "" : `${r.kind} `}${r.a.name || r.a.address}`)
                  .join(", ")
                  .replace(/^/, "to ")}
            {recipients.length > 4 ? ` +${recipients.length - 4}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <span className="mr-1 hidden text-[11.5px] text-muted tabular-nums sm:inline" title={fullDate(m.createdAt)}>
            {fullDate(m.createdAt)}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={onStar} aria-label={m.isStarred ? "Unstar" : "Star"}>
            <Star className={cn(m.isStarred && "fill-warn text-warn")} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => onReply("reply")} aria-label="Reply">
            <Reply />
          </Button>
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Message actions">
                <MoreHorizontal />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
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

      {verdicts.length || m.direction === "outbound" || m.isSpam ? (
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 sm:px-5">
          {m.direction === "outbound" ? <StatusBadge status={m.status} /> : null}
          {m.isSpam ? (
            <Badge tone="danger">
              <ShieldAlert /> Spam
            </Badge>
          ) : null}
          {verdicts.map(({ k, v }) => {
            const tone = verdictTone(v)
            return (
              <Badge key={k} tone={tone === "ok" ? "ok" : tone === "danger" ? "danger" : "neutral"} title={`${k.toUpperCase()}: ${v}`}>
                {tone === "ok" ? <ShieldCheck /> : <ShieldAlert />}
                {k.toUpperCase()} {String(v).toLowerCase()}
              </Badge>
            )
          })}
        </div>
      ) : null}

      {m.error && (m.status === "failed" || m.status === "bounced" || m.status === "complained") ? (
        <div className="mx-4 mb-3 flex gap-2 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-[12.5px] text-danger sm:mx-5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span className="[overflow-wrap:anywhere]">{m.error}</span>
        </div>
      ) : null}

      {showExtracted ? (
        <div className="mx-4 mb-4 rounded-xl border border-accent/40 bg-accent-soft/60 p-3 sm:mx-5 dark:bg-accent-soft">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-accent-ink uppercase">
            <KeyRound className="size-3.5" /> Extracted for agents
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {m.extracted.codes.map((code, i) => (
              <button
                key={code}
                type="button"
                onClick={() => void copyText(code, `Code ${code} copied`)}
                className={cn(
                  "group inline-flex items-center gap-2 rounded-lg border bg-surface px-3 py-1.5 font-mono font-semibold tracking-[0.18em] shadow-card transition hover:border-ink/30",
                  i === 0 ? "border-accent text-[16px] text-ink" : "border-line text-[13px] text-ink-2"
                )}
                title="Copy code"
              >
                {code}
                <Copy className="size-3.5 text-muted group-hover:text-ink" />
              </button>
            ))}
            {actionLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium shadow-card transition hover:border-ink/30"
                title={link.url}
              >
                {link.kind === "verify" ? <CheckCircle2 className="size-3.5 text-ok" /> : <Link2 className="size-3.5 text-muted" />}
                <span className="truncate">{link.text || (link.kind === "verify" ? "Verify" : link.kind === "login" ? "Sign in link" : "Reset link")}</span>
                <ExternalLink className="size-3 shrink-0 text-faint" />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="px-4 pb-5 sm:px-5">
        {m.html ? <HtmlFrame html={m.html} attachments={m.attachments} /> : m.text ? <PlainBody text={m.text} /> : <p className="text-sm text-muted italic">(empty message)</p>}
      </div>

      {m.attachments.filter((a) => !a.inline).length ? (
        <div className="border-t border-line bg-surface-2 px-4 py-3 sm:px-5">
          <div className="mb-2 text-[11px] font-medium tracking-wider text-faint uppercase">
            {m.attachments.filter((a) => !a.inline).length} attachment{m.attachments.filter((a) => !a.inline).length === 1 ? "" : "s"}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {m.attachments
              .filter((a) => !a.inline)
              .map((a) => (
                <a
                  key={a.id}
                  href={a.downloadUrl}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-2 pr-3 shadow-card transition hover:border-line-strong"
                >
                  {a.contentType.startsWith("image/") ? (
                    <img src={`${a.downloadUrl}?inline=1`} alt="" className="size-10 shrink-0 rounded-lg border border-line object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-muted">
                      <FileText className="size-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{a.filename}</span>
                    <span className="block text-[11.5px] text-muted">
                      {formatBytes(a.size)} · {a.contentType.split("/")[1] ?? a.contentType}
                    </span>
                  </span>
                  <Download className="size-4 text-faint transition group-hover:text-ink" />
                </a>
              ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "ok" | "warn" | "danger" | "neutral" | "info"; label: string }> = {
    sending: { tone: "warn", label: "Sending" },
    sent: { tone: "info", label: "Sent" },
    delivered: { tone: "ok", label: "Delivered" },
    bounced: { tone: "danger", label: "Bounced" },
    complained: { tone: "danger", label: "Complaint" },
    failed: { tone: "danger", label: "Failed" }
  }
  const s = map[status] ?? { tone: "neutral" as const, label: status }
  return <Badge tone={s.tone}>{s.label}</Badge>
}

function ReaderSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center border-b border-line px-3">
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-4 px-6 pt-6">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <div className="space-y-3 rounded-2xl border border-line p-5">
          <div className="flex gap-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    </div>
  )
}
