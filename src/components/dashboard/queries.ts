import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { api } from "~/lib/api"

export const dk = {
  approvals: ["approvals"] as const,
  rules: (inboxId: string) => ["rules", inboxId] as const
}

/**
 * Outbound mail held by an agent's send policy. Polls every 15s and refreshes
 * whenever the live mail stream invalidates message queries.
 */
export const useApprovals = () => {
  const queryClient = useQueryClient()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "invalidate" || event.query.queryKey[0] !== "messages") return
      clearTimeout(timer)
      timer = setTimeout(() => void queryClient.invalidateQueries({ queryKey: dk.approvals }), 200)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [queryClient])
  return useQuery({
    queryKey: dk.approvals,
    queryFn: () => api((c) => c.approvals.list()),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true
  })
}

export const useInboxRules = (inboxId: string, enabled = true) =>
  useQuery({ queryKey: dk.rules(inboxId), queryFn: () => api((c) => c.rules.list({ params: { inboxId } })), enabled })
