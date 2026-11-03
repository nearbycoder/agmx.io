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
import { Logo } from "~/components/brand"
import { Button } from "~/components/ui/button"
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from "~/components/ui/menu"
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
      <aside className="hidden w-[232px] shrink-0 border-r border-line bg-bg-subtle/40 lg:flex">
        <Sidebar user={user} onSearch={() => palette.setOpen(true)} />
      </aside>

      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 data-[state=open]:animate-fade-in lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[264px] border-r border-line bg-bg shadow-pop data-[state=open]:animate-fade-in lg:hidden">
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
  const items = [...NAV, ...(user.role === "admin" ? [{ to: "/app/admin", label: "Operator", icon: Shield } as const] : [])]
  const sendLimit = me?.plan.monthlySends ?? null

  return (
    <div className="flex w-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between pr-2.5 pl-4">
        <Link to="/app" onClick={onNavigate} className="flex items-center gap-2">
          <Logo />
          <span className="rounded-md border border-line px-1.5 py-px text-[10.5px] font-medium text-muted">Beta</span>
        </Link>
        <Tooltip content={<span className="flex items-center gap-1.5">Compose <Kbd className="h-4 min-w-4 border-white/20 bg-transparent text-[10px] text-bg/70 shadow-none">C</Kbd></span>}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Compose"
            onClick={() => {
              compose.open()
              onNavigate?.()
            }}
          >
            <PenSquare />
          </Button>
        </Tooltip>
      </div>

      <div className="px-2.5">
        <button
          onClick={onSearch}
          className="flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-muted transition-colors hover:bg-ink/[0.04] hover:text-ink dark:hover:bg-white/[0.05]"
        >
          <Search className="size-4" />
          Search
          <span className="ml-auto font-sans text-[11.5px] text-faint">⌘K</span>
        </button>
      </div>

      <nav className="mt-2 flex flex-col gap-px px-2.5">
        {items.map((item) => {
          const active = "exact" in item && item.exact ? pathname === item.to || pathname === `${item.to}/` : pathname.startsWith(item.to)
          const count = item.label === "Mail" && unread > 0 ? unread : null
          const pending = item.label === "Agents" && (signups?.length ?? 0) > 0
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors",
                active
                  ? "bg-ink/[0.06] font-medium text-ink dark:bg-white/[0.07]"
                  : "text-ink-2 hover:bg-ink/[0.04] hover:text-ink dark:hover:bg-white/[0.05]"
              )}
            >
              <item.icon className={cn("size-4", active ? "text-ink" : "text-muted")} />
              {item.label}
              {count !== null ? <span className="ml-auto text-[12px] font-medium text-muted tabular-nums">{count}</span> : null}
              {pending ? (
                <Tooltip content={`${signups!.length} sign-up request${signups!.length === 1 ? "" : "s"} waiting`}>
                  <span className="ml-auto size-1.5 rounded-full bg-warn" />
                </Tooltip>
              ) : null}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1" />

      {me && sendLimit !== null ? (
        <Link to="/app/settings" onClick={onNavigate} className="group mx-2.5 mb-1 flex flex-col gap-1.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-ink/[0.04] dark:hover:bg-white/[0.05]">
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted">{me.plan.name} · sends</span>
            <span className="text-muted tabular-nums">
              {me.usage.sentThisMonth.toLocaleString()} / {sendLimit.toLocaleString()}
            </span>
          </div>
          <Meter value={me.usage.sentThisMonth} max={sendLimit} />
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
        <button className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-ink/[0.04] dark:hover:bg-white/[0.05]">
          <span className="flex size-7 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-bg">{initials(user.name || user.email)}</span>
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
