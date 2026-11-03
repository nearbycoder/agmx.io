import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export const cn = (...inputs: Array<ClassValue>) => twMerge(clsx(inputs))

export const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export const relativeTime = (iso: string | null | undefined, now = Date.now()) => {
  if (!iso) return "never"
  const diff = (now - new Date(iso).getTime()) / 1000
  if (diff < 45) return "just now"
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export const mailTime = (iso: string) => {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  if (now.getTime() - date.getTime() < 6 * 86400_000) return date.toLocaleDateString(undefined, { weekday: "short" })
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export const fullDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })

export const initials = (value: string) =>
  value
    .replace(/@.*/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?"

export const pct = (used: number, max: number | null) => (max === null || max === 0 ? 0 : Math.min(100, Math.round((used / max) * 100)))
