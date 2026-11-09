import { Link } from "@tanstack/react-router"
import { Archive, Clock, FileText, Inbox, Layers, Send, ShieldAlert, ShieldQuestion, Star } from "lucide-react"
import type { AgentT } from "~/shared/api/domain"
import { AgentAvatar } from "~/components/brand"
import { cn } from "~/lib/utils"
import { useFolderCounts } from "./queries"

export const FOLDERS = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "drafts", label: "Drafts", icon: FileText },
  { id: "scheduled", label: "Scheduled", icon: Clock },
  { id: "pending", label: "Held", icon: ShieldQuestion },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "spam", label: "Spam", icon: ShieldAlert },
  { id: "all", label: "All mail", icon: Layers }
] as const

export type FolderId = (typeof FOLDERS)[number]["id"]

const rowClass = (active: boolean) =>
  cn(
    "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
    active ? "bg-bg-subtle font-medium text-ink" : "text-ink-2 hover:bg-bg-subtle/60 hover:text-ink"
  )

const Count = ({ value, strong, tone, capped }: { value: number; strong?: boolean; tone?: "warn"; capped?: number }) =>
  value > 0 ? (
    <span className={cn("ml-auto text-[12px] tabular-nums", tone === "warn" ? "font-semibold text-warn" : strong ? "font-semibold text-ink" : "text-muted")}>
      {capped && value >= capped ? `${capped}+` : value}
    </span>
  ) : null

export function FolderPane({ folder, inbox, agents }: { folder: FolderId; inbox?: string; agents: ReadonlyArray<AgentT> }) {
  const inboxes = agents.flatMap((a) => a.inboxes.map((i) => ({ ...i, agent: a })))
  const totalUnread = inboxes.reduce((s, i) => s + i.unreadCount, 0)
  const selectedUnread = inbox ? (inboxes.find((i) => i.id === inbox)?.unreadCount ?? 0) : totalUnread
  const counts = useFolderCounts(inbox)

  return (
    <nav aria-label="Mail folders" className="scrollbar-thin flex h-full w-[228px] shrink-0 flex-col overflow-y-auto border-r border-line bg-bg px-3 py-4">
      <div className="flex flex-col gap-px">
        {FOLDERS.map((f) => {
          const active = folder === f.id
          return (
            <Link
              key={f.id}
              to="/app/mail"
              search={(prev) => ({ inbox: prev.inbox, q: prev.q, folder: f.id === "inbox" ? undefined : f.id })}
              className={rowClass(active)}
            >
              <f.icon className={cn("size-4", active ? "text-ink" : "text-muted group-hover:text-ink-2")} />
              {f.label}
              {f.id === "inbox" ? <Count value={selectedUnread} strong /> : null}
              {f.id === "drafts" ? <Count value={counts.drafts} capped={counts.capped} /> : null}
              {f.id === "pending" ? <Count value={counts.pending} tone="warn" capped={counts.capped} /> : null}
            </Link>
          )
        })}
      </div>

      <div className="mt-6 mb-1.5 px-2.5 text-[11px] font-medium tracking-[0.08em] text-faint uppercase">Inboxes</div>
      <div className="flex flex-col gap-px">
        <Link to="/app/mail" search={(prev) => ({ folder: prev.folder, q: prev.q })} className={rowClass(!inbox)}>
          <span className="flex size-5 items-center justify-center rounded-[28%] bg-bg-subtle text-muted ring-1 ring-line">
            <Layers className="size-3" />
          </span>
          All inboxes
          <Count value={totalUnread} strong={!inbox} />
        </Link>
        {inboxes.map((i) => {
          const active = inbox === i.id
          return (
            <Link key={i.id} to="/app/mail" search={(prev) => ({ folder: prev.folder, q: prev.q, inbox: i.id })} title={i.address} className={rowClass(active)}>
              <AgentAvatar name={i.agent.name} color={i.agent.color} size="xs" />
              <span className="min-w-0 flex-1 truncate">
                {i.localPart}
                <span className="text-[12px] font-normal text-faint">@{i.domain}</span>
              </span>
              <Count value={i.unreadCount} strong={active || i.unreadCount > 0} />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
