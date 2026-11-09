import { useEffect } from "react"

/**
 * Refine the tab title once client data is loaded (e.g. the agent's name or an unread count).
 * The route's `head` still provides the server-rendered fallback.
 */
export const useDocumentTitle = (title: string | null | undefined) => {
  // No cleanup on purpose. When the page changes, the router writes the next route's title first
  // and effect cleanups run afterwards, so restoring the old title here would overwrite it.
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
