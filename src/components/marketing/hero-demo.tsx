import { Check, Inbox, KeyRound, Link2, Loader2, Sparkles } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { cn } from "~/lib/utils"

/**
 * A scripted, looping demo of the core agent flow: self sign-up → human
 * approval → wait for a verification email → extracted code.
 */
const TIMELINE = [700, 1300, 1500, 1200, 1100, 900, 1300, 900, 900, 5200]
const LAST = TIMELINE.length

function useTimeline() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStep(LAST - 1)
      return
    }
    const timer = setTimeout(() => setStep((s) => (s + 1) % LAST), TIMELINE[step])
    return () => clearTimeout(timer)
  }, [step])
  return step
}

const Typed = ({ text, active, done }: { text: string; active: boolean; done: boolean }) => {
  const [count, setCount] = useState(done ? text.length : 0)
  useEffect(() => {
    if (done) {
      setCount(text.length)
      return
    }
    if (!active) {
      setCount(0)
      return
    }
    setCount(0)
    let i = 0
    const id = setInterval(() => {
      i += 2
      setCount(Math.min(i, text.length))
      if (i >= text.length) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [active, done, text])
  return (
    <>
      {text.slice(0, count)}
      {active && count < text.length ? <span className="ml-px inline-block h-3.5 w-1.5 translate-y-0.5 animate-blink bg-accent" /> : null}
    </>
  )
}

const Line = ({ show, children, className }: { show: boolean; children: ReactNode; className?: string }) =>
  show ? <div className={cn("animate-rise whitespace-pre-wrap break-words [animation-duration:.35s]", className)}>{children}</div> : null

export function HeroDemo() {
  const step = useTimeline()
  const arrived = step >= 6

  return (
    <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
      {/* Glow */}
      <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[48px] bg-[radial-gradient(closest-side,rgba(200,245,96,0.28),transparent)] blur-2xl dark:bg-[radial-gradient(closest-side,rgba(200,245,96,0.16),transparent)]" />

      {/* Terminal */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d0f] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.55)]">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 font-mono text-[11px] text-white/40">scout — agent runtime</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] text-white/35">
            <span className="size-1.5 rounded-full bg-accent animate-pulse-dot" /> live
          </span>
        </div>
        <div className="min-h-[300px] px-4 py-4 font-mono text-[12px] leading-[1.75] text-white/80 sm:min-h-[318px] sm:px-5 sm:text-[12.5px] lg:min-h-[380px] [overflow-wrap:anywhere]">
          <div>
            <span className="text-accent">$</span>{" "}
            <Typed text={`curl -X POST agmx.io/api/v1/signup -d '{"name":"Scout"}'`} active={step === 0} done={step > 0} />
          </div>
          <Line show={step >= 1} className="text-white/45">
            {"→ 200 · "}
            <span className="text-white/70">userCode</span> <span className="text-[#e5c07b]">"KQ7M-3XPA"</span>
          </Line>
          <Line show={step >= 2} className="text-white/45">
            {step === 2 ? <Loader2 className="mr-1.5 inline size-3 animate-spin align-[-2px]" /> : <span className="mr-1.5">·</span>}
            waiting for your human to approve…
          </Line>
          <Line show={step >= 3}>
            <span className="text-accent">✓ approved</span> · <span className="text-white">scout@bot.agmx.io</span> · <span className="text-white/50">agmx_agt_••••3fQ</span>
          </Line>
          <div className={cn("mt-3", step < 4 && "invisible")}>
            <span className="text-accent">$</span>{" "}
            <Typed text="curl agmx.io/api/v1/messages/wait?timeout=60" active={step === 4} done={step > 4} />
          </div>
          <Line show={step >= 5} className="text-white/45">
            {step === 5 ? <Loader2 className="mr-1.5 inline size-3 animate-spin align-[-2px]" /> : <span className="mr-1.5">·</span>}
            holding connection open…
          </Line>
          <Line show={step >= 6}>
            <span className="text-[#61afef]">✉ received</span> · noreply@github.com · 1.8s
          </Line>
          <Line show={step >= 7} className="text-white/60">
            {"  "}extracted.codes <span className="text-white/40">=</span> [<span className="rounded bg-accent/15 px-1 text-accent">"482913"</span>]
          </Line>
          <Line show={step >= 8} className="text-white/60">
            {"  "}links[0].kind <span className="text-white/40">=</span> {""}
            <span className="text-[#98c379]">"verify"</span>
          </Line>
          {step >= 8 ? (
            <div className="mt-1">
              <span className="text-accent">$</span> <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-blink bg-accent" />
            </div>
          ) : null}
        </div>
      </div>

      {/* Inbox card */}
      <div
        className={cn(
          "relative z-10 mx-3 -mt-10 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-pop backdrop-blur transition-all duration-700 sm:mx-auto sm:w-[86%] lg:absolute lg:-right-6 lg:-bottom-20 lg:mt-0 lg:w-[74%] xl:-right-12",
          arrived ? "translate-y-0 opacity-100" : "translate-y-3 opacity-90"
        )}
      >
        <div className="flex items-center justify-between px-3 pt-2 pb-2.5">
          <div className="flex items-center gap-2 text-[12px] font-medium">
            <Inbox className="size-3.5 text-muted" /> scout@bot.agmx.io
          </div>
          <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-semibold tabular-nums transition", arrived ? "bg-accent text-accent-fg" : "bg-bg-subtle text-muted")}>
            {arrived ? "1 new" : "0 new"}
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-surface-2">
          {arrived ? (
            <div className="animate-rise p-3.5 [animation-duration:.5s]">
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#24292f] text-white">
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                    <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-semibold">GitHub</span>
                    <span className="shrink-0 text-[11px] text-muted">now</span>
                  </div>
                  <div className="truncate text-[12.5px] font-medium text-ink-2">[GitHub] Please verify your device</div>
                  <div className="mt-0.5 truncate text-[12px] text-muted">Verification code: 482913 · expires in 15 minutes</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
                <span className="inline-flex items-center gap-1 text-[10.5px] font-medium tracking-wide text-faint uppercase">
                  <Sparkles className="size-3" /> Extracted
                </span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-md border border-accent/50 bg-accent-soft px-2 py-0.5 font-mono text-[12px] font-semibold text-accent-ink transition", step >= 7 && "shadow-glow")}>
                  <KeyRound className="size-3" /> 482913
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-[11.5px] text-ink-2">
                  <Link2 className="size-3 text-muted" /> verify link
                </span>
                <span className="ml-auto hidden items-center gap-1 text-[11px] text-ok sm:inline-flex">
                  <Check className="size-3" /> DKIM · SPF
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3.5">
              <span className="skeleton size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-2.5 w-1/3 rounded" />
                <div className="skeleton h-2.5 w-2/3 rounded" />
              </div>
              <span className="text-[11px] text-faint">waiting…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
