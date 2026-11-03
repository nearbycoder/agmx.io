import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { KeyRound, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Page, PageHeader } from "~/components/app/page"
import { AgentAvatar } from "~/components/brand"
import { toastFailure } from "~/components/dashboard/common"
import { CreateKeyDialog } from "~/components/dashboard/create-key-dialog"
import { Panel } from "~/components/dashboard/section"
import { Button } from "~/components/ui/button"
import { ConfirmDialog } from "~/components/ui/dialog"
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger, Tooltip } from "~/components/ui/menu"
import { EmptyState, Skeleton } from "~/components/ui/misc"
import { Table, TBody, Td, Th, THead, Tr } from "~/components/ui/table"
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
        description={
          <>
            Account keys (<code className="font-mono text-[12.5px]">agmx_acc_…</code>) can manage everything. Agent keys (
            <code className="font-mono text-[12.5px]">agmx_agt_…</code>) can only use one agent's inboxes, so give those to agents.
          </>
        }
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Create key
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-48 w-full rounded-xl" />
      ) : keys?.length ? (
        <Table>
          <THead>
            <Th>Name</Th>
            <Th>Key</Th>
            <Th>Access</Th>
            <Th>Last used</Th>
            <Th>Created</Th>
            <Th className="w-12" />
          </THead>
          <TBody>
            {keys.map((k) => (
              <Tr key={k.id}>
                <Td className="font-medium whitespace-nowrap">{k.name}</Td>
                <Td>
                  <code className="font-mono text-[12.5px] whitespace-nowrap text-muted">{k.prefix}</code>
                </Td>
                <Td className="whitespace-nowrap">
                  {k.scope === "agent" && k.agentId ? (
                    <Link to="/app/agents/$agentId" params={{ agentId: k.agentId }} className="inline-flex items-center gap-2 hover:underline">
                      <AgentAvatar name={k.agentName ?? "?"} color={colorFor(k.agentId)} size="xs" />
                      {k.agentName}
                    </Link>
                  ) : (
                    <span className="text-ink-2">Full account</span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-muted">{k.lastUsedAt ? relativeTime(k.lastUsedAt) : "Never"}</Td>
                <Td className="whitespace-nowrap text-muted">
                  <Tooltip content={fullDate(k.createdAt)}>
                    <span>{relativeTime(k.createdAt)}</span>
                  </Tooltip>
                </Td>
                <Td className="text-right">
                  <DropdownMenu>
                    <DropdownTrigger asChild>
                      <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${k.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownTrigger>
                    <DropdownContent>
                      <DropdownItem icon={<Trash2 />} danger onSelect={() => setRevoking({ id: k.id, name: k.name })}>
                        Revoke key
                      </DropdownItem>
                    </DropdownContent>
                  </DropdownMenu>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <Panel>
          <EmptyState
            icon={<KeyRound />}
            title="No API keys"
            description="Create a key to call the API from your own code, or to connect an agent over MCP."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus /> Create key
              </Button>
            }
          />
        </Panel>
      )}

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
