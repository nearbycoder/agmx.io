import { Link } from "@tanstack/react-router"
import { Archive, Inbox, Layers, Send, ShieldAlert, Star } from "lucide-react"
import type { AgentT } from "~/shared/api/domain"
import { AgentAvatar } from "~/components/brand"
import { cn } from "~/lib/utils"

export const FOLDERS = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "starred", label: "Starred", icon: Star },
  { id: "sent", label: "Sent", icon: Send },
  { id: "archived", label: "Archived", icon: Archive },
  { id: "spam", label: "Spam", icon: ShieldAlert },
  { id: "all", label: "All mail", icon: Layers }
] as const

export type FolderId = (typeof FOLDERS)[number]["id"]

export function FolderPane({ folder, inbox, agents }: { folder: FolderId; inbox?: string; agents: ReadonlyArray<AgentT> }) {
  const inboxes = agents.flatMap((a) => a.inboxes.map((i) => ({ ...i, agent: a })))
  const totalUnread = inboxes.reduce((s, i) => s + i.unreadCount, 0)
  const selectedUnread = inbox ? (inboxes.find((i) => i.id === inbox)?.unreadCount ?? 0) : totalUnread

  return (
    <nav className="scrollbar-thin flex h-full w-[212px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-bg-subtle/40 px-2.5 py-4">
      <div className="flex flex-col gap-px">
        {FOLDERS.map((f) => {
          const active = folder === f.id
          return (
            <Link
              key={f.id}
              to="/app/mail"
              search={(prev) => ({ inbox: prev.inbox, folder: f.id === "inbox" ? undefined : f.id })}
              className={cn(
                "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors",
                active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2/80 hover:bg-surface/70 hover:text-ink"
              )}
            >
              <f.icon className={cn("size-4", active ? "text-ink" : "text-muted group-hover:text-ink")} />
              {f.label}
              {f.id === "inbox" && selectedUnread > 0 ? (
                <span className="ml-auto rounded-full bg-accent px-1.5 py-px text-[11px] font-semibold text-accent-fg tabular-nums">{selectedUnread}</span>
              ) : null}
            </Link>
          )
        })}
      </div>

      <div className="flex flex-col gap-px">
        <div className="px-2.5 pb-1.5 text-[11px] font-medium tracking-wider text-faint uppercase">Inboxes</div>
        <Link
          to="/app/mail"
          search={(prev) => ({ folder: prev.folder })}
          className={cn(
            "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors",
            !inbox ? "bg-surface font-medium text-ink shadow-card ring-1 ring-line" : "text-ink-2/80 hover:bg-surface/70 hover:text-ink"
          )}
        >
          <span className="flex size-5 items-center justify-center rounded-md bg-ink text-bg">
            <Layers className="size-3" />
          </span>
          All inboxes
          {totalUnread > 0 ? <span className="ml-auto text-[11px] font-semibold tabular-nums">{totalUnread}</span> : null}
        </Link>
        {inboxes.map((i) => (
          <Link
            key={i.id}
            to="/app/mail"
            search={(prev) => ({ folder: prev.folder, inbox: i.id })}
            title={i.address}
            className={cn(
              "flex h-auto min-h-8 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
              inbox === i.id ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2/80 hover:bg-surface/70 hover:text-ink"
            )}
          >
            <AgentAvatar name={i.agent.name} color={i.agent.color} size="xs" />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate", inbox === i.id && "font-medium")}>{i.localPart}</span>
              <span className="block truncate font-mono text-[10.5px] text-faint">@{i.domain}</span>
            </span>
            {i.unreadCount > 0 ? <span className="text-[11px] font-semibold tabular-nums">{i.unreadCount}</span> : null}
          </Link>
        ))}
      </div>
    </nav>
  )
}
