import { createContext, useCallback, useContext, useState, type ReactNode } from "react"

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
  open: (draft?: ComposeDraft) => void
  close: () => void
}

const ComposeContext = createContext<ComposeState>({ draft: null, open: () => {}, close: () => {} })

export const ComposeProvider = ({ children }: { children: ReactNode }) => {
  const [draft, setDraft] = useState<ComposeDraft | null>(null)
  const open = useCallback((d?: ComposeDraft) => setDraft(d ?? {}), [])
  const close = useCallback(() => setDraft(null), [])
  return <ComposeContext.Provider value={{ draft, open, close }}>{children}</ComposeContext.Provider>
}

export const useCompose = () => useContext(ComposeContext)
