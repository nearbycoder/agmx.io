import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import type { MessageT } from "~/shared/api/domain"
import { cn } from "~/lib/utils"

const FRAME_STYLE = `
  html,body{margin:0;padding:0;background:#ffffff;color:#1a1a1a}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;padding:20px;word-wrap:break-word;overflow-wrap:anywhere}
  img{max-width:100%;height:auto}
  table{max-width:100%}
  pre{white-space:pre-wrap}
  a{color:#2563eb}
  blockquote{margin:0 0 0 .8ex;border-left:2px solid #ddd;padding-left:1ex;color:#555}
`

/**
 * Renders untrusted email HTML inside a sandboxed iframe. Scripts, forms and
 * top navigation are blocked (no `allow-scripts`); `allow-same-origin` is only
 * granted so the parent can measure the content height. Links open in a new tab.
 */
export function HtmlFrame({ html, attachments }: { html: string; attachments: MessageT["attachments"] }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(160)

  const srcDoc = useMemo(() => {
    let body = html
    // Resolve inline `cid:` images to their attachment URLs.
    for (const a of attachments) {
      if (!a.contentId) continue
      body = body.split(`cid:${a.contentId}`).join(`${a.downloadUrl}?inline=1`)
    }
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><base target="_blank"><style>${FRAME_STYLE}</style></head><body>${body}</body></html>`
  }, [html, attachments])

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    let observer: ResizeObserver | undefined
    const measure = () => {
      const doc = frame.contentDocument
      if (!doc?.documentElement) return
      setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, 60), 20000))
    }
    const onLoad = () => {
      measure()
      const doc = frame.contentDocument
      if (doc?.body && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(measure)
        observer.observe(doc.body)
      }
      doc?.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure))
    }
    frame.addEventListener("load", onLoad)
    return () => {
      frame.removeEventListener("load", onLoad)
      observer?.disconnect()
    }
  }, [srcDoc])

  return (
    <iframe
      ref={ref}
      title="Email content"
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className="mail-html block w-full rounded-xl border border-line bg-white"
      style={{ height }}
    />
  )
}

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g

/** Plain text with linkified URLs and dimmed quoted replies. */
export function PlainBody({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const firstQuote = lines.findIndex((l, i) => l.startsWith(">") || (/^On .+wrote:$/.test(l.trim()) && lines[i + 1]?.startsWith(">")))
  const [showQuoted, setShowQuoted] = useState(false)
  const visible = firstQuote > 0 && !showQuoted ? lines.slice(0, firstQuote) : lines
  return (
    <div className={cn("text-[14px] leading-[1.65] text-ink-2", className)}>
      <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
        {visible.map((line, i) => (
          <Fragment key={i}>
            <span className={line.startsWith(">") ? "text-muted" : undefined}>
              {line.split(URL_RE).map((part, j) =>
                /^https?:\/\//.test(part) ? (
                  <a key={j} href={part} target="_blank" rel="noreferrer noopener" className="text-info underline decoration-info/30 underline-offset-2 hover:decoration-info">
                    {part}
                  </a>
                ) : (
                  <Fragment key={j}>{part}</Fragment>
                )
              )}
            </span>
            {i < visible.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </div>
      {firstQuote > 0 ? (
        <button
          type="button"
          onClick={() => setShowQuoted((v) => !v)}
          className="mt-3 inline-flex h-6 items-center rounded-md border border-line bg-surface-2 px-2 font-mono text-[11px] text-muted transition hover:text-ink"
          aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"}
        >
          {showQuoted ? "hide quoted" : "•••"}
        </button>
      ) : null}
    </div>
  )
}
