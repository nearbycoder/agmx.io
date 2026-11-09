import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query"
import { toast } from "sonner"
import type { MessageSummaryT, ThreadT, MessageT } from "~/shared/api/domain"
import { api, errorMessage } from "~/lib/api"
import { qk } from "~/lib/queries"

type Page = { messages: ReadonlyArray<MessageSummaryT>; nextCursor: string | null }
type Thread = ThreadT & { messages: ReadonlyArray<MessageT> }

export interface MessagePatch {
  isRead?: boolean
  isStarred?: boolean
  isArchived?: boolean
  isSpam?: boolean
  labels?: ReadonlyArray<string>
}

/** Optimistic flag updates and deletes across every cached message list and thread. */
export const useMailActions = () => {
  const queryClient = useQueryClient()

  const patchCaches = (ids: ReadonlySet<string>, patch: MessagePatch | "delete") => {
    const patchPage = (page: Page): Page => ({
      ...page,
      messages: patch === "delete" ? page.messages.filter((m) => !ids.has(m.id)) : page.messages.map((m) => (ids.has(m.id) ? { ...m, ...patch } : m))
    })
    // ["messages", …] holds paginated lists and single-page lists (folder counts).
    queryClient.setQueriesData<InfiniteData<Page> | Page>({ queryKey: ["messages"] }, (old) => {
      if (!old) return old
      if ("pages" in old) return { ...old, pages: old.pages.map(patchPage) }
      if ("messages" in old) return patchPage(old)
      return old
    })
    queryClient.setQueriesData<Thread>({ queryKey: ["thread"] }, (old) =>
      old && old.messages
        ? {
            ...old,
            messages:
              patch === "delete"
                ? old.messages.filter((m) => !ids.has(m.id))
                : old.messages.map((m) => (ids.has(m.id) ? { ...m, ...patch } : m))
          }
        : old
    )
  }

  const settle = () => {
    void queryClient.invalidateQueries({ queryKey: ["messages"] })
    void queryClient.invalidateQueries({ queryKey: ["thread"] })
    void queryClient.invalidateQueries({ queryKey: qk.inboxes })
    void queryClient.invalidateQueries({ queryKey: qk.agents })
  }

  const update = useMutation({
    mutationFn: async ({ ids, patch }: { ids: ReadonlyArray<string>; patch: MessagePatch }) =>
      Promise.all(ids.map((id) => api((c) => c.messages.update({ params: { messageId: id }, payload: patch })))),
    onMutate: async ({ ids, patch }) => {
      // An in-flight fetch would land after the optimistic patch and undo it on screen.
      await Promise.all([queryClient.cancelQueries({ queryKey: ["messages"] }), queryClient.cancelQueries({ queryKey: ["thread"] })])
      patchCaches(new Set(ids), patch)
    },
    onError: (error) => {
      toast.error(errorMessage(error))
    },
    onSettled: settle
  })

  const remove = useMutation({
    mutationFn: async (ids: ReadonlyArray<string>) =>
      Promise.all(ids.map((id) => api((c) => c.messages.delete({ params: { messageId: id } })))),
    onMutate: async (ids) => {
      await Promise.all([queryClient.cancelQueries({ queryKey: ["messages"] }), queryClient.cancelQueries({ queryKey: ["thread"] })])
      patchCaches(new Set(ids), "delete")
    },
    onSuccess: (_, ids) => toast.success(ids.length > 1 ? `${ids.length} messages deleted` : "Message deleted"),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: settle
  })

  return {
    update: (ids: ReadonlyArray<string>, patch: MessagePatch) => update.mutate({ ids, patch }),
    remove: (ids: ReadonlyArray<string>) => remove.mutate(ids),
    removing: remove.isPending
  }
}

/** Outbound statuses that aren't real, sent mail yet. */
export const UNSENT = new Set(["draft", "scheduled", "pending_approval", "rejected"])

/**
 * The message a thread-level action (star, forward) applies to: the newest real one,
 * falling back to the newest of any kind when the thread holds only drafts or held mail.
 */
export const latestMessage = <M extends { status: string }>(messages: ReadonlyArray<M>): M | undefined => {
  for (let i = messages.length - 1; i >= 0; i--) if (!UNSENT.has(messages[i]!.status)) return messages[i]
  return messages[messages.length - 1]
}

/** Whether a message still belongs in the folder after a local flag change. */
export const matchesFolder = (m: MessageSummaryT, folder: string) => {
  switch (folder) {
    case "inbox":
      return m.direction === "inbound" && !m.isArchived && !m.isSpam
    case "sent":
      return m.direction === "outbound" && !UNSENT.has(m.status)
    case "drafts":
      return m.status === "draft"
    case "scheduled":
      return m.status === "scheduled"
    case "pending":
      return m.status === "pending_approval" || m.status === "rejected"
    case "starred":
      return m.isStarred && m.status !== "draft"
    case "archived":
      return m.isArchived && m.status !== "draft"
    case "spam":
      return m.isSpam
    default:
      return m.status !== "draft"
  }
}
