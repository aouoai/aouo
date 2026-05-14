import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useSaveConfig } from '@/hooks/use-config'

/**
 * Local-draft form state for one `AouoConfig` section.
 *
 * Loads the initial values from the parent, tracks dirty state by deep equality,
 * and routes saves through `PUT /api/config/:section`. Renders nothing — pages
 * compose it with `FormSection` / inputs.
 *
 * `initial` may legitimately be `undefined` during loading; the hook waits
 * for the first non-undefined value before seeding the draft.
 */
export function useEditableSection<T extends Record<string, unknown>>(
  section: string,
  initial: T | undefined,
) {
  const [draft, setDraft] = useState<T | undefined>(initial)
  const save = useSaveConfig(section)

  // Re-seed draft when the upstream initial value first arrives or changes
  // (e.g., after a refetch). We only overwrite if the user hasn't made edits;
  // a stricter approach would prompt to discard, but for read-then-edit the
  // simpler "last-write-wins from server on refetch" matches user expectation.
  useEffect(() => {
    if (initial !== undefined) {
      setDraft((current) => current ?? initial)
    }
  }, [initial])

  const isDirty = useMemo(() => {
    if (!draft || !initial) return false
    return JSON.stringify(draft) !== JSON.stringify(initial)
  }, [draft, initial])

  function setField<K extends keyof T>(key: K, value: T[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d))
  }

  async function onSave() {
    if (!draft || !isDirty) return
    try {
      await save.mutateAsync(draft as Record<string, unknown>)
      toast.success(`Saved ${section}`)
    } catch (err) {
      toast.error(`Save failed: ${(err as Error).message}`)
    }
  }

  function onReset() {
    if (initial) setDraft(initial)
  }

  return {
    draft,
    setDraft,
    setField,
    isDirty,
    isSaving: save.isPending,
    onSave,
    onReset,
  }
}
