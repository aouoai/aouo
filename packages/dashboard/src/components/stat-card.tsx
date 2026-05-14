import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string
  hint?: string
  icon?: LucideIcon
  /** Kept on the API for callers; no longer rendered as a colored accent. */
  tone?: 'ok' | 'warn' | 'bad' | 'neutral'
}

/**
 * Compact dashboard KPI. Value is the visual hero (28px tabular numerics),
 * label sits above in small caps. No tone bar / status dot — pure neutral.
 */
export function StatCard({ label, value, hint, icon: Icon }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-card px-4 py-3.5 ring-1 ring-foreground/10">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        {Icon && <Icon className="size-3.5 text-muted-foreground/60" />}
      </div>
      <div className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">
        {value}
      </div>
      {hint && (
        <div className="text-[11.5px] text-muted-foreground line-clamp-1">{hint}</div>
      )}
    </div>
  )
}
