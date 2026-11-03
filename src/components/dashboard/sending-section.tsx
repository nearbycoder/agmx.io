import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Switch } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { qk } from "~/lib/queries"
import { cn } from "~/lib/utils"
import { toastFailure } from "./common"
import { Panel, Section } from "./section"

type Policy = "auto" | "first_contact" | "all"

const POLICIES: Array<{ value: Policy; title: string; description: string }> = [
  { value: "auto", title: "Send immediately", description: "Mail goes out as soon as the agent sends it." },
  {
    value: "first_contact",
    title: "Approve first contact",
    description: "Hold mail to anyone this inbox hasn't exchanged mail with before. Replies to known contacts send right away."
  },
  { value: "all", title: "Approve everything", description: "Hold every message until you approve it." }
]

/** The agent's send policy: what its own API key may send without a human. */
export function SendingSection({ agentId, sendPolicy, approveAttachments }: { agentId: string; sendPolicy: Policy; approveAttachments: boolean }) {
  const queryClient = useQueryClient()
  const [policy, setPolicy] = useState<Policy>(sendPolicy)
  const [attachments, setAttachments] = useState(approveAttachments)
  useEffect(() => setPolicy(sendPolicy), [sendPolicy])
  useEffect(() => setAttachments(approveAttachments), [approveAttachments])

  const save = useMutation({
    mutationFn: (payload: { sendPolicy?: Policy; approveAttachments?: boolean }) => api((c) => c.agents.update({ params: { agentId }, payload })),
    onSuccess: (agent, payload) => {
      void queryClient.invalidateQueries({ queryKey: qk.agent(agentId) })
      void queryClient.invalidateQueries({ queryKey: qk.agents })
      if (payload.sendPolicy) toast.success(POLICIES.find((p) => p.value === agent.sendPolicy)?.title ?? "Send policy saved")
      else toast.success(agent.approveAttachments ? "Messages with attachments now need approval" : "Attachments no longer need approval")
    },
    onError: (e) => {
      setPolicy(sendPolicy)
      setAttachments(approveAttachments)
      toastFailure(e)
    }
  })

  return (
    <Section
      title="Sending"
      description="Applies to mail sent with this agent's own API key. Mail you send from the dashboard or with an account key is never held."
    >
      <Panel divided>
        <div role="radiogroup" aria-label="Send policy" className="divide-y divide-line">
          {POLICIES.map((p) => {
            const checked = policy === p.value
            return (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={save.isPending}
                onClick={() => {
                  if (checked) return
                  setPolicy(p.value)
                  save.mutate({ sendPolicy: p.value })
                }}
                className={cn("flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors hover:bg-bg-subtle/40", checked && "bg-bg-subtle/40")}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                    checked ? "border-ink dark:border-accent" : "border-line-strong"
                  )}
                >
                  {checked ? <span className="size-2 rounded-full bg-ink dark:bg-accent" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium">{p.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">{p.description}</span>
                </span>
              </button>
            )
          })}
        </div>
        <label htmlFor="approve-attachments" className="flex cursor-pointer items-center justify-between gap-4 px-5 py-3.5">
          <span className="min-w-0">
            <span className="block text-[13.5px] font-medium">Also approve messages with attachments</span>
            <span className="mt-0.5 block text-[12.5px] text-muted">Hold anything with a file attached, whatever the policy above.</span>
          </span>
          <Switch
            id="approve-attachments"
            checked={attachments}
            disabled={save.isPending}
            onCheckedChange={(v) => {
              setAttachments(v)
              save.mutate({ approveAttachments: v })
            }}
          />
        </label>
      </Panel>
    </Section>
  )
}
