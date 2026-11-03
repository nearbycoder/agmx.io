import { CopyButton } from "~/components/ui/misc"
import { Table, TBody, Td, Th, THead, Tr } from "~/components/ui/table"
import type { DomainT } from "~/shared/api/domain"
import { cn } from "~/lib/utils"

const statusLabel = { verified: "Verified", pending: "Pending", unknown: "Optional" } as const

export const RecordStatus = ({ status }: { status: "verified" | "pending" | "unknown" }) => (
  <span className="inline-flex items-center gap-1.5 text-[12.5px] whitespace-nowrap text-muted">
    <span className={cn("size-1.5 rounded-full", status === "verified" ? "bg-ok" : status === "pending" ? "bg-warn" : "bg-faint")} />
    {statusLabel[status]}
  </span>
)

const Copyable = ({ value }: { value: string }) => (
  <span className="group/cell flex min-w-0 items-center gap-1">
    <code className="truncate font-mono text-[12.5px] text-ink-2" title={value}>
      {value}
    </code>
    <CopyButton value={value} size="xs" className="opacity-60 group-hover/cell:opacity-100" />
  </span>
)

export const DnsRecordTable = ({ records }: { records: DomainT["records"] }) => (
  <Table className="rounded-none border-0">
    <THead>
      <Th className="w-20">Type</Th>
      <Th>Name</Th>
      <Th>Value</Th>
      <Th className="w-28">Status</Th>
    </THead>
    <TBody>
      {records.map((r, i) => (
        <Tr key={i}>
          <Td>
            <code className="font-mono text-[12px] font-medium">{r.type}</code>
          </Td>
          <Td className="max-w-[260px]">
            <Copyable value={r.name} />
            <div className="text-[12px] text-muted">{r.purpose}</div>
          </Td>
          <Td className="max-w-[320px]">
            <span className="flex min-w-0 items-center gap-1.5">
              {r.priority !== undefined ? <span className="font-mono text-[12px] text-muted">{r.priority}</span> : null}
              <Copyable value={r.value} />
            </span>
          </Td>
          <Td>
            <RecordStatus status={r.status} />
          </Td>
        </Tr>
      ))}
    </TBody>
  </Table>
)
