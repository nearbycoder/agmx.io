import { useMutation, useQueryClient } from "@tanstack/react-query"
import { KeyRound } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent } from "~/components/ui/dialog"
import { Field, Input } from "~/components/ui/input"
import { api } from "~/lib/api"
import { qk, useAgents } from "~/lib/queries"
import { FailureNote, NativeSelect } from "./common"
import { SecretReveal } from "./secret-reveal"

export const CreateKeyDialog = ({
  open,
  onOpenChange,
  agentId: fixedAgentId
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** When set, the key is scoped to this agent and the scope picker is hidden. */
  agentId?: string
}) => {
  const queryClient = useQueryClient()
  const { data: agents } = useAgents()
  const [name, setName] = useState("")
  const [scope, setScope] = useState<string>(fixedAgentId ?? "")
  const [secret, setSecret] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setName("")
        setScope(fixedAgentId ?? "")
        setSecret(null)
        mutation.reset()
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open, fixedAgentId])

  const mutation = useMutation({
    mutationFn: () => api((c) => c.apiKeys.create({ payload: { name: name.trim(), agentId: scope || null } })),
    onSuccess: (data) => {
      setSecret(data.key)
      void queryClient.invalidateQueries({ queryKey: qk.keys })
    }
  })

  const fixedAgent = agents?.find((a) => a.id === fixedAgentId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {secret ? (
        <DialogContent title="Your new API key" description={name} className="max-w-xl" footer={<Button onClick={() => onOpenChange(false)}>I've saved it</Button>}>
          <SecretReveal secret={secret} />
        </DialogContent>
      ) : (
        <DialogContent
          title="Create API key"
          description={fixedAgent ? `Scoped to ${fixedAgent.name}: it can only use this agent's inboxes.` : "Keys authenticate the REST API and the MCP server."}
          footer={
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form="create-key" loading={mutation.isPending} disabled={!name.trim()}>
                <KeyRound /> Create key
              </Button>
            </>
          }
        >
          <form
            id="create-key"
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim()) mutation.mutate()
            }}
          >
            <Field label="Name" htmlFor="key-name" hint="Something to recognise it by, e.g. where it's deployed.">
              <Input id="key-name" autoFocus maxLength={80} placeholder="Production worker" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            {fixedAgentId ? null : (
              <Field
                label="Access"
                htmlFor="key-scope"
                hint={scope ? "Agent keys can read and send only from that agent's inboxes." : "Account keys can manage every agent, inbox, domain and key."}
              >
                <NativeSelect id="key-scope" value={scope} onChange={setScope}>
                  <option value="">Full account access</option>
                  {agents?.map((a) => (
                    <option key={a.id} value={a.id}>
                      Agent: {a.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <FailureNote error={mutation.error} />
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
