import { useState, type ReactNode } from "react"
import { cn } from "~/lib/utils"
import { CopyButton } from "./misc"

type Lang = "bash" | "json" | "ts" | "py" | "text" | "http"

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Tiny, dependency-free highlighter. Good enough for docs snippets. */
/** Snippets are static, so each is highlighted once however often the page around it re-renders. */
const highlighted = new Map<string, string>()
export const highlight = (code: string, lang: Lang): string => {
  const key = `${lang}\u0000${code}`
  let html = highlighted.get(key)
  if (html === undefined) {
    html = tokenize(code, lang)
    if (highlighted.size < 500) highlighted.set(key, html)
  }
  return html
}

const tokenize = (code: string, lang: Lang): string => {
  if (lang === "text") return escape(code)
  const rules: Array<[RegExp, string]> =
    lang === "json"
      ? [
          [/"(?:[^"\\]|\\.)*"(?=\s*:)/g, "tok-p"],
          [/"(?:[^"\\]|\\.)*"/g, "tok-s"],
          [/\b(true|false|null)\b/g, "tok-k"],
          [/-?\b\d+(\.\d+)?\b/g, "tok-n"]
        ]
      : lang === "bash" || lang === "http"
        ? [
            [/#[^\n]*/g, "tok-c"],
            [/"(?:[^"\\]|\\.)*"|'[^']*'/g, "tok-s"],
            [/(^|\s)(-{1,2}[a-zA-Z][\w-]*)/g, "tok-p"],
            [/\b(curl|export|npx|bunx|claude|GET|POST|PATCH|DELETE)\b/g, "tok-f"],
            [/\$[A-Z_]+/g, "tok-n"]
          ]
        : [
            // Strings first, so "https://…" inside a string is never mistaken for a comment.
            [/`(?:[^`\\]|\\.)*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, "tok-s"],
            [/\/\/[^\n]*|#[^\n]*/g, "tok-c"],
            [/\b(const|let|await|async|import|from|export|return|function|if|else|for|of|new|def|print|with|as|while|true|false|None|True|False)\b/g, "tok-k"],
            [/\b\d+(\.\d+)?\b/g, "tok-n"],
            [/\b([a-zA-Z_]\w*)(?=\()/g, "tok-f"]
          ]
  // Tokenise left-to-right so rules never highlight inside one another.
  const tokens: Array<{ start: number; end: number; cls: string; text: string }> = []
  for (const [re, cls] of rules) {
    for (const m of code.matchAll(re)) {
      const offset = m[2] !== undefined && cls === "tok-p" && lang === "bash" ? m[0].indexOf(m[2]) : 0
      const start = m.index! + offset
      const text = offset ? m[2]! : m[0]
      const end = start + text.length
      if (tokens.some((t) => start < t.end && end > t.start)) continue
      tokens.push({ start, end, cls, text })
    }
  }
  tokens.sort((a, b) => a.start - b.start)
  let out = ""
  let cursor = 0
  for (const t of tokens) {
    out += escape(code.slice(cursor, t.start)) + `<span class="${t.cls}">${escape(t.text)}</span>`
    cursor = t.end
  }
  return out + escape(code.slice(cursor))
}

export const CodeBlock = ({ code, lang = "bash", title, className, wrap }: { code: string; lang?: Lang; title?: ReactNode; className?: string; wrap?: boolean }) => (
  <div className={cn("group relative overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0f] text-[#e6e6e1] shadow-card", className)}>
    {title ? (
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-[11px] tracking-wide text-white/50">{title}</span>
        <CopyButton value={code} className="text-white/50 hover:bg-white/10 hover:text-white" />
      </div>
    ) : (
      <CopyButton value={code} className="absolute top-2 right-2 text-white/40 opacity-0 transition group-hover:opacity-100 hover:bg-white/10 hover:text-white focus-visible:opacity-100 [@media(hover:none)]:opacity-100" />
    )}
    <pre className={cn("scrollbar-thin overflow-x-auto p-4 text-[12.5px] leading-[1.7]", wrap && "break-words whitespace-pre-wrap")}>
      <code dangerouslySetInnerHTML={{ __html: highlight(code, lang) }} />
    </pre>
  </div>
)

export const CodeTabs = ({ tabs, className }: { tabs: Array<{ label: string; code: string; lang: Lang }>; className?: string }) => {
  const [active, setActive] = useState(0)
  const tab = tabs[active]!
  return (
    <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0f] text-[#e6e6e1] shadow-card", className)}>
      <div className="flex items-center justify-between border-b border-white/10 pr-2">
        <div className="scrollbar-thin flex overflow-x-auto">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setActive(i)}
              className={cn(
                "relative px-4 py-2.5 font-mono text-[11.5px] whitespace-nowrap transition-colors",
                i === active ? "text-white" : "text-white/40 hover:text-white/70"
              )}
            >
              {t.label}
              {i === active ? <span className="absolute inset-x-3 bottom-0 h-px bg-accent" /> : null}
            </button>
          ))}
        </div>
        <CopyButton value={tab.code} className="text-white/50 hover:bg-white/10 hover:text-white" />
      </div>
      <pre className="scrollbar-thin overflow-x-auto p-4 text-[12.5px] leading-[1.7]">
        <code dangerouslySetInnerHTML={{ __html: highlight(tab.code, tab.lang) }} />
      </pre>
    </div>
  )
}
