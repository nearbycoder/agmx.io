import { Paperclip, ShieldAlert, Star } from "lucide-react"
import { forwardRef, useEffect, useRef } from "react"
import type { MessageSummaryT } from "~/shared/api/domain"
import { AgentAvatar } from "~/components/brand"
import { copyText, Skeleton } from "~/components/ui/misc"
import { Tooltip } from "~/components/ui/menu"
import { cn, mailTime } from "~/lib/utils"
import { formatWhen } from "./queries"

export interface ListRow {
  message: MessageSummaryT
  inbox?: { address: string; agentName: string; color: string }
}

const counterparty = (m: MessageSummaryT) => {
  if (m.direction === "outbound") {
    const first = m.to[0]
    const label = first ? first.name || first.address : "(no recipients)"
    return `To ${label}${m.to.length > 1 ? ` +${m.to.length - 1}` : ""}`
  }
  return m.from.name || m.from.address
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  sending: { label: "Sending", tone: "text-warn" },
  failed: { label: "Failed", tone: "text-danger" },
  bounced: { label: "Bounced", tone: "text-danger" },
  complained: { label: "Complaint", tone: "text-danger" },
  draft: { label: "Draft", tone: "text-danger/90" },
  scheduled: { label: "Scheduled", tone: "text-info" },
  pending_approval: { label: "Awaiting approval", tone: "text-warn" },
  rejected: { label: "Rejected", tone: "text-danger" }
}

export const MessageRow = forwardRef<
  HTMLDivElement,
  {
    row: ListRow
    active: boolean
    focused: boolean
    showInbox: boolean
    onOpen: () => void
    onStar: () => void
  }
>(({ row, active, focused, showInbox, onOpen, onStar }, ref) => {
  const m = row.message
  const unread = !m.isRead && m.direction === "inbound"
  const code = m.extracted.codes[0]
  const status = STATUS_LABEL[m.status]
  const hasMeta = Boolean(code) || m.labels.length > 0
  const risk = m.direction === "inbound" && m.security && m.security.risk !== "low" ? m.security.risk : null
  // Drafts and scheduled mail show when they're due, not when they were created.
  const when = m.status === "scheduled" && m.sendAt ? m.sendAt : m.createdAt

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onClick={onOpen}
      className={cn(
        "group relative cursor-default border-b border-line/70 py-2.5 pr-4 pl-7 transition-colors select-none",
        active ? "bg-bg-subtle" : focused ? "bg-bg-subtle/70" : "hover:bg-bg-subtle/50"
      )}
    >
      {active ? <span className="absolute inset-y-0 left-0 w-0.5 bg-ink" /> : null}
      {unread ? <span className="absolute top-[17px] left-3 size-[7px] rounded-full bg-accent ring-2 ring-accent/25" aria-label="Unread" /> : null}

      <div className="flex items-center gap-2">
        {showInbox && row.inbox ? (
          <span title={row.inbox.address} className="flex shrink-0">
            <AgentAvatar name={row.inbox.agentName} color={row.inbox.color} size="xs" className="size-4 text-[8px]" />
          </span>
        ) : null}
        <span className={cn("min-w-0 truncate text-[13.5px]", unread ? "font-semibold text-ink" : "text-ink-2")}>{counterparty(m)}</span>
        {status ? <span className={cn("shrink-0 text-[11.5px] font-medium", status.tone)}>{status.label}</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {risk ? (
            <Tooltip content={risk === "high" ? "Hidden or manipulative content" : "Possibly manipulative content"}>
              <span className="flex" aria-label={`${risk} risk`}>
                <ShieldAlert className={cn("size-3.5", risk === "high" ? "text-danger" : "text-warn")} />
              </span>
            </Tooltip>
          ) : null}
          {m.attachmentCount ? <Paperclip className="size-3 text-faint" aria-label={`${m.attachmentCount} attachments`} /> : null}
          {m.isStarred ? <Star className="size-3 fill-warn text-warn" aria-label="Starred" /> : null}
          <span className={cn("text-[12px] tabular-nums", unread ? "font-medium text-ink" : "text-muted", m.status === "scheduled" && "text-info")} title={m.status === "scheduled" ? `Sends ${formatWhen(when)}` : undefined}>
            {mailTime(when)}
          </span>
        </span>
      </div>

      <p className="mt-0.5 truncate text-[13px]">
        <span className={unread ? "font-medium text-ink" : "text-ink-2"}>{m.subject || "(no subject)"}</span>
        {m.snippet ? <span className="text-muted"> — {m.snippet}</span> : null}
      </p>
      {!m.isStarred ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onStar()
          }}
          className={cn(
            "absolute right-3 bottom-2 rounded-md p-1 text-faint opacity-0 transition hover:text-ink focus-visible:opacity-100 group-hover:opacity-100",
            active ? "bg-bg-subtle" : focused ? "bg-bg-subtle" : "bg-surface group-hover:bg-[color-mix(in_srgb,var(--bg-subtle)_50%,var(--surface))]"
          )}
          aria-label="Star"
        >
          <Star className="size-3.5" />
        </button>
      ) : null}

      {hasMeta ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {code ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void copyText(code, `Code ${code} copied`)
              }}
              className="inline-flex h-5 items-center rounded-md bg-accent-soft px-1.5 font-mono text-[11.5px] font-medium tracking-wide text-accent-ink ring-1 ring-accent/40 transition hover:ring-accent"
              title="Copy verification code"
            >
              {code}
            </button>
          ) : null}
          {m.labels.map((label) => (
            <span key={label} className="inline-flex h-5 items-center rounded-md px-1.5 text-[11.5px] text-muted ring-1 ring-line">
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
})
MessageRow.displayName = "MessageRow"

export const ListSkeleton = () => (
  <div>
    {Array.from({ length: 10 }, (_, i) => (
      <div key={i} className="space-y-2 border-b border-line/70 py-3 pr-4 pl-7">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-10" />
        </div>
        <Skeleton className="h-3 w-4/5" />
      </div>
    ))}
  </div>
)

/** Fires `onVisible` whenever the sentinel scrolls into view (infinite scroll). */
export function LoadMoreSentinel({ onVisible, disabled }: { onVisible: () => void; disabled: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || disabled) return
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onVisible(), { rootMargin: "200px" })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onVisible, disabled])
  return <div ref={ref} className="h-1" />
}
