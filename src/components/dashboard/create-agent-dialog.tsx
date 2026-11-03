import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AgentAvatar } from "~/components/brand"
import { Button } from "~/components/ui/button"
import { Dialog, DialogContent } from "~/components/ui/dialog"
import { AddonInput, Field, Input, Textarea } from "~/components/ui/input"
import { Switch } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { qk, useDomains, useMe } from "~/lib/queries"
import { normalizeUsername } from "~/shared/address"
import type { AgentT } from "~/shared/api/domain"
import { ColorPicker, type AgentColorName } from "./color-picker"
import { FailureNote, NativeSelect } from "./common"
import { SecretReveal } from "./secret-reveal"
import { usernameProblem } from "./username-hint"

export const CreateAgentDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => {
  const queryClient = useQueryClient()
  const { data: me } = useMe()
  const { data: domains } = useDomains()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [color, setColor] = useState<AgentColorName>("lime")
  const [username, setUsername] = useState("")
  const [domain, setDomain] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [createKey, setCreateKey] = useState(true)
  const [result, setResult] = useState<{ agent: AgentT; apiKey: string | null } | null>(null)

  const mailDomain = me?.mailDomain ?? "agmx.io"
  const verifiedDomains = domains?.filter((d) => d.status === "verified") ?? []
  const domainOptions = [...(me?.operatorDomain ? [me.operatorDomain] : []), ...verifiedDomains.map((d) => d.name)]
  const selectedDomain = domain || mailDomain
  const problem = usernameProblem(username, selectedDomain === mailDomain)
  const suggested = normalizeUsername(name).replace(/[^a-z0-9._-]/g, "").slice(0, 32)

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setName("")
        setDescription("")
        setColor("lime")
        setUsername("")
        setDomain("")
        setWebhookUrl("")
        setCreateKey(true)
        setResult(null)
        mutation.reset()
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  const mutation = useMutation({
    mutationFn: () =>
      api((c) =>
        c.agents.create({
          payload: {
            name: name.trim(),
            description: description.trim() || null,
            color,
            username: (username.trim() || suggested || undefined) as string | undefined,
            domain: domain || undefined,
            webhookUrl: webhookUrl.trim() || null,
            createApiKey: createKey
          }
        })
      ),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: qk.agents })
      void queryClient.invalidateQueries({ queryKey: qk.inboxes })
      void queryClient.invalidateQueries({ queryKey: qk.me })
      void queryClient.invalidateQueries({ queryKey: qk.keys })
      setResult(data)
      toast.success(`${data.agent.name} is ready`)
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {result ? (
        <DialogContent
          title={
            <span className="flex items-center gap-2.5">
              <AgentAvatar name={result.agent.name} color={result.agent.color} size="sm" /> {result.agent.name} is live
            </span>
          }
          description={result.agent.inboxes[0] ? <>Inbox <span className="font-mono text-ink">{result.agent.inboxes[0].address}</span> is receiving mail now.</> : undefined}
          className="max-w-xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Done
              </Button>
              <Link to="/app/agents/$agentId" params={{ agentId: result.agent.id }} onClick={() => onOpenChange(false)}>
                <Button>
                  Open agent <ArrowRight />
                </Button>
              </Link>
            </>
          }
        >
          {result.apiKey ? (
            <SecretReveal secret={result.apiKey} label="Agent API key" />
          ) : (
            <p className="text-sm text-muted">No API key was created. You can mint one from the agent page whenever you're ready.</p>
          )}
        </DialogContent>
      ) : (
        <DialogContent
          title="New agent"
          description="An agent gets its own inbox, API key and webhook."
          className="max-w-xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form="create-agent" loading={mutation.isPending} disabled={!name.trim() || Boolean(problem)}>
                Create agent
              </Button>
            </>
          }
        >
          <form
            id="create-agent"
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim() && !problem) mutation.mutate()
            }}
          >
            <div className="flex items-start gap-4">
              <AgentAvatar name={name || "Agent"} color={color} size="lg" className="mt-[26px]" />
              <div className="flex flex-1 flex-col gap-4">
                <Field label="Name" htmlFor="agent-name">
                  <Input id="agent-name" autoFocus required maxLength={80} placeholder="Research assistant" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field label="Color">
                  <ColorPicker value={color} onChange={setColor} />
                </Field>
              </div>
            </div>
            <Field label="Description" htmlFor="agent-desc" hint="Optional. Helps you tell agents apart.">
              <Textarea id="agent-desc" className="min-h-16" maxLength={500} placeholder="Signs up for tools and triages newsletters" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Field
              label="Inbox address"
              htmlFor="agent-username"
              error={problem}
              hint={username.trim() ? undefined : suggested ? `Leave blank to use ${suggested}@${selectedDomain}` : "Leave blank for a random address."}
            >
              <div className="flex gap-2">
                <AddonInput
                  id="agent-username"
                  className="flex-1"
                  placeholder={suggested || "scout"}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  suffix={domainOptions.length ? undefined : `@${mailDomain}`}
                  autoComplete="off"
                  spellCheck={false}
                />
                {domainOptions.length ? (
                  <NativeSelect value={domain} onChange={setDomain} className="w-44 font-mono text-[13px]" aria-label="Domain">
                    <option value="">@{mailDomain}</option>
                    {domainOptions.map((name) => (
                      <option key={name} value={name}>
                        @{name}
                      </option>
                    ))}
                  </NativeSelect>
                ) : null}
              </div>
            </Field>
            <Field label="Webhook URL" htmlFor="agent-webhook" hint="Optional. We'll POST signed events here when mail arrives.">
              <Input id="agent-webhook" type="url" placeholder="https://example.com/hooks/agmx" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            </Field>
            <label htmlFor="agent-key" className="flex cursor-pointer items-center justify-between gap-4 border-t border-line pt-4">
              <span>
                <span className="block text-[13.5px] font-medium">Create an agent API key</span>
                <span className="block text-[12.5px] text-muted">Scoped to this agent only. Shown once after creation.</span>
              </span>
              <Switch id="agent-key" checked={createKey} onCheckedChange={setCreateKey} />
            </label>
            <FailureNote error={mutation.error} />
          </form>
        </DialogContent>
      )}
    </Dialog>
  )
}
