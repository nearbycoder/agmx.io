import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { AtSign, CheckCircle2, Clock, Globe, Plus, RefreshCw, Trash2, XCircle } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Page, PageHeader } from "~/components/app/page"
import { FailureNote, toastFailure, UpgradePanel } from "~/components/dashboard/common"
import { DnsRecordTable } from "~/components/dashboard/dns-records"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Card } from "~/components/ui/card"
import { ConfirmDialog, Dialog, DialogContent } from "~/components/ui/dialog"
import { Field, Input } from "~/components/ui/input"
import { EmptyState, Skeleton } from "~/components/ui/misc"
import { api } from "~/lib/api"
import { qk, useDomains, useMe } from "~/lib/queries"
import type { DomainT } from "~/shared/api/domain"
import { relativeTime } from "~/lib/utils"

export const Route = createFileRoute("/app/domains")({
  head: () => ({ meta: [{ title: "Domains — AGMX" }] }),
  component: DomainsPage
})

const statusBadge = (status: string) =>
  status === "verified" ? (
    <Badge tone="ok">
      <CheckCircle2 /> Verified
    </Badge>
  ) : status === "failed" ? (
    <Badge tone="danger">
      <XCircle /> Failed
    </Badge>
  ) : (
    <Badge tone="warn">
      <Clock /> Pending DNS
    </Badge>
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
        description="Send and receive as your own brand — e.g. support@mail.yourco.com — instead of the shared domain."
        actions={
          gated ? null : (
            <Button onClick={() => setAdding(true)} disabled={Boolean(atLimit)}>
              <Plus /> Add domain
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ink text-accent">
            <AtSign className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[14px] font-medium">{me?.mailDomain ?? "agmx.io"}</span>
              <Badge tone="accent">Shared · always on</Badge>
            </div>
            <p className="mt-0.5 text-[13px] text-muted">Every account can claim addresses on the shared domain with zero DNS setup. Great for sign-ups and testing.</p>
          </div>
          {plan && plan.customDomains !== null && plan.customDomains > 0 ? (
            <span className="text-[12.5px] text-muted tabular-nums">
              {domains?.length ?? 0} / {plan.customDomains} custom domains
            </span>
          ) : null}
        </Card>

        {gated ? (
          <UpgradePanel
            title="Custom domains are on Pro and Scale"
            description={`Your ${plan?.name} plan uses the shared ${me?.mailDomain} domain. Upgrade to connect your own domain with DKIM-signed sending and inbound routing.`}
          />
        ) : null}

        {isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : domains?.length ? (
          domains.map((d) => <DomainCard key={d.id} domain={d} />)
        ) : gated ? null : (
          <div className="rounded-2xl border border-dashed border-line-strong bg-surface/50">
            <EmptyState
              icon={<Globe />}
              title="No custom domains yet"
              description="Add a domain (a subdomain like mail.yourco.com is ideal), publish the DNS records we give you, and we'll verify it automatically."
              action={
                <Button onClick={() => setAdding(true)}>
                  <Plus /> Add your first domain
                </Button>
              }
            />
          </div>
        )}
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
      else toast("Still waiting on DNS", { description: "Records can take a few minutes (rarely up to 48h) to propagate." })
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
    <Card className="animate-rise overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Globe className="size-5 shrink-0 text-muted" />
          <span className="truncate font-mono text-[15px] font-semibold">{domain.name}</span>
          {statusBadge(domain.status)}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[12px] text-faint sm:inline">checked {relativeTime(domain.lastCheckedAt)}</span>
          <Button size="sm" variant="secondary" loading={verify.isPending} onClick={() => verify.mutate()}>
            <RefreshCw /> Check DNS
          </Button>
          <Button size="icon-sm" variant="danger-ghost" onClick={() => setDeleting(true)} aria-label={`Remove ${domain.name}`}>
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Check ok={domain.dkimStatus === "SUCCESS"} title="Sending (DKIM)" body={domain.dkimStatus === "SUCCESS" ? "Mail from this domain is signed and trusted." : "Publish the three CNAME records."} />
          <Check ok={domain.mxVerified} title="Receiving (MX)" body={domain.mxVerified ? "Inbound mail is routed to AGMX." : "Point the MX record at Amazon SES."} />
        </div>
        <DnsRecordTable records={domain.records} />
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Remove ${domain.name}?`}
        description="All inboxes on this domain and their messages will be deleted, and the domain stops sending and receiving through AGMX."
        confirmLabel="Remove domain"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  )
}

const Check = ({ ok, title, body }: { ok: boolean; title: string; body: string }) => (
  <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5">
    {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <Clock className="mt-0.5 size-4 shrink-0 text-warn" />}
    <div>
      <div className="text-[13px] font-medium">{title}</div>
      <div className="text-[12.5px] text-muted">{body}</div>
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
        description="We'll register it with Amazon SES and give you DNS records to publish."
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
          <Field label="Domain" htmlFor="domain-name" hint="Use a subdomain (e.g. mail.yourco.com) so your existing MX records stay untouched.">
            <Input id="domain-name" autoFocus placeholder="mail.yourco.com" className="font-mono" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} spellCheck={false} autoComplete="off" />
          </Field>
          <FailureNote error={mutation.error} />
        </form>
      </DialogContent>
    </Dialog>
  )
}
