import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
  /** When set, label sits to the left and control to the right (for switches/short selects). */
  inline?: boolean
}

/**
 * Single labeled form row. Vertical by default (label above input);
 * `inline` mode puts the label on the left and control on the right.
 */
export function Field({ label, hint, htmlFor, children, inline }: FieldProps) {
  if (inline) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
            {label}
          </label>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    )
  }
  return (
    <div className={cn('flex flex-col gap-1.5')}>
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
