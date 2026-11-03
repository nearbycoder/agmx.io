import { AlertTriangle, Info, Lightbulb } from "lucide-react"
import type { ReactNode } from "react"
import { CopyButton } from "~/components/ui/misc"
import { cn } from "~/lib/utils"

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-info-soft text-info",
  POST: "bg-ok-soft text-ok",
  PATCH: "bg-warn-soft text-warn",
  DELETE: "bg-danger-soft text-danger"
}

export const Endpoint = ({ method, path, auth = true }: { method: "GET" | "POST" | "PATCH" | "DELETE"; path: string; auth?: boolean }) => (
  <div className="not-prose my-4 flex items-center gap-2.5 overflow-hidden rounded-xl border border-line bg-surface px-3 py-2 shadow-card">
    <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold", METHOD_STYLES[method])}>{method}</span>
    <code className="min-w-0 flex-1 truncate !border-0 !bg-transparent !p-0 font-mono text-[13px] text-ink">{path}</code>
    {!auth ? <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 text-[10.5px] text-muted">no auth</span> : null}
    <CopyButton value={path} size="xs" />
  </div>
)

export interface Param {
  name: string
  type: string
  required?: boolean
  description: ReactNode
}

export const Params = ({ title = "Parameters", params }: { title?: string; params: Array<Param> }) => (
  <div className="not-prose my-5 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
    <div className="border-b border-line bg-surface-2 px-4 py-2 text-[11.5px] font-medium tracking-wider text-faint uppercase">{title}</div>
    <div className="divide-y divide-line">
      {params.map((p) => (
        <div key={p.name} className="grid gap-1 px-4 py-3 sm:grid-cols-[200px_1fr] sm:gap-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <code className="!border-0 !bg-transparent !p-0 font-mono text-[13px] font-medium text-ink">{p.name}</code>
            <span className="font-mono text-[11px] text-muted">{p.type}</span>
            {p.required ? <span className="text-[10.5px] font-medium text-danger">required</span> : null}
          </div>
          <div className="text-[13.5px] leading-relaxed text-ink-2">{p.description}</div>
        </div>
      ))}
    </div>
  </div>
)

export const Callout = ({ tone = "info", title, children }: { tone?: "info" | "tip" | "warn"; title?: ReactNode; children: ReactNode }) => {
  const Icon = tone === "warn" ? AlertTriangle : tone === "tip" ? Lightbulb : Info
  return (
    <div
      className={cn(
        "not-prose my-5 flex gap-3 rounded-xl border px-4 py-3.5 text-[13.5px] leading-relaxed",
        tone === "warn" && "border-warn/25 bg-warn-soft text-ink-2",
        tone === "tip" && "border-accent/40 bg-accent-soft text-ink-2",
        tone === "info" && "border-line bg-surface-2 text-ink-2"
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "warn" ? "text-warn" : tone === "tip" ? "text-accent-ink" : "text-muted")} />
      <div className="min-w-0 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12.5px] dark:[&_code]:bg-white/10">
        {title ? <div className="mb-0.5 font-semibold text-ink">{title}</div> : null}
        {children}
      </div>
    </div>
  )
}

export const DocTable = ({ head, rows }: { head: Array<ReactNode>; rows: Array<Array<ReactNode>> }) => (
  <div className="not-prose my-5 overflow-x-auto rounded-xl border border-line bg-surface shadow-card">
    <table className="w-full border-collapse text-left text-[13px]">
      <thead>
        <tr className="border-b border-line bg-surface-2">
          {head.map((h, i) => (
            <th key={i} className="px-4 py-2.5 text-[11.5px] font-medium tracking-wider whitespace-nowrap text-faint uppercase">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} className="px-4 py-2.5 align-top text-ink-2 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-ink">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)
