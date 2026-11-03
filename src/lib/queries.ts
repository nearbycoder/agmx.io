import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { toast } from "sonner"
import { api } from "./api"

export const qk = {
  me: ["me"] as const,
  usage: (days: number) => ["usage", days] as const,
  agents: ["agents"] as const,
  agent: (id: string) => ["agents", id] as const,
  inboxes: ["inboxes"] as const,
  messages: (filters: Record<string, unknown>) => ["messages", filters] as const,
  message: (id: string) => ["message", id] as const,
  thread: (id: string) => ["thread", id] as const,
  domains: ["domains"] as const,
  keys: ["api-keys"] as const,
  signups: ["signups"] as const,
  signup: (code: string) => ["signups", code] as const,
  deliveries: (agentId: string) => ["deliveries", agentId] as const,
  adminUsers: ["admin", "users"] as const,
  system: ["admin", "system"] as const
}

export const useMe = () => useQuery({ queryKey: qk.me, queryFn: () => api((c) => c.account.me()), staleTime: 15_000 })
export const useUsage = (days = 30) => useQuery({ queryKey: qk.usage(days), queryFn: () => api((c) => c.account.usage({ query: { days } })) })
export const useAgents = () => useQuery({ queryKey: qk.agents, queryFn: () => api((c) => c.agents.list()) })
export const useAgent = (id: string) => useQuery({ queryKey: qk.agent(id), queryFn: () => api((c) => c.agents.get({ params: { agentId: id } })) })
export const useInboxes = () => useQuery({ queryKey: qk.inboxes, queryFn: () => api((c) => c.inboxes.list({ query: {} })) })
export const useDomains = () => useQuery({ queryKey: qk.domains, queryFn: () => api((c) => c.domains.list()) })
export const useApiKeys = () => useQuery({ queryKey: qk.keys, queryFn: () => api((c) => c.apiKeys.list()) })
export const useSignupRequests = () => useQuery({ queryKey: qk.signups, queryFn: () => api((c) => c.signupApprovals.list()), refetchInterval: 15_000 })
export const useDeliveries = (agentId: string) =>
  useQuery({ queryKey: qk.deliveries(agentId), queryFn: () => api((c) => c.agents.webhookDeliveries({ params: { agentId } })), refetchInterval: 10_000 })

export interface MessageFilters {
  inboxId?: string
  folder?: "inbox" | "sent" | "starred" | "archived" | "spam" | "all"
  q?: string
  unread?: "true"
}

export const useMessages = (filters: MessageFilters) =>
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

export const useThread = (id: string | undefined) =>
  useQuery({ queryKey: qk.thread(id ?? ""), queryFn: () => api((c) => c.threads.get({ params: { threadId: id! } })), enabled: Boolean(id) })

/** Subscribes to the server's event stream and keeps cached mail data fresh in real time. */
export const useLiveMail = (enabled = true) => {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return
    let source: EventSource | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let pending = false
    const flush = () => {
      pending = false
      void queryClient.invalidateQueries({ queryKey: ["messages"] })
      void queryClient.invalidateQueries({ queryKey: ["thread"] })
      void queryClient.invalidateQueries({ queryKey: qk.inboxes })
      void queryClient.invalidateQueries({ queryKey: qk.agents })
      void queryClient.invalidateQueries({ queryKey: qk.me })
    }
    const connect = () => {
      source = new EventSource("/api/events")
      source.addEventListener("mail", (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as { type: string; messageId: string }
          if (data.type === "message.received") {
            void api((c) => c.messages.get({ params: { messageId: data.messageId }, query: {} })).then((m) => {
              toast(m.from.name || m.from.address, {
                description: m.subject || m.snippet || "New message",
                icon: "✉️"
              })
            }).catch(() => {})
          }
        } catch {}
        if (!pending) {
          pending = true
          setTimeout(flush, 150)
        }
      })
      source.onerror = () => {
        source?.close()
        timer = setTimeout(connect, 5000)
      }
    }
    connect()
    return () => {
      source?.close()
      if (timer) clearTimeout(timer)
    }
  }, [enabled, queryClient])
}
