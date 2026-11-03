import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { ComposeWindow } from "~/components/app/compose"
import { ComposeProvider } from "~/components/app/compose-context"
import { AppShell } from "~/components/app/shell"
import { useLiveMail } from "~/lib/queries"
import { getSessionUser } from "~/lib/session"

export const Route = createFileRoute("/app")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const user = await getSessionUser()
    if (!user) throw redirect({ to: "/login", search: { redirect: location.href } })
    return { user }
  },
  head: () => ({ meta: [{ title: "AGMX" }] }),
  pendingComponent: () => (
    <div className="flex h-dvh items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-line border-t-ink" />
    </div>
  ),
  component: AppLayout
})

function AppLayout() {
  const { user } = Route.useRouteContext()
  useLiveMail()
  return (
    <ComposeProvider>
      <AppShell user={user}>
        <Outlet />
      </AppShell>
      <ComposeWindow />
    </ComposeProvider>
  )
}
