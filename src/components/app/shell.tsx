import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  Bot,
  BookOpen,
  ChevronsUpDown,
  Globe,
  Inbox,
  KeyRound,
  LayoutGrid,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PenSquare,
  Search,
  Settings,
  Shield,
  Sun
} from "lucide-react"
import { useState, type ReactNode } from "react"
import { AgentAvatar, Logo } from "~/components/brand"
import { Button } from "~/components/ui/button"
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger } from "~/components/ui/menu"
import { Kbd, Meter } from "~/components/ui/misc"
import { authClient } from "~/lib/auth-client"
import { useAgents, useMe, useSignupRequests } from "~/lib/queries"
import type { SessionUser } from "~/lib/session"
import { useTheme } from "~/lib/theme"
import { cn, initials } from "~/lib/utils"
import { CommandPalette, useCommandPalette } from "./command-palette"
import { useCompose } from "./compose-context"

const NAV = [
  { to: "/app", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/app/mail", label: "Mail", icon: Inbox },
  { to: "/app/agents", label: "Agents", icon: Bot },
  { to: "/app/domains", label: "Domains", icon: Globe },
  { to: "/app/keys", label: "API keys", icon: KeyRound },
  { to: "/app/settings", label: "Settings", icon: Settings }
] as const

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const palette = useCommandPalette()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isMail = pathname.startsWith("/app/mail")

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      <aside className="hidden w-[248px] shrink-0 border-r border-line bg-bg-subtle/60 lg:flex">
        <Sidebar user={user} onSearch={() => palette.setOpen(true)} />
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-fade-in lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[272px] border-r border-line bg-bg shadow-pop data-[state=open]:animate-[rise_.2s_ease-out] lg:hidden">
            <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">App navigation</DialogPrimitive.Description>
            <Sidebar user={user} onNavigate={() => setMobileOpen(false)} onSearch={() => palette.setOpen(true)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-bg/80 px-4 backdrop-blur lg:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Link to="/app">
            <Logo />
          </Link>
          <Button variant="ghost" size="icon-sm" onClick={() => palette.setOpen(true)} aria-label="Search">
            <Search />
          </Button>
        </header>
        <main className={cn("min-h-0 flex-1", isMail ? "overflow-hidden" : "scrollbar-thin overflow-y-auto")}>{children}</main>
      </div>
      <CommandPalette open={palette.open} onOpenChange={palette.setOpen} isAdmin={user.role === "admin"} />
    </div>
  )
}

