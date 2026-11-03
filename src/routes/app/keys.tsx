import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { Bot, Building2, KeyRound, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Page, PageHeader } from "~/components/app/page"
import { toastFailure } from "~/components/dashboard/common"
import { CreateKeyDialog } from "~/components/dashboard/create-key-dialog"
import { AgentAvatar } from "~/components/brand"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { ConfirmDialog } from "~/components/ui/dialog"
import { Tooltip } from "~/components/ui/menu"
import { EmptyState, Skeleton } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { qk, useAgents, useApiKeys } from "~/lib/queries"
import { fullDate, relativeTime } from "~/lib/utils"

export const Route = createFileRoute("/app/keys")({
  head: () => ({ meta: [{ title: "API keys — AGMX" }] }),
  component: KeysPage
})

function KeysPage() {
  const { data: keys, isLoading } = useApiKeys()
  const { data: agents } = useAgents()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<{ id: string; name: string } | null>(null)
  const revoke = useMutation({
    mutationFn: (id: string) => api((c) => c.apiKeys.revoke({ params: { keyId: id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.keys })
      toast.success("Key revoked")
      setRevoking(null)
    },
    onError: (e) => toastFailure(e)
  })
  const colorFor = (agentId: string | null) => agents?.find((a) => a.id === agentId)?.color ?? "slate"

  return (
    <Page>
      <PageHeader
        title="API keys"
        description="Authenticate the REST API and MCP server with Authorization: Bearer agmx_…"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Create key
          </Button>
        }
      />
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <ScopeCard
          icon={<Building2 />}
          title="Account keys"
          prefix="agmx_acc_"
          body="Full access: create agents and inboxes, manage domains and keys, and read or send from every inbox. Use for your own backend."
        />
        <ScopeCard
          icon={<Bot />}
          title="Agent keys"
          prefix="agmx_agt_"
          body="Least privilege: only that agent's inboxes. Can create more inboxes for itself, but can't touch other agents. Give these to agents."
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : keys?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[11px] tracking-wider text-faint uppercase">
                  <th className="px-5 py-2.5 font-medium">Name</th>
                  <th className="px-3 py-2.5 font-medium">Key</th>
                  <th className="px-3 py-2.5 font-medium">Access</th>
                  <th className="px-3 py-2.5 font-medium">Last used</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {keys.map((k) => (
                  <tr key={k.id} className="transition hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <KeyRound className="size-4 text-faint" />
                        <span className="font-medium">{k.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <code className="rounded-md bg-bg-subtle px-1.5 py-0.5 font-mono text-[12px] text-ink-2">{k.prefix}</code>
                    </td>
                    <td className="px-3 py-3">
                      {k.scope === "agent" && k.agentId ? (
                        <Link to="/app/agents/$agentId" params={{ agentId: k.agentId }} className="inline-flex items-center gap-1.5 hover:underline">
                          <AgentAvatar name={k.agentName ?? "?"} color={colorFor(k.agentId)} size="xs" />
                          {k.agentName}
                        </Link>
                      ) : (
                        <Badge tone="solid">Full account</Badge>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted">{k.lastUsedAt ? relativeTime(k.lastUsedAt) : "Never"}</td>
                    <td className="px-3 py-3 text-muted">
                      <Tooltip content={fullDate(k.createdAt)}>
                        <span>{relativeTime(k.createdAt)}</span>
                      </Tooltip>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="danger-ghost" onClick={() => setRevoking({ id: k.id, name: k.name })}>
                        <Trash2 /> Revoke
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<KeyRound />}
            title="No API keys"
            description="Create a key to call the API from your own code, or connect an agent over MCP."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus /> Create key
              </Button>
            }
          />
        )}
      </Card>

      <CreateKeyDialog open={creating} onOpenChange={setCreating} />
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={`Revoke “${revoking?.name}”?`}
        description="Requests using this key will fail with 401 Unauthorized immediately. This can't be undone."
        confirmLabel="Revoke key"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking.id)}
      />
    </Page>
  )
}

const ScopeCard = ({ icon, title, prefix, body }: { icon: React.ReactNode; title: string; prefix: string; body: string }) => (
  <div className="flex gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-card">
    <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-bg-subtle text-ink-2 [&_svg]:size-4">{icon}</div>
    <div>
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold">{title}</span>
        <code className="font-mono text-[11px] text-faint">{prefix}…</code>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{body}</p>
    </div>
  </div>
)
