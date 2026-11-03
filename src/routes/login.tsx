import { seo, siteUrlFrom } from "~/lib/seo"
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router"
import { KeyRound, Mail, Sparkles } from "lucide-react"
import { useState } from "react"
import { Logo } from "~/components/brand"
import { Button } from "~/components/ui/button"
import { Field, Input } from "~/components/ui/input"
import { authClient } from "~/lib/auth-client"
import { getSessionUser } from "~/lib/session"
import { cn } from "~/lib/utils"

interface LoginSearch {
  redirect?: string
  error?: string
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" && search.redirect.startsWith("/") ? search.redirect : undefined,
    error: typeof search.error === "string" ? search.error : undefined
  }),
  beforeLoad: async ({ search }) => {
    const user = await getSessionUser()
    if (user) throw redirect({ to: search.redirect ?? "/app" })
  },
  head: ({ match }) => seo({ siteUrl: siteUrlFrom(match), path: "/login", title: "Sign in — AGMX", noindex: true }),
  component: LoginPage
})

function LoginPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const [mode, setMode] = useState<"magic" | "password">("magic")
  const [passwordMode, setPasswordMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(search.error ? "That sign-in link is invalid or has expired." : null)
  const destination = search.redirect ?? "/app"

  const submitMagic = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await authClient.signIn.magicLink({ email, callbackURL: destination, errorCallbackURL: "/login?error=link" })
    setLoading(false)
    if (error) setError(error.message ?? "Couldn't send the link.")
    else setSent(true)
  }

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result =
      passwordMode === "signin"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: name || email.split("@")[0]! })
    setLoading(false)
    if (result.error) setError(result.error.message ?? "Sign-in failed.")
    else void navigate({ to: destination })
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link to="/" className="w-fit">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          {sent ? (
            <div className="animate-rise text-center">
              <Mail className="mx-auto mb-5 size-6 text-faint" />
              <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Check your inbox</h1>
              <p className="mt-2 text-[14px] leading-relaxed text-muted">
                We sent a sign-in link to <span className="font-medium text-ink">{email}</span>. It expires in 15 minutes.
              </p>
              <Button variant="ghost" className="mt-6" onClick={() => setSent(false)}>
                Use a different email
              </Button>
            </div>
          ) : (
            <div className="animate-rise">
              <h1 className="text-[26px] font-semibold tracking-[-0.03em]">Sign in to AGMX</h1>
              <p className="mt-1.5 text-[14px] text-muted">Manage your agents and their inboxes.</p>

              <div className="mt-8 grid grid-cols-2 gap-1 rounded-lg border border-line bg-bg-subtle p-0.5">
                {(
                  [
                    ["magic", "Email link", Sparkles],
                    ["password", "Password", KeyRound]
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setMode(value)
                      setError(null)
                    }}
                    className={cn(
                      "flex h-[30px] items-center justify-center gap-2 rounded-md text-[13px] font-medium transition-colors",
                      mode === value ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {mode === "magic" ? (
                <form onSubmit={submitMagic} className="mt-6 flex flex-col gap-4">
                  <Field label="Email" htmlFor="email">
                    <Input id="email" type="email" required autoFocus autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                  {error ? <ErrorNote message={error} /> : null}
                  <Button type="submit" size="lg" loading={loading} className="w-full">
                    Email me a sign-in link
                  </Button>
                </form>
              ) : (
                <form onSubmit={submitPassword} className="mt-6 flex flex-col gap-4">
                  {passwordMode === "signup" ? (
                    <Field label="Name" htmlFor="name">
                      <Input id="name" autoComplete="name" placeholder="Ada Lovelace" value={name} onChange={(e) => setName(e.target.value)} />
                    </Field>
                  ) : null}
                  <Field label="Email" htmlFor="email2">
                    <Input id="email2" type="email" required autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                  <Field label="Password" htmlFor="password" hint={passwordMode === "signup" ? "At least 10 characters." : undefined}>
                    <Input
                      id="password"
                      type="password"
                      required
                      minLength={passwordMode === "signup" ? 10 : undefined}
                      autoComplete={passwordMode === "signin" ? "current-password" : "new-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  {error ? <ErrorNote message={error} /> : null}
                  <Button type="submit" size="lg" loading={loading} className="w-full">
                    {passwordMode === "signin" ? "Sign in" : "Create account"}
                  </Button>
                  <button
                    type="button"
                    className="text-center text-[13px] text-muted hover:text-ink"
                    onClick={() => setPasswordMode(passwordMode === "signin" ? "signup" : "signin")}
                  >
                    {passwordMode === "signin" ? "First time here? Create an account" : "Already have an account? Sign in"}
                  </button>
                </form>
              )}

              <p className="mt-8 text-[12.5px] text-muted">AGMX is invite-only during early access.</p>
            </div>
          )}
        </div>
      </div>
      <AsidePanel />
    </div>
  )
}

const ErrorNote = ({ message }: { message: string }) => (
  <div className="animate-fade-in rounded-lg border border-danger/20 bg-danger-soft px-3 py-2 text-[13px] text-danger">{message}</div>
)

function AsidePanel() {
  const lines = [
    { t: "02:14:07", text: "POST /api/v1/signup", tone: "muted" },
    { t: "02:14:08", text: "→ approval requested · code KQ7M-3XPA", tone: "muted" },
    { t: "02:14:31", text: "✓ approved", tone: "accent" },
    { t: "02:14:32", text: "inbox ready · scout@bot.agmx.io", tone: "ink" },
    { t: "02:15:02", text: "GET /messages/wait", tone: "muted" },
    { t: "02:15:09", text: "✉ noreply@github.com · code 482913", tone: "ink" }
  ]
  return (
    <div className="hidden border-l border-line bg-[#0b0b0c] lg:block dark:bg-[#0e0e10]">
      <div className="flex h-full flex-col justify-between p-12 text-white">
        <div className="max-w-md">
          <h2 className="text-3xl leading-[1.12] font-semibold tracking-[-0.03em] text-balance">Give every agent an inbox it can actually use.</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/55">Real addresses, verification codes extracted for you, threaded replies, webhooks and an MCP server.</p>
        </div>
        <div className="rounded-xl border border-white/10 p-5 font-mono text-[12.5px] leading-[1.9]">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-4">
              <span className="text-white/30 tabular-nums">{line.t}</span>
              <span className={line.tone === "accent" ? "text-accent" : line.tone === "ink" ? "text-white" : "text-white/50"}>{line.text}</span>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-white/45">Open source · self-host on your own Amazon SES account</p>
      </div>
    </div>
  )
}
