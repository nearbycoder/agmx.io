import * as DialogPrimitive from "@radix-ui/react-dialog"
import { useNavigate } from "@tanstack/react-router"
import { Command } from "cmdk"
import { Bot, BookOpen, Copy, Globe, Inbox, KeyRound, LayoutGrid, Moon, PenSquare, Plus, Settings, Shield, Sun } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { AgentAvatar } from "~/components/brand"
import { copyText } from "~/components/ui/misc"
import { useAgents } from "~/lib/queries"
import { useTheme } from "~/lib/theme"
import { useCompose } from "./compose-context"

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))

export const useCommandPalette = () => {
  const [open, setOpen] = useState(false)
  const compose = useCompose()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault()
        compose.open()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [compose])
  return { open, setOpen }
}

export function CommandPalette({ open, onOpenChange, isAdmin }: { open: boolean; onOpenChange: (o: boolean) => void; isAdmin: boolean }) {
  const navigate = useNavigate()
  const { data: agents } = useAgents()
  const { resolved, setTheme } = useTheme()
  const compose = useCompose()

  const run = (fn: () => void) => {
    onOpenChange(false)
    fn()
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content className="fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop data-[state=open]:animate-pop">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Search pages, agents and actions</DialogPrimitive.Description>
          <Command loop className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint [&_[cmdk-group-heading]]:uppercase">
            <Command.Input
              autoFocus
              placeholder="Jump to an agent, inbox or action…"
              className="h-13 w-full border-b border-line bg-transparent px-4 text-[15px] outline-none placeholder:text-faint"
            />
            <Command.List className="scrollbar-thin max-h-[60vh] overflow-y-auto p-1.5">
              <Command.Empty className="py-10 text-center text-sm text-muted">Nothing matches that.</Command.Empty>
              <Command.Group heading="Actions">
                <Item icon={<PenSquare />} onSelect={() => run(() => compose.open())} shortcut="C">
                  Compose email
                </Item>
                <Item icon={<Plus />} onSelect={() => run(() => navigate({ to: "/app/agents", search: { new: true } }))}>
                  Create agent
                </Item>
                <Item icon={<KeyRound />} onSelect={() => run(() => navigate({ to: "/app/keys" }))}>
                  Create API key
                </Item>
                <Item icon={<Copy />} onSelect={() => run(() => void copyText(`${window.location.origin}/mcp`, "MCP URL copied"))}>
                  Copy MCP server URL
                </Item>
                <Item icon={resolved === "dark" ? <Sun /> : <Moon />} onSelect={() => run(() => setTheme(resolved === "dark" ? "light" : "dark"))}>
                  Switch to {resolved === "dark" ? "light" : "dark"} mode
                </Item>
              </Command.Group>
              <Command.Group heading="Go to">
                <Item icon={<LayoutGrid />} onSelect={() => run(() => navigate({ to: "/app" }))}>Overview</Item>
                <Item icon={<Inbox />} onSelect={() => run(() => navigate({ to: "/app/mail" }))}>Mail</Item>
                <Item icon={<Bot />} onSelect={() => run(() => navigate({ to: "/app/agents" }))}>Agents</Item>
                <Item icon={<Globe />} onSelect={() => run(() => navigate({ to: "/app/domains" }))}>Domains</Item>
                <Item icon={<KeyRound />} onSelect={() => run(() => navigate({ to: "/app/keys" }))}>API keys</Item>
                <Item icon={<Settings />} onSelect={() => run(() => navigate({ to: "/app/settings" }))}>Settings</Item>
                {isAdmin ? <Item icon={<Shield />} onSelect={() => run(() => navigate({ to: "/app/admin" }))}>Operator</Item> : null}
                <Item icon={<BookOpen />} onSelect={() => run(() => navigate({ to: "/docs" }))}>Documentation</Item>
              </Command.Group>
              {agents?.length ? (
                <Command.Group heading="Agents & inboxes">
                  {agents.map((agent) => (
                    <Item key={agent.id} value={`agent ${agent.name} ${agent.id}`} icon={<AgentAvatar name={agent.name} color={agent.color} size="xs" />} onSelect={() => run(() => navigate({ to: "/app/agents/$agentId", params: { agentId: agent.id } }))}>
                      {agent.name}
                    </Item>
                  ))}
                  {agents.flatMap((agent) =>
                    agent.inboxes.map((inbox) => (
                      <Item key={inbox.id} value={`inbox ${inbox.address}`} icon={<Inbox />} onSelect={() => run(() => navigate({ to: "/app/mail", search: { inbox: inbox.id } }))}>
                        <span className="font-mono text-[13px]">{inbox.address}</span>
                        {inbox.unreadCount ? <span className="ml-2 text-xs text-muted">{inbox.unreadCount} unread</span> : null}
                      </Item>
                    ))
                  )}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function Item({ children, icon, onSelect, shortcut, value }: { children: ReactNode; icon: ReactNode; onSelect: () => void; shortcut?: string; value?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] text-ink-2 data-[selected=true]:bg-bg-subtle data-[selected=true]:text-ink [&_svg]:size-4 [&_svg]:text-muted"
    >
      {icon}
      <span className="flex flex-1 items-center">{children}</span>
      {shortcut ? <span className="font-mono text-[11px] text-faint">{shortcut}</span> : null}
    </Command.Item>
  )
}
