import { useMemo, useState } from 'react'
import { AlertCircle, KeyRound, ShieldCheck } from 'lucide-react'
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
import { useConfigRaw, useStatus, type AouoConfig } from '@/hooks/use-config'
import { useEditableSection } from '@/hooks/use-editable-section'

type Backend = AouoConfig['provider']['backend']

const BACKENDS: ReadonlyArray<{ value: Backend; label: string; subtitle: string }> = [
  { value: 'gemini', label: 'Gemini', subtitle: 'Google AI Studio · API key' },
  { value: 'openai', label: 'OpenAI', subtitle: 'Platform · API key' },
  { value: 'deepseek', label: 'DeepSeek', subtitle: 'OpenAI-compatible · API key' },
  { value: 'codex', label: 'Codex', subtitle: 'ChatGPT subscription · OAuth' },
]

const RECOMMENDED_MODELS: Record<Backend, string[]> = {
  gemini: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
  openai: ['gpt-5.4', 'o3-mini'],
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash'],
  codex: ['gpt-5.4', 'gpt-5.5'],
}

const CUSTOM_MODEL = '__custom__'

export function ProviderPage() {
  const { data, isLoading, error } = useConfigRaw()

  return (
    <div>
      <PageHeader
        title="Provider & Model"
        description="Active LLM backend, credentials, and model — saved together."
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertTitle>Could not load configuration</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {(isLoading || !data) && <Skeletons />}

      {data && <ActiveProviderCard config={data} />}
    </div>
  )
}

// ── single combined card ─────────────────────────────────────────────────────

