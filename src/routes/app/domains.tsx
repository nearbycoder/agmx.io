import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { CheckCircle2, Clock, Globe, MoreHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Page, PageHeader } from "~/components/app/page"
import { FailureNote, toastFailure, UpgradePanel } from "~/components/dashboard/common"
import { DnsRecordTable } from "~/components/dashboard/dns-records"
import { Panel, Section } from "~/components/dashboard/section"
import { Button } from "~/components/ui/button"
import { DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger } from "~/components/ui/menu"
import { ConfirmDialog, Dialog, DialogContent } from "~/components/ui/dialog"
import { Field, Input } from "~/components/ui/input"
import { EmptyState, Skeleton } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { qk, useDomains, useMe } from "~/lib/queries"
import type { DomainT } from "~/shared/api/domain"
import { cn, relativeTime } from "~/lib/utils"

export const Route = createFileRoute("/app/domains")({
  head: () => ({ meta: [{ title: "Domains — AGMX" }] }),
  component: DomainsPage
})

const DomainStatus = ({ status }: { status: string }) => (
  <span className="inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap text-muted">
    <span className={cn("size-1.5 rounded-full", status === "verified" ? "bg-ok" : status === "failed" ? "bg-danger" : "bg-warn")} />
    {status === "verified" ? "Verified" : status === "failed" ? "Verification failed" : "Waiting for DNS"}
  </span>
)

function DomainsPage() {
  const { data: me } = useMe()
  const { data: domains, isLoading } = useDomains()
  const [adding, setAdding] = useState(false)
  const plan = me?.plan
  const gated = plan?.customDomains === 0
  const atLimit = plan && plan.customDomains !== null && (domains?.length ?? 0) >= plan.customDomains

  return (
    <Page>
      <PageHeader
        title="Domains"
        description="Send and receive from your own domain, such as support@mail.yourco.com."
        actions={
          gated ? null : (
            <Button onClick={() => setAdding(true)} disabled={Boolean(atLimit)}>
              <Plus /> Add domain
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-10">
        <Section title="Shared domain">
          <Panel className="flex flex-col gap-1 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <code className="font-mono text-[14px] font-medium">{me?.mailDomain ?? "…"}</code>
              <p className="mt-1 text-[13px] text-muted">Available to every account with no DNS setup. Good for sign-ups and testing.</p>
            </div>
            <DomainStatus status="verified" />
          </Panel>
        </Section>

        <Section
          title="Custom domains"
          description={plan && plan.customDomains !== null && plan.customDomains > 0 ? `${domains?.length ?? 0} of ${plan.customDomains} on your plan` : undefined}
        >
          {gated ? (
            <UpgradePanel
              title="Custom domains are available on Pro and Scale"
              description={`Your ${plan?.name} plan uses the shared ${me?.mailDomain} domain. Upgrade to send and receive from your own domain with DKIM signing.`}
            />
          ) : isLoading ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : domains?.length ? (
            <div className="flex flex-col gap-6">
              {domains.map((d) => (
                <DomainCard key={d.id} domain={d} />
              ))}
            </div>
          ) : (
            <Panel>
              <EmptyState
                icon={<Globe />}
                title="No custom domains"
                description="Add a domain (a subdomain like mail.yourco.com works best), publish the DNS records we show you, and it verifies automatically."
                action={
                  <Button onClick={() => setAdding(true)}>
                    <Plus /> Add domain
                  </Button>
                }
              />
            </Panel>
          )}
        </Section>
      </div>
      <AddDomainDialog open={adding} onOpenChange={setAdding} />
    </Page>
  )
}

function DomainCard({ domain }: { domain: DomainT }) {
  const queryClient = useQueryClient()
  const [deleting, setDeleting] = useState(false)
  const verify = useMutation({
    mutationFn: () => api((c) => c.domains.verify({ params: { domainId: domain.id } })),
    onSuccess: (d) => {
      void queryClient.invalidateQueries({ queryKey: qk.domains })
      if (d.status === "verified") toast.success(`${d.name} is verified`)
      else toast("Still waiting for DNS", { description: "Records usually propagate within minutes, occasionally up to 48 hours." })
    },
    onError: (e) => toastFailure(e)
  })
  const remove = useMutation({
    mutationFn: () => api((c) => c.domains.delete({ params: { domainId: domain.id } })),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.domains })
      void queryClient.invalidateQueries({ queryKey: qk.agents })
      void queryClient.invalidateQueries({ queryKey: qk.me })
      toast.success(`${domain.name} removed`)
      setDeleting(false)
    },
    onError: (e) => toastFailure(e)
  })
  return (
    <Panel>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <code className="truncate font-mono text-[14px] font-medium">{domain.name}</code>
          <DomainStatus status={domain.status} />
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[12px] text-muted sm:inline">Checked {relativeTime(domain.lastCheckedAt)}</span>
          <Button size="sm" variant="secondary" loading={verify.isPending} onClick={() => verify.mutate()}>
            <RefreshCw /> Check DNS
          </Button>
          <DropdownMenu>
            <DropdownTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${domain.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<Trash2 />} danger onSelect={() => setDeleting(true)}>
                Remove domain
              </DropdownItem>
            </DropdownContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="grid divide-y divide-line border-b border-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Requirement ok={domain.dkimStatus === "SUCCESS"} title="Sending" body={domain.dkimStatus === "SUCCESS" ? "Mail is DKIM-signed and trusted." : "Publish the three CNAME records."} />
        <Requirement ok={domain.mxVerified} title="Receiving" body={domain.mxVerified ? "Inbound mail routes to AGMX." : "Point the MX record at Amazon SES."} />
      </div>
      <DnsRecordTable records={domain.records} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Remove ${domain.name}?`}
        description="Every inbox on this domain and its messages will be deleted, and the domain stops sending and receiving through AGMX."
        confirmLabel="Remove domain"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Panel>
  )
}

const Requirement = ({ ok, title, body }: { ok: boolean; title: string; body: string }) => (
  <div className="flex items-start gap-2.5 px-5 py-3.5">
    {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Clock className="mt-0.5 size-4 shrink-0 text-warn" />}
    <div>
      <div className="text-[13.5px] font-medium">{title}</div>
      <div className="text-[13px] text-muted">{body}</div>
    </div>
  </div>
)

function AddDomainDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  useEffect(() => {
    if (!open) {
      setName("")
      mutation.reset()
    }
  }, [open])
  const mutation = useMutation({
    mutationFn: () => api((c) => c.domains.create({ payload: { name: name.trim() } })),
    onSuccess: (d) => {
      void queryClient.invalidateQueries({ queryKey: qk.domains })
      void queryClient.invalidateQueries({ queryKey: qk.me })
      toast.success(`${d.name} added`, { description: d.status === "verified" ? "Verified and ready to use." : "Publish the DNS records to verify it." })
      onOpenChange(false)
    }
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add a domain"
        description="We register it with Amazon SES and show you the DNS records to publish."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-domain" loading={mutation.isPending} disabled={!name.trim()}>
              Add domain
            </Button>
          </>
        }
      >
        <form
          id="add-domain"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) mutation.mutate()
          }}
        >
          <Field label="Domain" htmlFor="domain-name" hint="A subdomain such as mail.yourco.com keeps your existing mail setup untouched.">
            <Input id="domain-name" autoFocus placeholder="mail.yourco.com" className="font-mono" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} autoComplete="off" />
          </Field>
          <FailureNote error={mutation.error} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
