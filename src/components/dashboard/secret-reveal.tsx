import { AlertTriangle, Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { CodeTabs } from "~/components/ui/code"
import { CopyButton } from "~/components/ui/misc"
import { cn } from "~/lib/utils"
import { connectSnippets } from "./connect"

/** One-time display of a secret, with copy + ready-to-paste snippets. */
export const SecretReveal = ({ secret, label = "API key", withSnippets = true, className }: { secret: string; label?: string; withSnippets?: boolean; className?: string }) => {
  const [visible, setVisible] = useState(true)
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex items-start gap-2.5 rounded-xl border border-warn/25 bg-warn-soft px-3.5 py-3 text-[13px] text-warn">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>Copy this key now — it won't be shown again. Store it like a password.</span>
      </div>
      <div>
        <div className="mb-1.5 text-[12px] font-medium text-muted">{label}</div>
        <div className="flex items-center gap-1 rounded-[10px] border border-line bg-surface-2 py-1 pr-1 pl-3 shadow-card">
          <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{visible ? secret : "•".repeat(Math.min(secret.length, 48))}</code>
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-bg-subtle hover:text-ink"
            aria-label={visible ? "Hide secret" : "Show secret"}
          >
            {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
          <CopyButton value={secret} label={`${label} copied`} />
        </div>
      </div>
      {withSnippets ? <CodeTabs tabs={connectSnippets(secret)} /> : null}
    </div>
  )
}
