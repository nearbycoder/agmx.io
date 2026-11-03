import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import * as AlertPrimitive from "@radix-ui/react-alert-dialog"
import { AlertCircle, CalendarClock, ChevronDown, ChevronUp, Clock, FileText, Forward, Maximize2, Minimize2, Paperclip, Reply, ReplyAll, Save, Send, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react"
import { toast } from "sonner"
import { parseAddress } from "~/shared/address"
import { AgentAvatar } from "~/components/brand"
import { Button } from "~/components/ui/button"
import { ConfirmDialog } from "~/components/ui/dialog"
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "~/components/ui/menu"
import { api, ApiFailure } from "~/lib/api"
import { qk, useAgents } from "~/lib/queries"
import { cn, formatBytes } from "~/lib/utils"
import { useCompose, type ComposeDraft } from "./compose-context"

const MAX_TOTAL_BYTES = 10 * 1024 * 1024

interface FileDraft {
  id: string
  filename: string
  contentType: string
  size: number
  content: string
}

const readBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

/** Next occurrence of `hour`:00 local time, `days` from today (0 = today if still ahead). */
const atHour = (days: number, hour: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d
}

const nextMonday9 = () => {
  const now = new Date()
  const days = ((8 - now.getDay()) % 7) || 7
  return atHour(days, 9)
}

const schedulePresets = () => [
  { label: "In 1 hour", at: new Date(Date.now() + 60 * 60_000) },
  { label: "Tomorrow morning", at: atHour(1, 9) },
  { label: "Monday morning", at: nextMonday9() }
]

const whenLabel = (d: Date) => d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

/** `datetime-local` value for a Date, in local time. */
const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const splitRecipients = (value: string | undefined) =>
  (value ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)

/** Floating composer (Gmail-style). Opened from anywhere through `useCompose()`. */
export const ComposeWindow = () => {
  const { draft, close } = useCompose()
  if (!draft) return null
  return <ComposePanel key={JSON.stringify(draft)} draft={draft} onClose={close} />
}

function ComposePanel({ draft, onClose }: { draft: ComposeDraft; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currentInbox = useRouterState({ select: (s) => (s.location.search as { inbox?: string }).inbox })
  const { data: agents } = useAgents()
  const inboxes = useMemo(() => (agents ?? []).flatMap((a) => a.inboxes.map((i) => ({ ...i, agent: a }))), [agents])
  // Saved drafts always edit as a full message; their thread and headers are kept server-side.
  const mode = draft.draftId ? "new" : (draft.replyTo?.mode ?? "new")
  const isReply = mode === "reply" || mode === "replyAll"
  const canSaveDraft = mode !== "forward"
  // One key per compose session: a double-click or retry can never send twice.
  const idempotencyKey = useMemo(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), [])

  const [from, setFrom] = useState(draft.from ?? "")
  const [to, setTo] = useState<Array<string>>(isReply ? [] : splitRecipients(draft.to))
  const [cc, setCc] = useState<Array<string>>(splitRecipients(draft.cc))
  const [bcc, setBcc] = useState<Array<string>>(splitRecipients(draft.bcc))
  const [showCc, setShowCc] = useState(Boolean(draft.cc))
  const [showBcc, setShowBcc] = useState(Boolean(draft.bcc))
  const [subject, setSubject] = useState(
    draft.replyTo
      ? isReply
        ? /^re:/i.test(draft.replyTo.subject)
          ? draft.replyTo.subject
          : `Re: ${draft.replyTo.subject}`
        : /^fwd?:/i.test(draft.replyTo.subject)
          ? draft.replyTo.subject
          : `Fwd: ${draft.replyTo.subject}`
      : (draft.subject ?? "")
  )
  const [body, setBody] = useState(draft.text ?? "")
  const [files, setFiles] = useState<Array<FileDraft>>([])
  const [minimized, setMinimized] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [showQuoted, setShowQuoted] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [picking, setPicking] = useState(false)
  const [customAt, setCustomAt] = useState(() => toLocalInput(atHour(1, 9)))
  const [error, setError] = useState<string | null>(null)
  const existingAttachments = draft.attachmentNames ?? []
  const fileInput = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const toRef = useRef<HTMLInputElement>(null)

  // Default sender: explicit draft → inbox being viewed → first inbox.
  useEffect(() => {
    if (from || inboxes.length === 0) return
    const viewing = inboxes.find((i) => i.id === currentInbox)
    setFrom((viewing ?? inboxes[0]!).address)
  }, [inboxes, currentInbox, from])

  useEffect(() => {
    if (isReply) bodyRef.current?.focus()
    else if (to.length === 0) toRef.current?.focus()
    else bodyRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dirty =
    body.trim() !== (draft.text ?? "").trim() ||
    files.length > 0 ||
    (!draft.replyTo &&
      (subject !== (draft.subject ?? "") ||
        to.join() !== splitRecipients(draft.to).join() ||
        cc.join() !== splitRecipients(draft.cc).join() ||
        bcc.join() !== splitRecipients(draft.bcc).join()))
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  const fromInbox = inboxes.find((i) => i.address === from)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["messages"] })
    void queryClient.invalidateQueries({ queryKey: ["thread"] })
    void queryClient.invalidateQueries({ queryKey: qk.inboxes })
    void queryClient.invalidateQueries({ queryKey: qk.agents })
    void queryClient.invalidateQueries({ queryKey: qk.me })
  }

  const attachmentPayload = () => {
    const list = files.map((f) => ({ filename: f.filename, contentType: f.contentType, content: f.content }))
    return list.length ? list : undefined
  }

  /** The editable fields of a saved draft, as the drafts API expects them. */
  const draftFields = () => ({ from, to, cc, bcc, subject, text: body, attachments: attachmentPayload() })

  const send = useMutation({
    mutationFn: async (sendAt: string | undefined) => {
      if (draft.draftId) {
        const id = draft.draftId
        await api((c) => c.drafts.update({ params: { messageId: id }, payload: draftFields() }))
        return api((c) => c.drafts.send({ params: { messageId: id }, payload: { sendAt } }))
      }
      if (draft.replyTo && isReply) {
        return api((c) =>
          c.messages.reply({
            params: { messageId: draft.replyTo!.messageId },
            payload: { text: body, replyAll: mode === "replyAll", attachments: attachmentPayload(), sendAt, idempotencyKey }
          })
        )
      }
      if (draft.replyTo && mode === "forward") {
        return api((c) => c.messages.forward({ params: { messageId: draft.replyTo!.messageId }, payload: { to, text: body || undefined, sendAt, idempotencyKey } }))
      }
      return api((c) =>
        c.messages.send({
          payload: {
            from,
            to,
            cc: cc.length ? cc : undefined,
            bcc: bcc.length ? bcc : undefined,
            subject,
            text: body,
            attachments: attachmentPayload(),
            sendAt,
            idempotencyKey
          }
        })
      )
    },
    onSuccess: (message) => {
      refresh()
      const folder = message.status === "scheduled" ? "scheduled" : message.status === "pending_approval" ? "pending" : "sent"
      const view = { label: "View", onClick: () => void navigate({ to: "/app/mail", search: { folder, t: message.threadId } }) }
      if (message.status === "scheduled") toast.success(message.sendAt ? `Scheduled for ${whenLabel(new Date(message.sendAt))}` : "Scheduled", { description: message.subject || undefined, action: view })
      else if (message.status === "pending_approval") toast("Waiting for approval", { description: "This agent's send policy holds the message until a human approves it.", action: view })
      else if (message.status === "failed") toast.error("Message failed to send", { description: message.error ?? undefined, action: view })
      else toast.success("Sent", { description: message.subject || undefined, action: view })
      onClose()
    },
    onError: (e) => {
      if (e instanceof ApiFailure && e.tag === "QuotaExceeded") setError(`Quota reached — ${e.message}`)
      else setError(e instanceof Error ? e.message : "Couldn't send the message.")
    }
  })

  const saveDraft = useMutation({
    mutationFn: async () => {
      if (draft.draftId) {
        const id = draft.draftId
        return api((c) => c.drafts.update({ params: { messageId: id }, payload: draftFields() }))
      }
      if (draft.replyTo && isReply) {
        return api((c) =>
          c.drafts.create({ payload: { replyToMessageId: draft.replyTo!.messageId, replyAll: mode === "replyAll", text: body, attachments: attachmentPayload() } })
        )
      }
      return api((c) =>
        c.drafts.create({ payload: { from: from || undefined, to, cc, bcc, subject, text: body, attachments: attachmentPayload() } })
      )
    },
    onSuccess: () => {
      refresh()
      toast.success("Draft saved", { action: { label: "Drafts", onClick: () => void navigate({ to: "/app/mail", search: { folder: "drafts" } }) } })
      onClose()
    },
    onError: (e) => {
      setConfirmDiscard(false)
      setError(e instanceof Error ? e.message : "Couldn't save the draft.")
    }
  })

  const validate = () => {
    setError(null)
    if (!isReply) {
      const all = [...to, ...cc, ...bcc]
      if (to.length === 0) return setError("Add at least one recipient."), false
      const bad = all.filter((r) => !parseAddress(r))
      if (bad.length) return setError(`Invalid address: ${bad.join(", ")}`), false
    }
    if (mode === "new" && !from) return setError("Choose an inbox to send from."), false
    if (!body.trim() && files.length === 0 && existingAttachments.length === 0 && mode !== "forward") return setError("Write a message or attach a file."), false
    return true
  }

  const submit = (sendAt?: Date) => {
    if (send.isPending || !validate()) return
    if (sendAt && sendAt.getTime() <= Date.now() + 30_000) return setError("Pick a time in the future.")
    setPicking(false)
    send.mutate(sendAt?.toISOString())
  }

  const busy = send.isPending || saveDraft.isPending
  const requestClose = () => (dirty && !busy ? setConfirmDiscard(true) : onClose())

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault()
      submit()
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s" && canSaveDraft) {
      e.preventDefault()
      if (!busy) saveDraft.mutate()
    } else if (e.key === "Escape" && !confirmDiscard) {
      e.preventDefault()
      e.stopPropagation()
      requestClose()
    }
  }

  const addFiles = async (list: FileList | null) => {
    if (!list) return
    const incoming = [...list]
    const size = incoming.reduce((s, f) => s + f.size, totalBytes)
    if (size > MAX_TOTAL_BYTES) {
      setError(`Attachments can total at most ${formatBytes(MAX_TOTAL_BYTES)}.`)
      return
    }
    const next = await Promise.all(
      incoming.map(async (f) => ({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`,
        filename: f.name,
        contentType: f.type || "application/octet-stream",
        size: f.size,
        content: await readBase64(f)
      }))
    )
    setFiles((cur) => [...cur, ...next])
  }

  const title = draft.draftId ? "Draft" : mode === "reply" ? "Reply" : mode === "replyAll" ? "Reply all" : mode === "forward" ? "Forward" : "New message"
  const TitleIcon = draft.draftId ? FileText : mode === "reply" ? Reply : mode === "replyAll" ? ReplyAll : mode === "forward" ? Forward : Send

  return (
    <>
      <div
        role="region"
        aria-label={title}
        onKeyDown={onKeyDown}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void addFiles(e.dataTransfer.files)
        }}
        className={cn(
          "fixed z-40 flex flex-col overflow-hidden bg-surface shadow-pop animate-pop sm:border sm:border-line",
          minimized
            ? "right-4 bottom-0 h-11 w-[300px] rounded-t-xl border border-line sm:right-6"
            : expanded
              ? "inset-0 sm:inset-x-[8vw] sm:top-[6vh] sm:bottom-[6vh] sm:rounded-xl"
              : "inset-0 sm:inset-auto sm:right-6 sm:bottom-4 sm:h-[min(600px,calc(100dvh-2rem))] sm:w-[560px] sm:rounded-xl"
        )}
      >
        <div
          className={cn("flex h-11 shrink-0 cursor-default items-center gap-2 border-b border-line bg-bg-subtle/60 pr-2 pl-4", minimized && "border-0")}
          onClick={() => minimized && setMinimized(false)}
        >
          <TitleIcon className="size-3.5 text-muted" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{minimized && subject ? subject : title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setMinimized((m) => !m)
            }}
            className="hidden rounded-md p-1.5 text-muted transition-colors hover:bg-bg-subtle hover:text-ink sm:block"
            aria-label={minimized ? "Restore" : "Minimize"}
          >
            {minimized ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          {!minimized ? (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="hidden rounded-md p-1.5 text-muted transition-colors hover:bg-bg-subtle hover:text-ink sm:block"
              aria-label={expanded ? "Exit full screen" : "Full screen"}
            >
              {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            </button>
          ) : null}
          <button
            onClick={(e) => {
              e.stopPropagation()
              requestClose()
            }}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-bg-subtle hover:text-ink"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {!minimized ? (
          <>
            <div className="shrink-0 border-b border-line">
              <Row label="From">
                {mode === "new" ? (
                  <div className="relative flex min-w-0 flex-1 items-center gap-2">
                    {fromInbox ? <AgentAvatar name={fromInbox.agent.name} color={fromInbox.agent.color} size="xs" /> : null}
                    <select
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent py-2 pr-6 text-[13.5px] outline-none"
                    >
                      {inboxes.length === 0 ? <option value="">No inboxes — create an agent first</option> : null}
                      {inboxes.map((i) => (
                        <option key={i.id} value={i.address}>
                          {i.displayName ? `${i.displayName} <${i.address}>` : i.address}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 size-3.5 text-faint" />
                  </div>
                ) : (
                  <span className="truncate py-2 text-[13.5px] text-ink-2">{from || "original inbox"}</span>
                )}
              </Row>
              {isReply ? (
                <Row label="To">
                  <span className="truncate py-2 text-[13.5px] text-ink-2">
                    {draft.to || "original sender"}
                    {mode === "replyAll" ? <span className="text-muted"> + everyone on the thread</span> : null}
                  </span>
                </Row>
              ) : (
                <>
                  <Row
                    label="To"
                    trailing={
                      mode === "new" ? (
                        <div className="flex gap-0.5 text-[13px] text-muted">
                          {!showCc ? (
                            <button className="rounded px-1.5 py-0.5 hover:bg-bg-subtle hover:text-ink" onClick={() => setShowCc(true)}>
                              Cc
                            </button>
                          ) : null}
                          {!showBcc ? (
                            <button className="rounded px-1.5 py-0.5 hover:bg-bg-subtle hover:text-ink" onClick={() => setShowBcc(true)}>
                              Bcc
                            </button>
                          ) : null}
                        </div>
                      ) : null
                    }
                  >
                    <RecipientInput inputRef={toRef} values={to} onChange={setTo} placeholder="name@example.com" />
                  </Row>
                  {showCc ? (
                    <Row label="Cc">
                      <RecipientInput values={cc} onChange={setCc} autoFocus />
                    </Row>
                  ) : null}
                  {showBcc ? (
                    <Row label="Bcc">
                      <RecipientInput values={bcc} onChange={setBcc} autoFocus />
                    </Row>
                  ) : null}
                </>
              )}
              {mode === "new" ? (
                <Row label="Subject">
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What's this about?"
                    className="min-w-0 flex-1 bg-transparent py-2 text-[13.5px] font-medium outline-none placeholder:font-normal placeholder:text-faint"
                  />
                </Row>
              ) : (
                <Row label="Subject">
                  <span className="truncate py-2 text-[13.5px] font-medium">{subject}</span>
                </Row>
              )}
            </div>

            <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
              <textarea
                ref={bodyRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={mode === "forward" ? "Add a note (optional)…" : "Write your message…"}
                className="min-h-[180px] w-full flex-1 resize-none bg-transparent px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-faint"
              />
              {draft.replyTo?.quoted ? (
                <div className="px-4 pb-3">
                  <button
                    onClick={() => setShowQuoted((v) => !v)}
                    className="inline-flex h-5 items-center rounded-md px-1.5 text-[12px] text-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
                    aria-label={showQuoted ? "Hide quoted message" : "Show quoted message"}
                  >
                    {showQuoted ? "Hide original" : "•••"}
                  </button>
                  {showQuoted ? (
                    <div className="mt-2 border-l-2 border-line pl-3 text-[12.5px] leading-relaxed whitespace-pre-wrap text-muted">
                      {draft.replyTo.quoted}
                      {mode === "forward" ? <div className="mt-2 text-[11.5px] text-faint">Attachments from the original are included automatically.</div> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {existingAttachments.length ? (
                <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                  {existingAttachments.map((name) => (
                    <span key={name} className="inline-flex h-7 max-w-[260px] items-center gap-2 rounded-lg border border-line bg-bg-subtle/50 px-2 text-[12.5px] text-muted" title="Saved with the draft">
                      <Paperclip className="size-3 shrink-0" />
                      <span className="truncate">{name}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {files.length ? (
                <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                  {files.map((f) => (
                    <span key={f.id} className="inline-flex h-7 max-w-[260px] items-center gap-2 rounded-lg border border-line pr-1 pl-2 text-[12.5px]">
                      <Paperclip className="size-3 shrink-0 text-muted" />
                      <span className="truncate font-medium">{f.filename}</span>
                      <span className="shrink-0 text-muted">{formatBytes(f.size)}</span>
                      <button onClick={() => setFiles((cur) => cur.filter((x) => x.id !== f.id))} className="rounded p-0.5 text-faint hover:bg-bg-subtle hover:text-ink" aria-label={`Remove ${f.filename}`}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-[12.5px] text-danger animate-fade-in">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span className="flex-1">{error}</span>
                <button onClick={() => setError(null)} aria-label="Dismiss">
                  <X className="size-3.5" />
                </button>
              </div>
            ) : null}

            {picking ? (
              <div className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-bg-subtle/60 px-3 py-2 animate-fade-in">
                <CalendarClock className="size-4 text-muted" />
                <label htmlFor="compose-send-at" className="text-[12.5px] text-muted">
                  Send at
                </label>
                <input
                  id="compose-send-at"
                  type="datetime-local"
                  value={customAt}
                  min={toLocalInput(new Date())}
                  onChange={(e) => setCustomAt(e.target.value)}
                  className="h-[30px] rounded-lg border border-line bg-surface px-2 text-[13px] tabular-nums outline-none focus:border-ink/50 dark:[color-scheme:dark]"
                />
                <span className="ml-auto flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setPicking(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" loading={send.isPending} onClick={() => submit(new Date(customAt))}>
                    Schedule
                  </Button>
                </span>
              </div>
            ) : null}

            <div className="flex shrink-0 items-center gap-1 border-t border-line px-3 py-2.5">
              <div className="flex">
                <Button onClick={() => submit()} loading={send.isPending} className="rounded-r-none">
                  Send
                  <span className="ml-0.5 hidden font-mono text-[11px] opacity-50 sm:inline">⌘↵</span>
                </Button>
                <DropdownMenu>
                  <DropdownTrigger asChild>
                    <Button aria-label="Schedule send" className="rounded-l-none border-l border-bg/20 px-2" disabled={send.isPending}>
                      <ChevronDown />
                    </Button>
                  </DropdownTrigger>
                  <DropdownContent align="start" className="w-80">
                    <DropdownLabel>Schedule send</DropdownLabel>
                    {schedulePresets().map((p) => (
                      <DropdownItem key={p.label} icon={<Clock />} onSelect={() => submit(p.at)}>
                        <span className="flex w-full items-baseline justify-between gap-3 whitespace-nowrap">
                          {p.label}
                          <span className="text-[11.5px] text-muted tabular-nums">{whenLabel(p.at)}</span>
                        </span>
                      </DropdownItem>
                    ))}
                    <DropdownSeparator />
                    <DropdownItem icon={<CalendarClock />} onSelect={() => setPicking(true)}>
                      Pick date & time…
                    </DropdownItem>
                  </DropdownContent>
                </DropdownMenu>
              </div>
              {mode !== "forward" ? (
                <Tooltip content={existingAttachments.length ? "Attachments on a saved draft can't be changed here" : "Attach files (or drop them here)"}>
                  <span>
                    <Button variant="ghost" size="icon-sm" onClick={() => fileInput.current?.click()} aria-label="Attach files" disabled={existingAttachments.length > 0}>
                      <Paperclip />
                    </Button>
                  </span>
                </Tooltip>
              ) : null}
              {canSaveDraft ? (
                <Tooltip content={<span className="flex items-center gap-1.5">Save draft<span className="font-mono text-[11px] opacity-60">⌘S</span></span>}>
                  <Button variant="ghost" size="icon-sm" onClick={() => saveDraft.mutate()} loading={saveDraft.isPending} aria-label="Save draft" disabled={send.isPending}>
                    {saveDraft.isPending ? null : <Save />}
                  </Button>
                </Tooltip>
              ) : null}
              <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => void addFiles(e.target.files).then(() => (e.target.value = ""))} />
              {files.length ? <span className="text-[12px] text-muted tabular-nums">{formatBytes(totalBytes)} of 10 MB</span> : null}
              <span className="ml-auto" />
              <Tooltip content="Discard">
                <Button variant="ghost" size="icon-sm" onClick={requestClose} aria-label="Discard draft">
                  <Trash2 />
                </Button>
              </Tooltip>
            </div>
          </>
        ) : null}
      </div>
      {canSaveDraft ? (
        <CloseDialog
          open={confirmDiscard}
          onOpenChange={setConfirmDiscard}
          saving={saveDraft.isPending}
          existing={Boolean(draft.draftId)}
          onSave={() => saveDraft.mutate()}
          onDiscard={() => {
            setConfirmDiscard(false)
            onClose()
          }}
        />
      ) : (
        <ConfirmDialog
          open={confirmDiscard}
          onOpenChange={setConfirmDiscard}
          title="Discard this message?"
          description="Your message hasn't been sent. Discarding it can't be undone."
          confirmLabel="Discard"
          onConfirm={() => {
            setConfirmDiscard(false)
            onClose()
          }}
        />
      )}
    </>
  )
}

/** Unsaved changes on close: save as a draft, discard, or keep editing. */
function CloseDialog({
  open,
  onOpenChange,
  onSave,
  onDiscard,
  saving,
  existing
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: () => void
  onDiscard: () => void
  saving: boolean
  existing: boolean
}) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <AlertPrimitive.Content className="fixed top-[20vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-line bg-surface p-6 shadow-pop data-[state=open]:animate-pop">
          <AlertPrimitive.Title className="text-base font-semibold">{existing ? "Save changes to this draft?" : "Save this as a draft?"}</AlertPrimitive.Title>
          <AlertPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted">
            {existing ? "Your edits haven't been saved." : "Your message hasn't been sent. Keep it in Drafts to finish later."}
          </AlertPrimitive.Description>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button variant="danger-ghost" onClick={onDiscard}>
              {existing ? "Discard changes" : "Discard"}
            </Button>
            <span className="ml-auto flex gap-2">
              <AlertPrimitive.Cancel asChild>
                <Button variant="secondary">Keep editing</Button>
              </AlertPrimitive.Cancel>
              <Button
                loading={saving}
                onClick={(e) => {
                  e.preventDefault()
                  onSave()
                }}
              >
                Save draft
              </Button>
            </span>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  )
}

function Row({ label, children, trailing }: { label: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-b border-line px-4 last:border-0">
      <span className="w-14 shrink-0 text-[13px] text-muted">{label}</span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
      {trailing}
    </div>
  )
}

function RecipientInput({
  values,
  onChange,
  placeholder,
  autoFocus,
  inputRef
}: {
  values: Array<string>
  onChange: (v: Array<string>) => void
  placeholder?: string
  autoFocus?: boolean
  inputRef?: React.RefObject<HTMLInputElement | null>
}) {
  const [text, setText] = useState("")
  const commit = (raw: string) => {
    const parts = splitRecipients(raw)
    if (!parts.length) return
    onChange([...values, ...parts.filter((p) => !values.includes(p))])
    setText("")
  }
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 py-1.5">
      {values.map((v) => {
        const valid = Boolean(parseAddress(v))
        return (
          <span
            key={v}
            className={cn(
              "inline-flex h-6 max-w-full items-center gap-1 rounded-md pr-0.5 pl-2 text-[13px]",
              valid ? "bg-bg-subtle text-ink ring-1 ring-line" : "bg-danger-soft text-danger ring-1 ring-danger/30"
            )}
            title={valid ? v : "Invalid address"}
          >
            <span className="truncate">{v}</span>
            <button onClick={() => onChange(values.filter((x) => x !== v))} className="rounded p-0.5 opacity-60 hover:bg-black/5 hover:opacity-100" aria-label={`Remove ${v}`}>
              <X className="size-3" />
            </button>
          </span>
        )
      })}
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => {
          const v = e.target.value
          if (/[,;]\s*$/.test(v)) commit(v)
          else setText(v)
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === "Tab") && text.trim()) {
            e.preventDefault()
            commit(text)
          } else if (e.key === "Backspace" && !text && values.length) {
            onChange(values.slice(0, -1))
          }
        }}
        onBlur={() => commit(text)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text")
          if (/[,;\n]/.test(pasted)) {
            e.preventDefault()
            commit(text + pasted)
          }
        }}
        placeholder={values.length ? "" : placeholder}
        className="min-w-[120px] flex-1 bg-transparent py-0.5 text-[13.5px] outline-none placeholder:text-faint"
      />
    </div>
  )
}
