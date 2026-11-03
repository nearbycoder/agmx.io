import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import { CodeTabs } from "~/components/ui/code"
import { CopyButton } from "~/components/ui/misc"
import { cn } from "~/lib/utils"
import { Notice } from "./common"
import { connectSnippets } from "./connect"

/** One-time display of a secret, with copy + ready-to-paste snippets. */
export const SecretReveal = ({ secret, label = "API key", withSnippets = true, className }: { secret: string; label?: string; withSnippets?: boolean; className?: string }) => {
  const [visible, setVisible] = useState(true)
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <Notice tone="warn">Copy this key now. It won't be shown again, so store it somewhere safe.</Notice>
      <div>
        <div className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</div>
        <div className="flex h-10 items-center gap-0.5 rounded-lg border border-line bg-bg-subtle/50 pr-1 pl-3">
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
