import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Field } from '@/components/field'
import { FormSection } from '@/components/form-section'
import { PageHeader } from '@/components/page-header'
import { useConfigRaw, type AouoConfig } from '@/hooks/use-config'
import { useEditableSection } from '@/hooks/use-editable-section'

type Backend = AouoConfig['provider']['backend']
const BACKENDS: ReadonlyArray<{ value: Backend; label: string }> = [
  { value: 'gemini', label: 'Gemini' },
  { value: 'codex', label: 'Codex (OAuth)' },
  { value: 'deepseek', label: 'DeepSeek' },
]

const MODEL_HINTS: Record<Backend, string[]> = {
  gemini: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
  codex: ['gpt-5.4', 'gpt-5.5'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash'],
}

export function ProviderPage() {
  const { data, isLoading, error } = useConfigRaw()

  return (
    <div>
      <PageHeader
        title="Provider & Model"
        description="Active LLM provider, credentials, and model selection."
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertTitle>Could not load configuration</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {(isLoading || !data) && <Skeletons />}

      {data && (
        <div className="grid gap-6">
          <ProviderForm provider={data.provider} />
          <div className="grid gap-6 md:grid-cols-2">
            <GeminiForm gemini={data.gemini} />
            <DeepSeekForm deepseek={data.deepseek} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── provider ─────────────────────────────────────────────────────────────────

function ProviderForm({ provider }: { provider: AouoConfig['provider'] }) {
  const { draft, setField, isDirty, isSaving, onSave, onReset } =
    useEditableSection<AouoConfig['provider']>('provider', provider)

  if (!draft) return null

  return (
    <FormSection
      title="Active"
      description="Switch backend or change the model used for every turn."
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={onSave}
      onReset={onReset}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Backend" hint="Which provider handles LLM calls.">
          <Select
            value={draft.backend}
            onValueChange={(v) => setField('backend', v as Backend)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick a backend" />
            </SelectTrigger>
            <SelectContent>
              {BACKENDS.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Model" hint={`Suggested: ${MODEL_HINTS[draft.backend].join(' · ')}`}>
          <Input
            value={draft.model}
            onChange={(e) => setField('model', e.target.value)}
            placeholder="e.g. gemini-3-flash-preview"
          />
        </Field>

        <Field label="Max output tokens" hint="Maximum tokens per generation.">
          <Input
            type="number"
            min={1}
            value={draft.max_tokens}
            onChange={(e) => setField('max_tokens', Number(e.target.value))}
          />
        </Field>

        <Field label="Temperature" hint="Sampling temperature (0–2).">
          <Input
            type="number"
            step="0.05"
            min={0}
            max={2}
            value={draft.temperature}
            onChange={(e) => setField('temperature', Number(e.target.value))}
          />
        </Field>

        <Field label="Max retries" hint="Retries on transient API errors.">
          <Input
            type="number"
            min={0}
            value={draft.max_retries}
            onChange={(e) => setField('max_retries', Number(e.target.value))}
          />
        </Field>
      </div>
    </FormSection>
  )
}

// ── gemini ───────────────────────────────────────────────────────────────────

function GeminiForm({ gemini }: { gemini: AouoConfig['gemini'] }) {
  const { draft, setField, isDirty, isSaving, onSave, onReset } =
    useEditableSection<AouoConfig['gemini']>('gemini', gemini)

  if (!draft) return null

  return (
    <FormSection
      title="Gemini"
      description="Google AI Studio key + vision model."
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={onSave}
      onReset={onReset}
    >
      <Field label="API key" hint="aistudio.google.com/apikey">
        <PasswordInput
          value={draft.api_key}
          onChange={(e) => setField('api_key', e.target.value)}
        />
      </Field>
      <Field label="Vision model" hint="Used for image analysis.">
        <Input
          value={draft.vision_model}
          onChange={(e) => setField('vision_model', e.target.value)}
          placeholder="gemini-3-flash-preview"
          className="font-mono"
        />
      </Field>
    </FormSection>
  )
}

// ── deepseek ─────────────────────────────────────────────────────────────────

function DeepSeekForm({ deepseek }: { deepseek: AouoConfig['deepseek'] }) {
  const { draft, setField, isDirty, isSaving, onSave, onReset } =
    useEditableSection<AouoConfig['deepseek']>('deepseek', deepseek)

  if (!draft) return null

  return (
    <FormSection
      title="DeepSeek"
      description="Optional alternate backend."
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={onSave}
      onReset={onReset}
    >
      <Field label="API key">
        <PasswordInput
          value={draft.api_key}
          onChange={(e) => setField('api_key', e.target.value)}
        />
      </Field>
    </FormSection>
  )
}

// ── skeletons ────────────────────────────────────────────────────────────────

function Skeletons() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-72 rounded-xl" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    </div>
  )
}
