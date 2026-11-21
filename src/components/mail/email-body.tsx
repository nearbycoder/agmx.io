import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import type { MessageT } from "~/shared/api/domain"
import { useTheme } from "~/lib/theme"
import { cn } from "~/lib/utils"

const frameStyle = (padding: string) => `
  html,body{margin:0;padding:0;background:#ffffff;color:#1a1a1a}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;padding:${padding};word-wrap:break-word;overflow-wrap:anywhere}
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
  // Light mode: the email sits flush on the white reading pane. Dark mode: it's an inset white sheet.
  const { resolved } = useTheme()
  const dark = resolved === "dark"

  const srcDoc = useMemo(() => {
    let body = html
    // Resolve inline `cid:` images to their attachment URLs.
    for (const a of attachments) {
      if (!a.contentId) continue
      body = body.split(`cid:${a.contentId}`).join(`${a.downloadUrl}?inline=1`)
    }
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><base target="_blank"><style>${frameStyle(dark ? "20px" : "0")}</style></head><body>${body}</body></html>`
  }, [html, attachments, dark])

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
      className={cn("mail-html block w-full bg-white", dark && "rounded-lg")}
      style={{ height }}
    />
  )
}

const URL_RE = /(https?:\/\/[^\s<>"')\]]+)/g

const splitTrailingPunct = (url: string): [string, string] => {
  const m = url.match(/^(.*?)([.,;:!?]+)$/)
  return m ? [m[1]!, m[2]!] : [url, ""]
}

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
              {line.split(URL_RE).map((part, j) => {
                if (!/^https?:\/\//.test(part)) return <Fragment key={j}>{part}</Fragment>
                const [href, punct] = splitTrailingPunct(part)
                return (
                  <Fragment key={j}>
                    <a href={href} target="_blank" rel="noreferrer noopener" className="text-info underline decoration-info/30 underline-offset-2 hover:decoration-info">
                      {href}
                    </a>
                    {punct}
                  </Fragment>
                )
              })}
            </span>
            {i < visible.length - 1 ? "\n" : null}
          </Fragment>
        ))}
      </div>
      {firstQuote > 0 ? (
        <button
          type="button"
          onClick={() => setShowQuoted((v) => !v)}
          className="mt-3 inline-flex h-5 items-center rounded-md px-1.5 text-[12px] text-muted ring-1 ring-line transition-colors hover:text-ink hover:ring-line-strong"
          aria-label={showQuoted ? "Hide quoted text" : "Show quoted text"}
        >
          {showQuoted ? "Hide quoted text" : "•••"}
        </button>
      ) : null}
    </div>
  )
}
