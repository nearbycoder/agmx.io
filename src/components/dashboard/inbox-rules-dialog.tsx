import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus, Trash2 } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent } from "~/components/ui/dialog"
import { Input } from "~/components/ui/input"
import { Skeleton, Switch } from "~/components/ui/misc"
import { api } from "~/lib/api"
import type { InboxRuleT, InboxT } from "~/shared/api/domain"
import { cn } from "~/lib/utils"
import { FailureNote, NativeSelect, QueryError, toastFailure } from "./common"
import { dk, useInboxRules } from "./queries"

type Field_ = InboxRuleT["field"]
type Action = InboxRuleT["action"]

const FIELD_LABEL: Record<Field_, string> = { sender: "Sender is", domain: "Domain is", subject: "Subject contains" }
const FIELD_PLACEHOLDER: Record<Field_, string> = { sender: "noreply@github.com", domain: "github.com", subject: "invoice" }
const ACTION_TARGET: Partial<Record<Action, { label: string; placeholder: string; type?: string }>> = {
  label: { label: "Label", placeholder: "billing" },
  forward: { label: "Forward to", placeholder: "you@example.com", type: "email" },
  webhook: { label: "Webhook URL", placeholder: "https://example.com/hooks/inbox" }
}

const describeAction = (r: InboxRuleT) => {
  switch (r.action) {
    case "allow":
      return "Allow"
    case "block":
      return "Block"
    case "label":
      return `Label “${r.target}”`
    case "forward":
      return `Forward to ${r.target}`
    case "webhook":
      return "Send to webhook"
  }
}

