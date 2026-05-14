import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Field } from '@/components/field'
import { FormSection } from '@/components/form-section'
import { PageHeader } from '@/components/page-header'
import { useConfigRaw, type AouoConfig } from '@/hooks/use-config'
import { useEditableSection } from '@/hooks/use-editable-section'

const TOOL_GROUPS: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  { id: 'file', label: 'file', hint: 'Sandboxed file read/write/list' },
  { id: 'web_search', label: 'web_search', hint: 'Tavily-backed internet search' },
  { id: 'memory', label: 'memory', hint: 'Pack-scoped USER.md/MEMORY.md' },
  { id: 'skill_view', label: 'skill_view', hint: 'Load pack skill instructions' },
  { id: 'clarify', label: 'clarify', hint: 'Ask the user a question' },
  { id: 'msg', label: 'msg', hint: 'Platform-neutral outbound messages' },
  { id: 'tts', label: 'tts', hint: 'Text-to-speech generation' },
  { id: 'db', label: 'db', hint: 'Read-only SQLite diagnostics' },
  { id: 'persist', label: 'persist', hint: 'Pack-scoped structured writes' },
  { id: 'cron', label: 'cron', hint: 'Scheduled job management' },
]

export function ToolsPage() {
  const { data, isLoading, error } = useConfigRaw()

  return (
    <div>
      <PageHeader
        title="Tools"
        description="Enabled tool groups and web search backend."
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertTitle>Could not load configuration</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {(isLoading || !data) && (
        <div className="grid gap-6">
          <Skeleton className="h-96 rounded-xl" />
        </div>
      )}

      {data && (
        <div className="grid gap-6">
          <ToolsForm tools={data.tools} />
        </div>
      )}
    </div>
  )
}

function ToolsForm({ tools }: { tools: AouoConfig['tools'] }) {
  const { draft, setDraft, setField, isDirty, isSaving, onSave, onReset } =
    useEditableSection<AouoConfig['tools']>('tools', tools)

  if (!draft) return null

  function toggleTool(id: string, on: boolean) {
    setDraft((d) => {
      if (!d) return d
      const set = new Set(d.enabled)
      if (on) set.add(id)
      else set.delete(id)
      return { ...d, enabled: Array.from(set) }
    })
  }

  return (
    <FormSection
      title="Built-in tools"
      description="Which tool groups the agent may invoke."
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={onSave}
      onReset={onReset}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {TOOL_GROUPS.map((t) => (
          <div
            key={t.id}
            className="flex items-start justify-between gap-3 rounded-md px-3 py-2.5 ring-1 ring-foreground/10"
          >
            <div className="min-w-0">
              <div className="font-mono text-sm">{t.label}</div>
              <div className="text-xs text-muted-foreground">{t.hint}</div>
            </div>
            <Switch
              checked={draft.enabled.includes(t.id)}
              onCheckedChange={(v) => toggleTool(t.id, v)}
            />
          </div>
        ))}
      </div>

      <div className="border-t pt-5">
        <div className="mb-3 text-sm font-medium">Web search backend</div>
        <div className="grid gap-5 md:grid-cols-3">
          <Field label="Backend" hint="Currently only Tavily is wired up.">
            <Input
              value={draft.web_search.backend}
              onChange={(e) =>
                setField('web_search', { ...draft.web_search, backend: e.target.value })
              }
            />
          </Field>
          <Field label="API key" hint="tavily.com / api-keys">
            <PasswordInput
              value={draft.web_search.api_key}
              onChange={(e) =>
                setField('web_search', { ...draft.web_search, api_key: e.target.value })
              }
            />
          </Field>
          <Field label="Max results" hint="Results processed per query.">
            <Input
              type="number"
              min={1}
              max={20}
              value={draft.web_search.max_results}
              onChange={(e) =>
                setField('web_search', {
                  ...draft.web_search,
                  max_results: Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
      </div>
    </FormSection>
  )
}
