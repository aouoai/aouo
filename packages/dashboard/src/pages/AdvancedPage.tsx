import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
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

type LogLevel = AouoConfig['advanced']['log_level']
const LOG_LEVELS: ReadonlyArray<LogLevel> = ['debug', 'info', 'warn', 'error']

export function AdvancedPage() {
  const { data, isLoading, error } = useConfigRaw()

  return (
    <div>
      <PageHeader
        title="Advanced"
        description="Context window, ReAct loop limits, token budgets, and logging."
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertTitle>Could not load configuration</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {(isLoading || !data) && <Skeleton className="h-96 rounded-xl" />}

      {data && <AdvancedForm advanced={data.advanced} />}
    </div>
  )
}

function AdvancedForm({ advanced }: { advanced: AouoConfig['advanced'] }) {
  const { draft, setField, isDirty, isSaving, onSave, onReset } =
    useEditableSection<AouoConfig['advanced']>('advanced', advanced)

  if (!draft) return null

  return (
    <FormSection
      title="Runtime parameters"
      description="Tune carefully — these gates run on every turn."
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={onSave}
      onReset={onReset}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Context window" hint="Tokens kept in active history before compression.">
          <Input
            type="number"
            min={1000}
            value={draft.context_window}
            onChange={(e) => setField('context_window', Number(e.target.value))}
          />
        </Field>

        <Field label="Compress threshold" hint="Ratio of context usage (0–1) that triggers compression.">
          <Input
            type="number"
            step="0.05"
            min={0.1}
            max={1}
            value={draft.compress_threshold}
            onChange={(e) => setField('compress_threshold', Number(e.target.value))}
          />
        </Field>

        <Field label="Max history messages" hint="Hard cap on messages kept in conversation history.">
          <Input
            type="number"
            min={10}
            value={draft.max_history_messages}
            onChange={(e) => setField('max_history_messages', Number(e.target.value))}
          />
        </Field>

        <Field label="Max ReAct loops" hint="Maximum tool-use iterations per user turn.">
          <Input
            type="number"
            min={1}
            value={draft.max_react_loops}
            onChange={(e) => setField('max_react_loops', Number(e.target.value))}
          />
        </Field>

        <Field label="Session tokens cap" hint="Lifetime tokens per session. 0 disables.">
          <Input
            type="number"
            min={0}
            value={draft.session_tokens_max}
            onChange={(e) => setField('session_tokens_max', Number(e.target.value))}
          />
        </Field>

        <Field label="Daily tokens cap" hint="Tokens across all sessions per local day. 0 disables.">
          <Input
            type="number"
            min={0}
            value={draft.daily_tokens_max}
            onChange={(e) => setField('daily_tokens_max', Number(e.target.value))}
          />
        </Field>

        <Field label="Log level" hint="Pino verbosity for runtime logs.">
          <Select
            value={draft.log_level}
            onValueChange={(v) => setField('log_level', v as LogLevel)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOG_LEVELS.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </FormSection>
  )
}
