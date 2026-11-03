import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { Bot, ChevronDown, Inbox, Keyboard, MailCheck, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { MessageSummaryT, MessageT } from "~/shared/api/domain"
import { useCompose } from "~/components/app/compose-context"
import { AgentAvatar } from "~/components/brand"
import { FolderPane, FOLDERS, type FolderId } from "~/components/mail/folder-pane"
import { ListSkeleton, LoadMoreSentinel, MessageRow } from "~/components/mail/message-list"
import { ShortcutsDialog } from "~/components/mail/shortcuts"
import { ThreadView, type ReplyMode } from "~/components/mail/thread-view"
import { matchesFolder, useMailActions } from "~/components/mail/use-mail-actions"
import { Button } from "~/components/ui/button"
import { ConfirmDialog } from "~/components/ui/dialog"
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "~/components/ui/menu"
import { EmptyState, Kbd } from "~/components/ui/misc"
import { useAgents, useMessages, useThread } from "~/lib/queries"
import { cn } from "~/lib/utils"

export interface MailSearch {
  inbox?: string
  folder?: "inbox" | "sent" | "starred" | "archived" | "spam" | "all"
  q?: string
  /** Selected thread id. */
  t?: string
}

const FOLDER_IDS = ["inbox", "sent", "starred", "archived", "spam", "all"] as const

export const Route = createFileRoute("/app/mail")({
  validateSearch: (search: Record<string, unknown>): MailSearch => ({
    inbox: typeof search.inbox === "string" ? search.inbox : undefined,
    folder: FOLDER_IDS.includes(search.folder as (typeof FOLDER_IDS)[number]) ? (search.folder as MailSearch["folder"]) : undefined,
    q: typeof search.q === "string" && search.q ? search.q : undefined,
    t: typeof search.t === "string" ? search.t : undefined
  }),
  head: () => ({ meta: [{ title: "Mail — AGMX" }] }),
  component: MailPage
})

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

const EMPTY_COPY: Record<FolderId, { title: string; description: string }> = {
  inbox: { title: "Inbox zero", description: "Nothing waiting. New mail for your agents shows up here instantly." },
  starred: { title: "No starred mail", description: "Star important messages with S to find them here." },
  sent: { title: "Nothing sent yet", description: "Messages your agents send — via API, MCP or the composer — land here." },
  archived: { title: "Archive is empty", description: "Archived messages are kept here, out of the inbox." },
  spam: { title: "No spam", description: "Messages flagged by SES spam/virus checks or by you appear here." },
  all: { title: "No mail yet", description: "Every message across folders shows up here." }
}

function MailPage() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const folder: FolderId = search.folder ?? "inbox"
  const compose = useCompose()
  const actions = useMailActions()
  const { data: agents, isLoading: agentsLoading } = useAgents()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [query, setQuery] = useState(search.q ?? "")
  const [cursor, setCursor] = useState(0)
  const [keyboardNav, setKeyboardNav] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ReadonlyArray<string> | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const rowRefs = useRef(new Map<string, HTMLDivElement>())

  const messages = useMessages({ inboxId: search.inbox, folder, q: search.q, unread: unreadOnly ? "true" : undefined })
  const { data: thread } = useThread(search.t)

  const inboxMap = useMemo(() => {
    const map = new Map<string, { address: string; agentName: string; color: string }>()
    for (const a of agents ?? []) for (const i of a.inboxes) map.set(i.id, { address: i.address, agentName: a.name, color: a.color })
    return map
  }, [agents])
  const selectedInbox = search.inbox ? inboxMap.get(search.inbox) : undefined
  const hasInboxes = (agents ?? []).some((a) => a.inboxes.length > 0)

  const rows = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<MessageSummaryT> = []
    for (const page of messages.data?.pages ?? []) {
      for (const m of page.messages) {
        if (seen.has(m.id) || !matchesFolder(m, folder) || (unreadOnly && m.isRead)) continue
        seen.add(m.id)
        out.push(m)
      }
    }
    return out
  }, [messages.data, folder, unreadOnly])

  // Debounced search → URL.
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((query.trim() || undefined) !== search.q) void navigate({ search: (prev) => ({ ...prev, q: query.trim() || undefined }), replace: true })
    }, 250)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  // Keep the keyboard cursor on the open conversation.
  useEffect(() => {
    if (!search.t) return
    const index = rows.findIndex((r) => r.threadId === search.t)
    if (index >= 0) setCursor(index)
  }, [search.t, rows])

  useEffect(() => {
    if (cursor >= rows.length && rows.length > 0) setCursor(rows.length - 1)
  }, [rows.length, cursor])

  const focused = rows[cursor]
  useEffect(() => {
    if (focused) rowRefs.current.get(focused.id)?.scrollIntoView({ block: "nearest" })
  }, [focused])

  const openThread = useCallback((threadId: string | undefined) => void navigate({ search: (prev) => ({ ...prev, t: threadId }) }), [navigate])

  const openReply = useCallback(
    (message: Pick<MessageT, "id" | "subject" | "snippet" | "from" | "inboxId" | "direction" | "to"> & { text?: string | null }, mode: ReplyMode) => {
      const inbox = inboxMap.get(message.inboxId)
      const sender = message.direction === "inbound" ? message.from : message.to[0]
      compose.open({
        from: inbox?.address,
        to: mode === "forward" ? "" : sender ? (sender.name ? `${sender.name} <${sender.address}>` : sender.address) : "",
        replyTo: {
          messageId: message.id,
          mode,
          subject: message.subject,
          quoted: (message.text ?? message.snippet ?? "").slice(0, 2000)
        }
      })
    },
    [compose, inboxMap]
  )

  /** The messages keyboard actions apply to: the whole open thread, or the focused row. */
  const targetIds = useCallback((): ReadonlyArray<string> => {
    if (search.t && thread && thread.id === search.t) return thread.messages.map((m) => m.id)
    return focused ? [focused.id] : []
  }, [search.t, thread, focused])

  const targetMessage = useCallback(() => {
    if (search.t && thread && thread.id === search.t && thread.messages.length) {
      const msgs = thread.messages
      return [...msgs].reverse().find((m) => m.direction === "inbound") ?? msgs[msgs.length - 1]!
    }
    return focused
  }, [search.t, thread, focused])

  const advanceAfterRemoval = useCallback(() => {
    if (!search.t) return
    const next = rows[cursor + 1] ?? rows[cursor - 1]
    openThread(next && next.threadId !== search.t ? next.threadId : undefined)
  }, [search.t, rows, cursor, openThread])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      const move = (delta: number) => {
        e.preventDefault()
        setKeyboardNav(true)
        const next = Math.min(Math.max(cursor + delta, 0), rows.length - 1)
        setCursor(next)
        if (search.t && rows[next]) openThread(rows[next]!.threadId)
      }
      switch (e.key) {
        case "j":
        case "ArrowDown":
          return move(1)
        case "k":
        case "ArrowUp":
          return move(-1)
        case "o":
        case "Enter":
          if (focused) {
            e.preventDefault()
            openThread(focused.threadId)
          }
          return
        case "Escape":
          if (search.t) {
            e.preventDefault()
            openThread(undefined)
          }
          return
        case "/":
          e.preventDefault()
          searchRef.current?.focus()
          return
        case "?":
          e.preventDefault()
          setHelpOpen(true)
          return
        case "e": {
          const ids = targetIds()
          if (!ids.length) return
          e.preventDefault()
          const archive = folder !== "archived"
          actions.update(ids, { isArchived: archive })
          advanceAfterRemoval()
          return
        }
        case "s": {
          const m = targetMessage()
          if (!m) return
          e.preventDefault()
          actions.update([m.id], { isStarred: !m.isStarred })
          return
        }
        case "u": {
          const m = targetMessage()
          if (!m || m.direction !== "inbound") return
          e.preventDefault()
          actions.update([m.id], { isRead: false })
          if (search.t) openThread(undefined)
          return
        }
        case "r":
        case "a":
        case "f": {
          const m = targetMessage()
          if (!m) return
          e.preventDefault()
          openReply(m, e.key === "r" ? "reply" : e.key === "a" ? "replyAll" : "forward")
          return
        }
        case "#": {
          const ids = targetIds()
          if (!ids.length) return
          e.preventDefault()
          setPendingDelete(ids)
          return
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cursor, rows, focused, search.t, folder, actions, openThread, openReply, targetIds, targetMessage, advanceAfterRemoval])

  const folderMeta = FOLDERS.find((f) => f.id === folder)!

  if (!agentsLoading && !hasInboxes) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<Bot />}
          title="No inboxes yet"
          description="Create an agent and give it an address like scout@bot.agmx.io. Its mail will show up here in real time."
          action={
            <Link to="/app/agents" search={{ new: true }}>
              <Button>
                <Bot /> Create your first agent
              </Button>
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="hidden xl:flex">
        <FolderPane folder={folder} inbox={search.inbox} agents={agents ?? []} />
      </div>

      {/* Message list */}
      <section
        className={cn(
          "flex min-h-0 w-full flex-col border-r border-line bg-surface md:w-[360px] md:shrink-0 lg:w-[400px]",
          search.t ? "hidden md:flex" : "flex"
        )}
      >
        <div className="shrink-0 border-b border-line px-4 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownTrigger asChild>
                <button className="-ml-1.5 flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-bg-subtle xl:pointer-events-none">
                  {selectedInbox ? (
                    <AgentAvatar name={selectedInbox.agentName} color={selectedInbox.color} size="sm" />
                  ) : (
                    <folderMeta.icon className="size-4 text-muted" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] leading-tight font-semibold tracking-tight">{folderMeta.label}</span>
                    <span className="block truncate font-mono text-[11px] text-muted">{selectedInbox?.address ?? "All inboxes"}</span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-faint xl:hidden" />
                </button>
              </DropdownTrigger>
              <DropdownContent align="start" className="w-64">
                <DropdownLabel>Folder</DropdownLabel>
                {FOLDERS.map((f) => (
                  <DropdownItem key={f.id} icon={<f.icon />} onSelect={() => void navigate({ search: (prev) => ({ ...prev, folder: f.id === "inbox" ? undefined : f.id, t: undefined }) })}>
                    {f.label}
                  </DropdownItem>
                ))}
                <DropdownSeparator />
                <DropdownLabel>Inbox</DropdownLabel>
                <DropdownItem icon={<Inbox />} onSelect={() => void navigate({ search: (prev) => ({ ...prev, inbox: undefined, t: undefined }) })}>
                  All inboxes
                </DropdownItem>
                {[...inboxMap.entries()].map(([id, i]) => (
                  <DropdownItem key={id} icon={<AgentAvatar name={i.agentName} color={i.color} size="xs" />} onSelect={() => void navigate({ search: (prev) => ({ ...prev, inbox: id, t: undefined }) })}>
                    <span className="font-mono text-[12px]">{i.address}</span>
                  </DropdownItem>
                ))}
              </DropdownContent>
            </DropdownMenu>
            <div className="ml-auto flex items-center gap-0.5">
              <Tooltip content={unreadOnly ? "Showing unread only" : "Show unread only"}>
                <Button variant="ghost" size="icon-sm" onClick={() => setUnreadOnly((v) => !v)} aria-pressed={unreadOnly} className={cn(unreadOnly && "bg-accent-soft text-accent-ink")}>
                  {unreadOnly ? <MailCheck /> : <SlidersHorizontal />}
                </Button>
              </Tooltip>
              <Tooltip content="Refresh">
                <Button variant="ghost" size="icon-sm" onClick={() => void messages.refetch()} aria-label="Refresh">
                  <RefreshCw className={cn(messages.isFetching && !messages.isFetchingNextPage && "animate-spin")} />
                </Button>
              </Tooltip>
              <Tooltip content="Keyboard shortcuts (?)">
                <Button variant="ghost" size="icon-sm" onClick={() => setHelpOpen(true)} aria-label="Keyboard shortcuts" className="hidden md:inline-flex">
                  <Keyboard />
                </Button>
              </Tooltip>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setQuery("")
                  e.currentTarget.blur()
                }
              }}
              placeholder="Search mail"
              className="h-9 w-full rounded-[10px] border border-line bg-surface-2 pr-9 pl-9 text-[13px] outline-none transition placeholder:text-faint focus:border-ink/30 focus:bg-surface focus:ring-4 focus:ring-ink/5 dark:focus:border-accent/50 dark:focus:ring-accent/10"
            />
            {query ? (
              <button onClick={() => setQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-faint hover:text-ink" aria-label="Clear search">
                <X className="size-3.5" />
              </button>
            ) : (
              <Kbd className="absolute top-1/2 right-2.5 -translate-y-1/2">/</Kbd>
            )}
          </div>
        </div>

        <div role="listbox" aria-label="Messages" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
          {messages.isLoading ? (
            <ListSkeleton />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={search.q ? <Search /> : <folderMeta.icon />}
              title={search.q ? "No matches" : unreadOnly ? "All caught up" : EMPTY_COPY[folder].title}
              description={search.q ? `Nothing matches “${search.q}”. Try a sender, subject or a word from the body.` : unreadOnly ? "No unread messages here." : EMPTY_COPY[folder].description}
            />
          ) : (
            <>
              {rows.map((m, i) => (
                <MessageRow
                  key={m.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(m.id, el)
                    else rowRefs.current.delete(m.id)
                  }}
                  row={{ message: m, inboxAddress: inboxMap.get(m.inboxId)?.address }}
                  active={m.threadId === search.t}
                  focused={keyboardNav && i === cursor}
                  showInbox={!search.inbox && inboxMap.size > 1}
                  onOpen={() => {
                    setCursor(i)
                    openThread(m.threadId)
                  }}
                  onStar={() => actions.update([m.id], { isStarred: !m.isStarred })}
                />
              ))}
              <LoadMoreSentinel onVisible={() => void messages.fetchNextPage()} disabled={!messages.hasNextPage || messages.isFetchingNextPage} />
              <div className="py-5 text-center text-[11.5px] text-faint">
                {messages.isFetchingNextPage ? "Loading more…" : messages.hasNextPage ? "" : `${rows.length} message${rows.length === 1 ? "" : "s"}`}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Reader */}
      <section className={cn("min-h-0 min-w-0 flex-1 bg-bg", search.t ? "flex flex-col" : "hidden md:flex md:flex-col")}>
        {search.t ? (
          <ThreadView
            key={search.t}
            threadId={search.t}
            onClose={() => openThread(undefined)}
            onReply={openReply}
            onDeleted={advanceAfterRemoval}
            onArchived={advanceAfterRemoval}
          />
        ) : (
          <NothingSelected count={rows.length} onHelp={() => setHelpOpen(true)} />
        )}
      </section>

      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={pendingDelete && pendingDelete.length > 1 ? "Delete this conversation?" : "Delete this message?"}
        description="This permanently deletes the mail and its attachments. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingDelete) actions.remove(pendingDelete)
          setPendingDelete(null)
          advanceAfterRemoval()
        }}
      />
    </div>
  )
}

