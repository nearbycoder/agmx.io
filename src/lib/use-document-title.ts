import { useEffect } from "react"

/**
 * Refine the tab title once client data is loaded (e.g. the agent's name or an unread count).
 * The route's `head` still provides the server-rendered fallback.
 */
export const useDocumentTitle = (title: string | null | undefined) => {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
