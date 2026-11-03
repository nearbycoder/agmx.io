import { Paperclip, Star } from "lucide-react"
import { forwardRef, useEffect, useRef } from "react"
import type { MessageSummaryT } from "~/shared/api/domain"
import { SenderAvatar } from "~/components/brand"
import { copyText } from "~/components/ui/misc"
import { Skeleton } from "~/components/ui/misc"
import { cn, mailTime } from "~/lib/utils"

export interface ListRow {
  message: MessageSummaryT
  inboxAddress?: string
}

const counterparty = (m: MessageSummaryT) => {
  if (m.direction === "outbound") {
    const first = m.to[0]
    const label = first ? first.name || first.address : "(no recipients)"
    return { label: `To: ${label}${m.to.length > 1 ? ` +${m.to.length - 1}` : ""}`, name: first?.name, address: first?.address ?? "?" }
  }
  return { label: m.from.name || m.from.address, name: m.from.name, address: m.from.address }
}

const STATUS_TONE: Record<string, string> = {
  failed: "text-danger",
  bounced: "text-danger",
  complained: "text-danger",
  sending: "text-warn"
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
  const who = counterparty(m)
  const unread = !m.isRead && m.direction === "inbound"
  const code = m.extracted.codes[0]
  return (
    <div
      ref={ref}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onClick={onOpen}
      className={cn(
        "group relative flex cursor-default gap-3 border-b border-line/70 px-4 py-3 transition-colors select-none",
        active ? "bg-accent-soft/70 dark:bg-accent-soft" : focused ? "bg-bg-subtle" : "hover:bg-bg-subtle/60"
      )}
    >
      {active ? <span className="absolute inset-y-0 left-0 w-[3px] bg-ink dark:bg-accent" /> : null}
      {unread ? <span className="absolute top-[19px] left-1.5 size-1.5 rounded-full bg-ink dark:bg-accent" aria-label="Unread" /> : null}
      <div className="pt-0.5">
        <SenderAvatar name={who.name} address={who.address} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn("truncate text-[13.5px]", unread ? "font-semibold text-ink" : "font-medium text-ink-2")}>{who.label}</span>
          {m.status !== "received" && m.status !== "sent" && m.status !== "delivered" ? (
            <span className={cn("shrink-0 text-[11px] font-medium capitalize", STATUS_TONE[m.status] ?? "text-muted")}>{m.status}</span>
          ) : null}
          <span className={cn("ml-auto shrink-0 text-[11.5px] tabular-nums", unread ? "font-medium text-ink" : "text-muted")}>{mailTime(m.createdAt)}</span>
        </div>
        <div className={cn("mt-0.5 truncate text-[13px]", unread ? "font-medium text-ink" : "text-ink-2")}>{m.subject || "(no subject)"}</div>
        <div className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">{m.snippet || " "}</div>
        {code || m.labels.length || m.attachmentCount || showInbox ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {code ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  void copyText(code, `Code ${code} copied`)
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-accent/50 bg-accent-soft px-1.5 py-0.5 font-mono text-[11.5px] font-semibold tracking-wider text-accent-ink transition hover:border-accent hover:bg-accent hover:text-accent-fg"
                title="Copy verification code"
              >
                {code}
              </button>
            ) : null}
            {m.attachmentCount ? (
              <span className="inline-flex items-center gap-1 text-[11.5px] text-muted">
                <Paperclip className="size-3" />
                {m.attachmentCount}
              </span>
            ) : null}
            {m.labels.map((label) => (
              <span key={label} className="rounded-md bg-bg-subtle px-1.5 py-px text-[11px] text-ink-2 ring-1 ring-line">
                {label}
              </span>
            ))}
            {showInbox && row.inboxAddress ? <span className="truncate font-mono text-[10.5px] text-faint">{row.inboxAddress}</span> : null}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onStar()
        }}
        className={cn(
          "absolute right-3 bottom-3 rounded-md p-1 transition",
          m.isStarred ? "text-warn" : "text-faint opacity-0 group-hover:opacity-100 hover:text-ink"
        )}
        aria-label={m.isStarred ? "Unstar" : "Star"}
      >
        <Star className={cn("size-3.5", m.isStarred && "fill-current")} />
      </button>
    </div>
  )
})
MessageRow.displayName = "MessageRow"

export const ListSkeleton = () => (
  <div>
    {Array.from({ length: 8 }, (_, i) => (
      <div key={i} className="flex gap-3 border-b border-line/70 px-4 py-3.5">
        <Skeleton className="size-8 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-10" />
          </div>
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
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