function ActiveProviderCard({ config }: { config: AouoConfig }) {
  const provider = useEditableSection<AouoConfig['provider']>('provider', config.provider)
  const gemini = useEditableSection<AouoConfig['gemini']>('gemini', config.gemini)
  const openai = useEditableSection<AouoConfig['openai']>('openai', config.openai)
  const deepseek = useEditableSection<AouoConfig['deepseek']>('deepseek', config.deepseek)

  if (!provider.draft || !gemini.draft || !openai.draft || !deepseek.draft) return null

  const backend = provider.draft.backend

  const credentialDirty =
    (backend === 'gemini' && gemini.isDirty) ||
    (backend === 'openai' && openai.isDirty) ||
    (backend === 'deepseek' && deepseek.isDirty)

  const credentialSaving = gemini.isSaving || openai.isSaving || deepseek.isSaving
  const isDirty = provider.isDirty || credentialDirty
  const isSaving = provider.isSaving || credentialSaving

  async function onSaveAll() {
    const jobs: Array<Promise<unknown>> = []
    if (provider.isDirty) jobs.push(provider.onSave())
    if (backend === 'gemini' && gemini.isDirty) jobs.push(gemini.onSave())
    if (backend === 'openai' && openai.isDirty) jobs.push(openai.onSave())
    if (backend === 'deepseek' && deepseek.isDirty) jobs.push(deepseek.onSave())
    await Promise.all(jobs)
  }

  function onResetAll() {
    provider.onReset()
    gemini.onReset()
    openai.onReset()
    deepseek.onReset()
  }

  /**
   * Switching backend should also point `model` at a sensible default for the
   * new vendor — otherwise the user is left with e.g. a Gemini model name
   * being sent to OpenAI's endpoint.
   */
  function changeBackend(next: Backend) {
    provider.setField('backend', next)
    const current = provider.draft?.model ?? ''
    if (!RECOMMENDED_MODELS[next].includes(current)) {
      provider.setField('model', RECOMMENDED_MODELS[next][0] ?? current)
    }
  }

  return (
    <FormSection
      title="Active provider"
      description="Pick a backend, supply its credentials, choose a model. One save."
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={onSaveAll}
      onReset={onResetAll}
    >
      <div className="grid gap-5">
        <Field label="Backend" hint="Which provider handles LLM calls.">
          <Select value={backend} onValueChange={(v) => changeBackend(v as Backend)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BACKENDS.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  <span className="font-medium">{b.label}</span>
                  <span className="ml-2 text-muted-foreground">— {b.subtitle}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Credentials
          backend={backend}
          gemini={gemini}
          openai={openai}
          deepseek={deepseek}
        />

        <ModelField
          backend={backend}
          value={provider.draft.model}
          onChange={(v) => provider.setField('model', v)}
        />

        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Temperature" hint="Sampling temperature (0–2).">
            <Input
              type="number"
              step="0.05"
              min={0}
              max={2}
              value={provider.draft.temperature}
              onChange={(e) => provider.setField('temperature', Number(e.target.value))}
            />
          </Field>
          <Field label="Max output tokens" hint="Per generation.">
            <Input
              type="number"
              min={1}
              value={provider.draft.max_tokens}
              onChange={(e) => provider.setField('max_tokens', Number(e.target.value))}
            />
          </Field>
          <Field label="Max retries" hint="Transient API errors.">
            <Input
              type="number"
              min={0}
              value={provider.draft.max_retries}
              onChange={(e) => provider.setField('max_retries', Number(e.target.value))}
            />
          </Field>
        </div>
      </div>
    </FormSection>
  )
}

// ── credentials — only the selected backend's keys are shown ─────────────────

function Credentials({
  backend,
  gemini,
  openai,
  deepseek,
}: {
  backend: Backend
  gemini: ReturnType<typeof useEditableSection<AouoConfig['gemini']>>
  openai: ReturnType<typeof useEditableSection<AouoConfig['openai']>>
  deepseek: ReturnType<typeof useEditableSection<AouoConfig['deepseek']>>
}) {
  if (backend === 'gemini' && gemini.draft) {
    return (
      <CredentialsBlock title="Gemini credentials" subtitle="aistudio.google.com/apikey">
        <Field label="API key">
          <PasswordInput
            value={gemini.draft.api_key}
            onChange={(e) => gemini.setField('api_key', e.target.value)}
            placeholder="AIza..."
          />
        </Field>
        <Field label="Vision model" hint="Used for image analysis.">
          <Input
            value={gemini.draft.vision_model}
            onChange={(e) => gemini.setField('vision_model', e.target.value)}
            placeholder="gemini-3-flash-preview"
            className="font-mono"
          />
        </Field>
      </CredentialsBlock>
    )
  }

  if (backend === 'openai' && openai.draft) {
    return (
      <CredentialsBlock title="OpenAI credentials" subtitle="platform.openai.com/api-keys">
        <Field label="API key">
          <PasswordInput
            value={openai.draft.api_key}
            onChange={(e) => openai.setField('api_key', e.target.value)}
            placeholder="sk-..."
          />
        </Field>
      </CredentialsBlock>
    )
  }

  if (backend === 'deepseek' && deepseek.draft) {
    return (
      <CredentialsBlock title="DeepSeek credentials" subtitle="platform.deepseek.com">
        <Field label="API key">
          <PasswordInput
            value={deepseek.draft.api_key}
            onChange={(e) => deepseek.setField('api_key', e.target.value)}
            placeholder="sk-..."
          />
        </Field>
      </CredentialsBlock>
    )
  }

  return <CodexAuthBlock />
}

function CredentialsBlock({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 flex items-center gap-2 text-[12px] text-muted-foreground">
        <KeyRound className="size-3.5" />
        <span className="font-semibold uppercase tracking-[0.08em]">{title}</span>
        <span className="ml-auto font-mono">{subtitle}</span>
      </div>
      <div className="grid gap-4">{children}</div>
    </div>
  )
}

function CodexAuthBlock() {
  const { data: status } = useStatus()
  const providerCheck = status?.checks.find((c) => c.name === 'provider_credentials')
  const ok = providerCheck?.ok === true

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-2 flex items-center gap-2 text-[12px] text-muted-foreground">
        <ShieldCheck className="size-3.5" />
        <span className="font-semibold uppercase tracking-[0.08em]">Codex OAuth</span>
      </div>
      <p className="text-[13px] text-foreground">
        Codex uses your ChatGPT subscription via OAuth — no API key here.{' '}
        {ok ? (
          <span className="text-emerald-600 dark:text-emerald-400">Currently authenticated.</span>
        ) : (
          <span className="text-amber-600 dark:text-amber-400">Not authenticated.</span>
        )}
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Run{' '}
        <code className="rounded bg-background px-1 py-0.5 font-mono text-[11px]">
          aouo config provider
        </code>{' '}
        in your terminal to start the device-code login flow.
      </p>
    </div>
  )
}

// ── model — recommended select + "Custom..." inline input ────────────────────

function ModelField({
  backend,
  value,
  onChange,
}: {
  backend: Backend
  value: string
  onChange: (v: string) => void
}) {
  const recommended = RECOMMENDED_MODELS[backend]
  const initiallyCustom = !recommended.includes(value) && value !== ''
  const [customMode, setCustomMode] = useState(initiallyCustom)

  const selectValue = useMemo(() => {
    if (customMode) return CUSTOM_MODEL
    return recommended.includes(value) ? value : (recommended[0] ?? '')
  }, [customMode, recommended, value])

  function onSelectChange(next: string | null) {
    if (next === null) return
    if (next === CUSTOM_MODEL) {
      setCustomMode(true)
      return
    }
    setCustomMode(false)
    onChange(next)
  }

  return (
    <Field label="Model" hint={`Suggested: ${recommended.join(' · ')}`}>
      <div className="flex flex-col gap-2">
        <Select value={selectValue} onValueChange={onSelectChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick a model" />
          </SelectTrigger>
          <SelectContent>
            {recommended.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_MODEL}>Custom model id…</SelectItem>
          </SelectContent>
        </Select>
        {customMode && (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g. gpt-5.4-mini"
            className="font-mono"
          />
        )}
      </div>
    </Field>
  )
}

// ── skeletons ────────────────────────────────────────────────────────────────

function Skeletons() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-[420px] rounded-xl" />
    </div>
  )
}
