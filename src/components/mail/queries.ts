import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, errorMessage } from "~/lib/api"
import { qk } from "~/lib/queries"
import type { FolderId } from "./folder-pane"

export interface MailFilters {
  inboxId?: string
  folder?: FolderId
  q?: string
  unread?: "true"
}

/** Message list for every folder, including drafts, scheduled and held mail. */
export const useMailList = (filters: MailFilters) =>
  useInfiniteQuery({
    queryKey: qk.messages(filters as Record<string, unknown>),
    queryFn: ({ pageParam }) =>
      api((c) =>
        c.messages.list({
          query: { inboxId: filters.inboxId, folder: filters.folder, q: filters.q || undefined, unread: filters.unread, limit: 40, cursor: pageParam ?? undefined }
        })
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData
  })

const COUNT_LIMIT = 50

/** Small counts for the Drafts and Awaiting approval folders (capped at 50). */
export const useFolderCounts = (inboxId: string | undefined) => {
  const drafts = useQuery({
    queryKey: qk.messages({ count: "drafts", inboxId }),
    queryFn: () => api((c) => c.messages.list({ query: { folder: "drafts", inboxId, limit: COUNT_LIMIT } })),
    staleTime: 15_000
  })
  const pending = useQuery({
    queryKey: qk.messages({ count: "pending", inboxId }),
    queryFn: () => api((c) => c.messages.list({ query: { folder: "pending", inboxId, limit: COUNT_LIMIT } })),
    staleTime: 15_000
  })
  return {
    drafts: drafts.data?.messages.length ?? 0,
    pending: pending.data?.messages.filter((m) => m.status === "pending_approval").length ?? 0,
    capped: COUNT_LIMIT
  }
}

/** Move a scheduled message back to drafts. */
export const useCancelScheduled = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (messageId: string) => api((c) => c.messages.cancel({ params: { messageId } })),
    onSuccess: () => toast.success("Scheduled send cancelled", { description: "The message is back in Drafts." }),
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["messages"] })
      void queryClient.invalidateQueries({ queryKey: ["thread"] })
    }
  })
}

/** Locale-aware "Tue, Nov 5, 9:00 AM" for scheduled times. */
export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
