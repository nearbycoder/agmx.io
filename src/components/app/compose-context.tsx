import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"

export interface ComposeDraft {
  from?: string
  to?: string
  cc?: string
  bcc?: string
  subject?: string
  text?: string
  /** Editing a saved draft: saves update it and sending sends it (keeping its thread). */
  draftId?: string
  /** Attachments already on the saved draft (shown read-only). */
  attachmentNames?: ReadonlyArray<string>
  /** When set, the composer sends a reply/forward to this message instead of a new email. */
  replyTo?: { messageId: string; mode: "reply" | "replyAll" | "forward"; subject: string; quoted?: string }
}

interface ComposeState {
  draft: ComposeDraft | null
  /**
   * A message someone asked to open while the composer held unsaved work. It waits here
   * until the user saves or discards what they were writing.
   */
  queued: ComposeDraft | null
  /** Bumped when the composer should come forward (it may be minimized). */
  nudge: number
  open: (draft?: ComposeDraft) => void
  /** Close the composer; if another message is queued, it opens next. */
  close: () => void
  /** Drop the queued message and carry on with the current one. */
  cancelQueued: () => void
  /** The open composer reports whether it holds unsaved input. */
  setDirty: (dirty: boolean) => void
}

const noop = () => {}
const ComposeContext = createContext<ComposeState>({ draft: null, queued: null, nudge: 0, open: noop, close: noop, cancelQueued: noop, setDirty: noop })

const sameMessage = (a: ComposeDraft, b: ComposeDraft) =>
  a.draftId !== undefined || b.draftId !== undefined
    ? a.draftId === b.draftId
    : a.replyTo?.messageId === b.replyTo?.messageId && a.replyTo?.mode === b.replyTo?.mode && Boolean(a.replyTo) === Boolean(b.replyTo) && Boolean(a.replyTo)

export const ComposeProvider = ({ children }: { children: ReactNode }) => {
  const [draft, setDraft] = useState<ComposeDraft | null>(null)
  const [queued, setQueued] = useState<ComposeDraft | null>(null)
  const [nudge, setNudge] = useState(0)
  const current = useRef<ComposeDraft | null>(null)
  const waiting = useRef<ComposeDraft | null>(null)
  const dirty = useRef(false)

  const show = useCallback((next: ComposeDraft | null) => {
    current.current = next
    dirty.current = false
    setDraft(next)
  }, [])
  const queue = useCallback((next: ComposeDraft | null) => {
    waiting.current = next
    setQueued(next)
  }, [])

  const open = useCallback(
    (d?: ComposeDraft) => {
      const next = d ?? {}
      const open = current.current
      // "Compose" with a message already open, or re-opening the one on screen: bring it forward.
      if (open && (d === undefined || sameMessage(open, next))) return setNudge((n) => n + 1)
      // Never replace unsaved work silently: ask first, then move on.
      if (open && dirty.current) {
        queue(next)
        return setNudge((n) => n + 1)
      }
      show(next)
    },
    [queue, show]
  )
  const close = useCallback(() => {
    const next = waiting.current
    queue(null)
    show(next)
  }, [queue, show])
  const cancelQueued = useCallback(() => queue(null), [queue])
  const setDirty = useCallback((value: boolean) => void (dirty.current = value), [])

  const value = useMemo(() => ({ draft, queued, nudge, open, close, cancelQueued, setDirty }), [draft, queued, nudge, open, close, cancelQueued, setDirty])
  return <ComposeContext.Provider value={value}>{children}</ComposeContext.Provider>
}

export const useCompose = () => useContext(ComposeContext)
