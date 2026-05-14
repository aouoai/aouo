import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DescListItem {
  label: string
  value: ReactNode
  mono?: boolean
}

interface DescListProps {
  items: DescListItem[]
  /** Width of the label column. Default `w-32`. */
  labelWidth?: string
}

/**
 * Definition-list style key/value layout. Each row has a left label column and
 * a flexible value column. Rows are separated by subtle dividers.
 */
export function DescList({ items, labelWidth = 'w-32' }: DescListProps) {
  return (
    <dl className="divide-y">
      {items.map(({ label, value, mono }) => (
        <div key={label} className="flex items-start gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className={cn('shrink-0 text-xs uppercase tracking-wide text-muted-foreground', labelWidth)}>
            {label}
          </dt>
          <dd className={cn('min-w-0 flex-1', mono && 'font-mono text-xs break-all')}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
