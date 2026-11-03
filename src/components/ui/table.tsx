import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react"
import { cn } from "~/lib/utils"

/** Standard data table: hairline rows, quiet header, actions in a trailing column. */
export const Table = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn("scrollbar-thin overflow-x-auto rounded-xl border border-line bg-surface", className)}>
    <table className="w-full border-collapse text-left text-[13.5px]">{children}</table>
  </div>
)
export const THead = ({ children }: { children: ReactNode }) => (
  <thead className="bg-bg-subtle/60 text-[12px] text-muted">
    <tr className="border-b border-line">{children}</tr>
  </thead>
)
export const Th = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn("h-9 px-4 font-medium whitespace-nowrap first:pl-5 last:pr-5", className)} {...props} />
)
export const TBody = (props: HTMLAttributes<HTMLTableSectionElement>) => <tbody {...props} />
export const Tr = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn("border-b border-line last:border-0 transition-colors hover:bg-bg-subtle/40", className)} {...props} />
)
export const Td = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("h-12 px-4 align-middle first:pl-5 last:pr-5", className)} {...props} />
)