function NothingSelected({ count, onHelp }: { count: number; onHelp: () => void }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden p-8 text-center">
      <div className="dot-bg absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      <div className="relative">
        <div className="relative mx-auto mb-6 h-32 w-44">
          <div className="absolute inset-x-4 top-3 h-20 rotate-[-6deg] rounded-xl border border-line bg-surface-2 shadow-card" />
          <div className="absolute inset-x-2 top-1.5 h-20 rotate-[4deg] rounded-xl border border-line bg-surface shadow-card" />
          <div className="absolute inset-0 top-0 h-[104px] rounded-xl border border-line bg-surface p-3 text-left shadow-pop">
            <div className="flex items-center gap-2">
              <span className="size-5 rounded-full bg-accent" />
              <span className="h-2 w-16 rounded-full bg-line-strong" />
            </div>
            <div className="mt-3 h-2 w-full rounded-full bg-line" />
            <div className="mt-2 h-2 w-3/4 rounded-full bg-line" />
            <div className="mt-3 inline-flex rounded-md border border-accent/50 bg-accent-soft px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-widest text-accent-ink">482913</div>
          </div>
        </div>
        <h2 className="text-[15px] font-semibold">{count ? "Select a conversation" : "Waiting for mail"}</h2>
        <p className="mx-auto mt-1 max-w-xs text-[13px] leading-relaxed text-muted">
          {count ? "Pick a message to read it. Verification codes and links are extracted automatically." : "Point an agent at its address — new mail streams in live."}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[12px] text-muted">
          <span className="flex items-center gap-1.5">
            <Kbd>j</Kbd>
            <Kbd>k</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>c</Kbd> compose
          </span>
          <button onClick={onHelp} className="flex items-center gap-1.5 hover:text-ink">
            <Kbd>?</Kbd> all shortcuts
          </button>
        </div>
      </div>
    </div>
  )
}
