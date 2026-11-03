import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Link } from "@tanstack/react-router"
import { Menu, Moon, Sun, X } from "lucide-react"
import { useEffect, useState } from "react"
import { Logo } from "~/components/brand"
import { Button } from "~/components/ui/button"
import { useTheme } from "~/lib/theme"
import { cn } from "~/lib/utils"

export const GITHUB_URL = "https://github.com/nearbycoder/agmx.io"

const LINKS = [
  { to: "/docs", label: "Docs" },
  { to: "/pricing", label: "Pricing" },
  { href: "/skill.md", label: "For agents" }
] as const

export const GithubIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn("size-4", className)} fill="currentColor" aria-hidden>
    <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
  </svg>
)

export const ThemeToggle = ({ className }: { className?: string }) => {
  const { resolved, setTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
      className={cn("inline-flex size-[30px] items-center justify-center rounded-lg text-muted transition-colors hover:text-ink", className)}
      aria-label="Toggle theme"
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </button>
  )
}

export function MarketingHeader() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b transition-colors duration-200",
        scrolled ? "border-line bg-bg/85 backdrop-blur-xl" : "border-transparent bg-bg"
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-7">
          <Link to="/" aria-label="AGMX home">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) =>
              "to" in link ? (
                <Link
                  key={link.label}
                  to={link.to}
                  className="rounded-lg px-2.5 py-1.5 text-[13.5px] text-muted transition-colors hover:text-ink"
                  activeProps={{ className: "!text-ink" }}
                >
                  {link.label}
                </Link>
              ) : (
                <a key={link.label} href={link.href} className="rounded-lg px-2.5 py-1.5 text-[13.5px] text-muted transition-colors hover:text-ink">
                  {link.label}
                </a>
              )
            )}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden size-[30px] items-center justify-center rounded-lg text-muted transition-colors hover:text-ink sm:inline-flex"
            aria-label="GitHub"
          >
            <GithubIcon />
          </a>
          <ThemeToggle className="hidden sm:inline-flex" />
          <Link to="/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/login" className="ml-1">
            <Button size="sm">Get started</Button>
          </Link>
          <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
            <DialogPrimitive.Trigger asChild>
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm data-[state=open]:animate-fade-in md:hidden" />
              <DialogPrimitive.Content className="fixed inset-x-3 top-3 z-50 rounded-xl border border-line bg-surface p-4 shadow-pop data-[state=open]:animate-pop md:hidden">
                <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Site navigation</DialogPrimitive.Description>
                <div className="flex items-center justify-between">
                  <Logo />
                  <DialogPrimitive.Close className="rounded-lg p-2 text-muted hover:bg-bg-subtle" aria-label="Close menu">
                    <X className="size-4" />
                  </DialogPrimitive.Close>
                </div>
                <nav className="mt-4 flex flex-col">
                  {LINKS.map((link) =>
                    "to" in link ? (
                      <Link key={link.label} to={link.to} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-bg-subtle">
                        {link.label}
                      </Link>
                    ) : (
                      <a key={link.label} href={link.href} className="rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-bg-subtle">
                        {link.label}
                      </a>
                    )
                  )}
                  <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-bg-subtle">
                    <GithubIcon /> GitHub
                  </a>
                </nav>
                <div className="mt-3 flex items-center gap-2 border-t border-line pt-4">
                  <ThemeToggle />
                  <Link to="/login" className="flex-1" onClick={() => setOpen(false)}>
                    <Button variant="secondary" className="w-full">
                      Sign in
                    </Button>
                  </Link>
                  <Link to="/login" className="flex-1" onClick={() => setOpen(false)}>
                    <Button className="w-full">Get started</Button>
                  </Link>
                </div>
              </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
      </div>
    </header>
  )
}
