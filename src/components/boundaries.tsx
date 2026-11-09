import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { ArrowLeft, RotateCcw } from "lucide-react"
import { LogoMark } from "./brand"
import { Button } from "./ui/button"

export const DefaultCatchBoundary = ({ error }: ErrorComponentProps) => {
  const router = useRouter()
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <LogoMark className="size-10" />
      <h1 className="text-xl font-semibold tracking-tight">Something went sideways</h1>
      <p className="max-w-md text-sm text-muted">{error instanceof Error && error.message ? error.message : "An unexpected error occurred."}</p>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => router.invalidate()}>
          <RotateCcw /> Try again
        </Button>
        <Button asChild variant="ghost">
          <Link to="/">Home</Link>
        </Button>
      </div>
    </div>
  )
}

export const NotFound = () => (
  <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
    <div className="font-mono text-sm text-muted">550 5.1.1</div>
    <h1 className="text-3xl font-semibold tracking-tight">Mailbox unavailable</h1>
    <p className="max-w-sm text-sm text-muted">This page bounced. The address you followed doesn't exist.</p>
    <Button asChild variant="secondary" className="mt-3">
      <Link to="/">
        <ArrowLeft /> Back to AGMX
      </Link>
    </Button>
  </div>
)
