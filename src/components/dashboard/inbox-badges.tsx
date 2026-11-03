import { useEffect, useState } from "react"
import type { InboxT } from "~/shared/api/domain"
import { cn } from "~/lib/utils"

/** "3h", "2d", "45m" until a timestamp. */
export const untilShort = (iso: string, now = Date.now()) => {
  const seconds = Math.max(0, (new Date(iso).getTime() - now) / 1000)
  if (seconds < 60) return "<1m"
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`
  return `${Math.round(seconds / 86400)}d`
}

const useNow = (intervalMs = 30_000) => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Inline status for temporary / closed / paused inboxes. Renders nothing for ordinary active inboxes. */
export const InboxStatusBadge = ({ inbox, className }: { inbox: InboxT; className?: string }) => {
  const now = useNow()
  const base = "inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11.5px] font-medium whitespace-nowrap"
  if (inbox.status === "closed")
    return <span className={cn(base, "bg-bg-subtle text-muted", className)}>Closed</span>
  if (inbox.status === "paused") return <span className={cn(base, "bg-warn-soft text-warn", className)}>Paused</span>
  if (inbox.temporary && inbox.expiresAt) {
    const expired = new Date(inbox.expiresAt).getTime() <= now
    return (
      <span className={cn(base, "bg-bg-subtle text-muted", className)} title={new Date(inbox.expiresAt).toLocaleString()}>
        Temporary · {expired ? "expiring" : `expires in ${untilShort(inbox.expiresAt, now)}`}
      </span>
    )
  }
  return null
}