/** Manage an inbox's sender rules: list in evaluation order, toggle, delete, add. */
export function InboxRulesDialog({ inbox, onOpenChange }: { inbox: InboxT | null; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const inboxId = inbox?.id ?? ""
  const { data: rules, isLoading, error, refetch } = useInboxRules(inboxId, Boolean(inbox))
  const [field, setField] = useState<Field_>("domain")
  const [value, setValue] = useState("")
  const [action, setAction] = useState<Action>("allow")
  const [target, setTarget] = useState("")
  const targetSpec = ACTION_TARGET[action]

  useEffect(() => {
    if (!inbox) {
      setField("domain")
      setValue("")
      setAction("allow")
      setTarget("")
      create.reset()
    }
  }, [inbox])

  const refresh = () => void queryClient.invalidateQueries({ queryKey: dk.rules(inboxId) })

  const create = useMutation({
    mutationFn: () =>
      api((c) =>
        c.rules.create({ params: { inboxId }, payload: { field, value: value.trim(), action, target: targetSpec ? target.trim() : undefined } })
      ),
    onSuccess: () => {
      refresh()
      setValue("")
      setTarget("")
      toast.success("Rule added")
    }
  })
  const toggle = useMutation({
    mutationFn: (r: InboxRuleT) => api((c) => c.rules.update({ params: { ruleId: r.id }, payload: { enabled: !r.enabled } })),
    onMutate: (r) => {
      queryClient.setQueryData<ReadonlyArray<InboxRuleT>>(dk.rules(inboxId), (list) => list?.map((x) => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)))
    },
    onError: (e) => {
      refresh()
      toastFailure(e)
    }
  })
  const remove = useMutation({
    mutationFn: (r: InboxRuleT) => api((c) => c.rules.delete({ params: { ruleId: r.id } })),
    onMutate: (r) => {
      queryClient.setQueryData<ReadonlyArray<InboxRuleT>>(dk.rules(inboxId), (list) => list?.filter((x) => x.id !== r.id))
    },
    // One click deletes, so offer the way back: removing the last Allow rule opens the inbox to everyone.
    onSuccess: (_, r) =>
      toast.success("Rule deleted", {
        description: r.action === "allow" && !rules?.some((x) => x.id !== r.id && x.action === "allow" && x.enabled) ? "This inbox now accepts mail from any sender." : undefined,
        action: { label: "Undo", onClick: () => restore.mutate(r) }
      }),
    onError: (e) => {
      refresh()
      toastFailure(e)
    }
  })
  const restore = useMutation({
    mutationFn: (r: InboxRuleT) =>
      api((c) =>
        c.rules.create({
          params: { inboxId: r.inboxId },
          payload: { field: r.field, value: r.value, action: r.action, target: r.target ?? undefined, position: r.position, enabled: r.enabled }
        })
      ),
    onSuccess: () => {
      refresh()
      toast.success("Rule restored")
    },
    onError: (e) => toastFailure(e)
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim() && (!targetSpec || target.trim())) create.mutate()
  }

  const hasAllow = rules?.some((r) => r.action === "allow" && r.enabled)

  return (
    <Dialog open={inbox !== null} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-xl"
        title="Sender rules"
        description={
          <>
            For <span className="font-mono text-[12.5px] text-ink-2">{inbox?.address}</span>. Rules run in order before mail is stored. If any
            Allow rule exists, only matching senders get through.
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="overflow-hidden rounded-xl border border-line">
            {isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            ) : error && !rules ? (
              <QueryError error={error} onRetry={refetch} what="rules" className="py-8" />
            ) : rules?.length ? (
              <ol className="divide-y divide-line">
                {rules.map((r, i) => (
                  <li key={r.id} className={cn("flex items-center gap-3 px-4 py-2.5", !r.enabled && "opacity-55")}>
                    <span className="w-4 shrink-0 text-right text-[12px] text-faint tabular-nums">{i + 1}</span>
                    <div className="min-w-0 flex-1 text-[13px]">
                      <span className="text-muted">{FIELD_LABEL[r.field]} </span>
                      <code className="font-mono text-[12.5px] break-all text-ink">{r.value}</code>
                      <span className="text-muted"> → </span>
                      <span className={cn("font-medium", r.action === "block" && "text-danger")}>{describeAction(r)}</span>
                    </div>
                    <Switch checked={r.enabled} onCheckedChange={() => toggle.mutate(r)} aria-label={r.enabled ? "Disable rule" : "Enable rule"} />
                    <button
                      type="button"
                      onClick={() => remove.mutate(r)}
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger-soft hover:text-danger"
                      aria-label="Delete rule"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-6 text-center text-[13px] text-muted">No rules. All senders are accepted.</p>
            )}
          </div>
          {hasAllow ? (
            <p className="-mt-2 text-[12.5px] text-muted">This inbox only accepts mail matched by an Allow rule.</p>
          ) : null}

          <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-line bg-bg-subtle/40 p-4">
            <div className="text-[13px] font-medium">Add a rule</div>
            <div className="grid gap-2 sm:grid-cols-[150px_minmax(0,1fr)]">
              <NativeSelect value={field} onChange={(v) => setField(v as Field_)} aria-label="Match on">
                <option value="sender">Sender address</option>
                <option value="domain">Domain</option>
                <option value="subject">Subject contains</option>
              </NativeSelect>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={FIELD_PLACEHOLDER[field]}
                aria-label="Value"
                spellCheck={false}
                autoComplete="off"
              />
              <NativeSelect value={action} onChange={(v) => setAction(v as Action)} aria-label="Action">
                <option value="allow">Allow only</option>
                <option value="block">Block</option>
                <option value="label">Label</option>
                <option value="forward">Forward to</option>
                <option value="webhook">Send to webhook</option>
              </NativeSelect>
              {targetSpec ? (
                <Input
                  type={targetSpec.type ?? "text"}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={targetSpec.placeholder}
                  aria-label={targetSpec.label}
                  spellCheck={false}
                  autoComplete="off"
                />
              ) : (
                <p className="flex items-center text-[12.5px] text-muted">
                  {action === "allow" ? "Only matching senders will get through." : "Matching mail is dropped before it's stored."}
                </p>
              )}
            </div>
            <FailureNote error={create.error} />
            <div className="flex justify-end">
              <Button type="submit" size="sm" loading={create.isPending} disabled={!value.trim() || Boolean(targetSpec && !target.trim())}>
                <Plus /> Add rule
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** "· 2 rules" suffix for an inbox row. */
export function useRuleCount(inboxId: string) {
  const { data } = useInboxRules(inboxId)
  return data?.length ?? 0
}

