import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Field } from '@/components/field'
import { FormSection } from '@/components/form-section'
import { PageHeader } from '@/components/page-header'
import { useConfigRaw, type AouoConfig } from '@/hooks/use-config'
import { useEditableSection } from '@/hooks/use-editable-section'

type FenceMode = AouoConfig['security']['fence_mode']
const FENCE_MODES: ReadonlyArray<{ value: FenceMode; label: string; hint: string }> = [
  { value: 'deny', label: 'Deny (safe)', hint: 'Block all out-of-fence access.' },
  { value: 'ask', label: 'Ask', hint: 'Prompt the user for permission.' },
  { value: 'allow', label: 'Allow (risky)', hint: 'No fence — touches anything in scope.' },
]

export function SecurityPage() {
  const { data, isLoading, error } = useConfigRaw()

  return (
    <div>
      <PageHeader
        title="Security"
        description="File access boundaries and execution fence mode."
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertTitle>Could not load configuration</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {(isLoading || !data) && <Skeleton className="h-72 rounded-xl" />}

      {data && <SecurityForm security={data.security} />}
    </div>
  )
}

function SecurityForm({ security }: { security: AouoConfig['security'] }) {
  const { draft, setField, isDirty, isSaving, onSave, onReset } =
    useEditableSection<AouoConfig['security']>('security', security)

  if (!draft) return null

  function setAllowedPaths(text: string) {
    const paths = text
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean)
    setField('allowed_paths', paths)
  }

  return (
    <FormSection
      title="Execution boundaries"
      description="The fence governs file reads/writes performed by the agent."
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={onSave}
      onReset={onReset}
    >
      <Field label="Fence mode" hint="What happens for paths outside the allowlist.">
        <Select
          value={draft.fence_mode}
          onValueChange={(v) => setField('fence_mode', v as FenceMode)}
        >
          <SelectTrigger className="w-full md:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FENCE_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                <div className="flex flex-col items-start">
                  <span>{m.label}</span>
                  <span className="text-[11px] text-muted-foreground">{m.hint}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Allowed paths" hint="One absolute path per line. Tilde (~) is supported.">
        <Textarea
          value={draft.allowed_paths.join('\n')}
          onChange={(e) => setAllowedPaths(e.target.value)}
          placeholder="~/.aouo/"
          rows={Math.max(3, draft.allowed_paths.length + 1)}
          className="font-mono text-xs"
        />
      </Field>
    </FormSection>
  )
}