function Sidebar({ user, onNavigate, onSearch }: { user: SessionUser; onNavigate?: () => void; onSearch: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { data: me } = useMe()
  const { data: agents } = useAgents()
  const { data: signups } = useSignupRequests()
  const compose = useCompose()
  const unread = agents?.reduce((sum, a) => sum + a.inboxes.reduce((s, i) => s + i.unreadCount, 0), 0) ?? 0

  return (
    <div className="flex w-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <Link to="/app" onClick={onNavigate}>
          <Logo />
        </Link>
        <span className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">beta</span>
      </div>

      <div className="flex flex-col gap-2 px-3">
        <Button
          variant="primary"
          className="h-9 w-full justify-start"
          onClick={() => {
            compose.open()
            onNavigate?.()
          }}
        >
          <PenSquare /> Compose
          <span className="ml-auto font-mono text-[11px] opacity-50">C</span>
        </Button>
        <button
          onClick={onSearch}
          className="flex h-9 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-[13px] text-muted shadow-card transition hover:border-line-strong hover:text-ink"
        >
          <Search className="size-4" />
          Search…
          <span className="ml-auto flex gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <nav className="mt-4 flex flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const active = "exact" in item && item.exact ? pathname === item.to || pathname === `${item.to}/` : pathname.startsWith(item.to)
          const badge = item.label === "Mail" && unread > 0 ? unread : item.label === "Agents" && (signups?.length ?? 0) > 0 ? signups!.length : null
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                active ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2/80 hover:bg-surface/70 hover:text-ink"
              )}
            >
              <item.icon className={cn("size-4", active ? "text-ink" : "text-muted group-hover:text-ink")} />
              {item.label}
              {badge !== null ? (
                <span
                  className={cn(
                    "ml-auto rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                    item.label === "Agents" ? "bg-warn-soft text-warn" : "bg-accent text-accent-fg"
                  )}
                >
                  {badge}
                </span>
              ) : null}
            </Link>
          )
        })}
        {user.role === "admin" ? (
          <Link
            to="/app/admin"
            onClick={onNavigate}
            className={cn(
              "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
              pathname.startsWith("/app/admin") ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-2/80 hover:bg-surface/70 hover:text-ink"
            )}
          >
            <Shield className="size-4 text-muted group-hover:text-ink" /> Operator
          </Link>
        ) : null}
      </nav>

      <div className="mt-6 flex min-h-0 flex-1 flex-col px-3">
        <div className="mb-1.5 flex items-center justify-between px-2.5">
          <span className="text-[11px] font-medium tracking-wider text-faint uppercase">Inboxes</span>
        </div>
        <div className="scrollbar-thin -mx-1 flex min-h-0 flex-col gap-px overflow-y-auto px-1 pb-2">
          {agents?.flatMap((agent) =>
            agent.inboxes.map((inbox) => (
              <Link
                key={inbox.id}
                to="/app/mail"
                search={{ inbox: inbox.id }}
                onClick={onNavigate}
                className="group flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] text-ink-2/80 transition-colors hover:bg-surface/70 hover:text-ink"
                title={inbox.address}
              >
                <AgentAvatar name={agent.name} color={agent.color} size="xs" />
                <span className="truncate">{inbox.localPart}</span>
                {inbox.unreadCount > 0 ? <span className="ml-auto text-[11px] font-semibold text-ink tabular-nums">{inbox.unreadCount}</span> : null}
              </Link>
            ))
          )}
          {agents && agents.every((a) => a.inboxes.length === 0) ? (
            <Link to="/app/agents" onClick={onNavigate} className="rounded-lg px-2.5 py-2 text-[12.5px] text-muted hover:text-ink">
              No inboxes yet — create an agent →
            </Link>
          ) : null}
        </div>
      </div>

      {me && me.plan.monthlySends !== null ? (
        <Link to="/app/settings" onClick={onNavigate} className="mx-3 mb-2 rounded-xl border border-line bg-surface p-3 shadow-card transition hover:border-line-strong">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-medium">{me.plan.name} plan</span>
            <span className="text-muted tabular-nums">
              {me.usage.sentThisMonth.toLocaleString()}/{me.plan.monthlySends.toLocaleString()}
            </span>
          </div>
          <Meter className="mt-2" value={me.usage.sentThisMonth} max={me.plan.monthlySends} />
          <div className="mt-1.5 text-[11px] text-muted">sends this month</div>
        </Link>
      ) : null}

      <div className="border-t border-line p-2">
        <UserMenu user={user} />
      </div>
    </div>
  )
}

function UserMenu({ user }: { user: SessionUser }) {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition hover:bg-surface">
          <span className="flex size-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-bg">{initials(user.name || user.email)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium">{user.name || "You"}</span>
            <span className="block truncate text-[11.5px] text-muted">{user.email}</span>
          </span>
          <ChevronsUpDown className="size-4 text-faint" />
        </button>
      </DropdownTrigger>
      <DropdownContent align="start" className="w-60">
        <DropdownLabel>Appearance</DropdownLabel>
        <div className="grid grid-cols-3 gap-1 px-1 pb-1">
          {(
            [
              ["light", Sun],
              ["dark", Moon],
              ["system", Monitor]
            ] as const
          ).map(([value, Icon]) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg py-2 text-[11px] capitalize transition",
                theme === value ? "bg-bg-subtle text-ink ring-1 ring-line" : "text-muted hover:bg-bg-subtle"
              )}
            >
              <Icon className="size-4" />
              {value}
            </button>
          ))}
        </div>
        <DropdownSeparator />
        <DropdownItem icon={<Settings />} onSelect={() => navigate({ to: "/app/settings" })}>
          Settings
        </DropdownItem>
        <DropdownItem icon={<BookOpen />} onSelect={() => navigate({ to: "/docs" })}>
          Documentation
        </DropdownItem>
        <DropdownSeparator />
        <DropdownItem
          icon={<LogOut />}
          onSelect={async () => {
            await authClient.signOut()
            window.location.href = "/login"
          }}
        >
          Sign out
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  )
}
