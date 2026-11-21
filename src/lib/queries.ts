import { useQuery, useQueryClient } from "@tanstack/react-query"
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
export const useDomains = () => useQuery({ queryKey: qk.domains, queryFn: () => api((c) => c.domains.list()) })
export const useApiKeys = () => useQuery({ queryKey: qk.keys, queryFn: () => api((c) => c.apiKeys.list()) })
export const useSignupRequests = () => useQuery({ queryKey: qk.signups, queryFn: () => api((c) => c.signupApprovals.list()), refetchInterval: 15_000 })
export const useDeliveries = (agentId: string) =>
  useQuery({ queryKey: qk.deliveries(agentId), queryFn: () => api((c) => c.agents.webhookDeliveries({ params: { agentId } })), refetchInterval: 10_000 })

export const useThread = (id: string | undefined) =>
  useQuery({ queryKey: qk.thread(id ?? ""), queryFn: () => api((c) => c.threads.get({ params: { threadId: id! } })), enabled: Boolean(id) })

/** Subscribes to the server's event stream and keeps cached mail data fresh in real time. */
export const useLiveMail = (enabled = true) => {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return
    let source: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    let arrivalTimer: ReturnType<typeof setTimeout> | undefined
    let pending = false
    let disposed = false
    const flush = () => {
      pending = false
      flushTimer = undefined
      if (disposed) return
      void queryClient.invalidateQueries({ queryKey: ["messages"] })
      void queryClient.invalidateQueries({ queryKey: ["thread"] })
      void queryClient.invalidateQueries({ queryKey: ["approvals"] })
      void queryClient.invalidateQueries({ queryKey: qk.inboxes })
      void queryClient.invalidateQueries({ queryKey: qk.agents })
      void queryClient.invalidateQueries({ queryKey: qk.me })
    }
    // Several messages arriving together (a forward rule, a batch) get one toast, not a stack.
    let arrivals: Array<string> = []
    const announce = () => {
      arrivalTimer = undefined
      if (disposed) return
      const ids = arrivals
      arrivals = []
      if (ids.length === 0) return
      if (ids.length > 1) {
        toast(`${ids.length} new messages`)
        return
      }
      void api((c) => c.messages.get({ params: { messageId: ids[0]! }, query: {} }))
        .then((m) => {
          if (!disposed) toast(m.from.name || m.from.address, { description: m.subject || m.snippet || "New message" })
        })
        .catch(() => {})
    }
    let wasConnected = false
    const connect = () => {
      if (disposed) return
      source = new EventSource("/api/events")
      source.onopen = () => {
        // Anything that happened while the stream was down was missed, so catch up once.
        if (wasConnected) flush()
        wasConnected = true
      }
      source.addEventListener("mail", (event) => {
        if (disposed) return
        try {
          const data = JSON.parse((event as MessageEvent).data) as { type: string; messageId: string }
          if (data.type === "message.received") {
            arrivals.push(data.messageId)
            if (arrivalTimer) clearTimeout(arrivalTimer)
            arrivalTimer = setTimeout(announce, 400)
          }
        } catch {}
        if (!pending) {
          pending = true
          flushTimer = setTimeout(flush, 150)
        }
      })
      source.onerror = () => {
        source?.close()
        if (!disposed) reconnectTimer = setTimeout(connect, 5000)
      }
    }
    connect()
    return () => {
      disposed = true
      source?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (flushTimer) clearTimeout(flushTimer)
      if (arrivalTimer) clearTimeout(arrivalTimer)
    }
  }, [enabled, queryClient])
}
