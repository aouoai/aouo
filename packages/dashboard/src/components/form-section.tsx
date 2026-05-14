import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

interface FormSectionProps {
  title: string
  description?: ReactNode
  children: ReactNode
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
  onReset: () => void
  /** Saves are disabled (e.g., upstream still loading) regardless of dirty state. */
  disabled?: boolean
}

/**
 * Card wrapper for one editable config section. Footer hosts Reset + Save buttons
 * driven by `useEditableSection`. Save disabled until the draft differs from upstream.
 */
export function FormSection({
  title,
  description,
  children,
  isDirty,
  isSaving,
  onSave,
  onReset,
  disabled,
}: FormSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
      <CardFooter className="flex items-center justify-end gap-2 border-t bg-muted/30 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={disabled || !isDirty || isSaving}
        >
          Reset
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={disabled || !isDirty || isSaving}
          className="bg-emerald-600 text-white hover:bg-emerald-600/90 focus-visible:ring-emerald-600/40"
        >
          {isSaving && <Loader2 className="size-3.5 animate-spin" />}
          Save changes
        </Button>
      </CardFooter>
    </Card>
  )
}
