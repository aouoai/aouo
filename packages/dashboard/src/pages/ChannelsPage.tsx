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

export function ChannelsPage() {
  const { data, isLoading, error } = useConfigRaw()

  return (
    <div>
      <PageHeader
        title="Channels & Cron"
        description="Messaging channels and scheduled task delivery."
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertTitle>Could not load configuration</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {(isLoading || !data) && (
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      )}

      {data && (
        <div className="grid gap-6 md:grid-cols-2">
          <TelegramForm telegram={data.telegram} />
          <CronForm cron={data.cron} />
        </div>
      )}
    </div>
  )
}

// ── Telegram ─────────────────────────────────────────────────────────────────

function TelegramForm({ telegram }: { telegram: AouoConfig['telegram'] }) {
  const { draft, setField, isDirty, isSaving, onSave, onReset } =
    useEditableSection<AouoConfig['telegram']>('telegram', telegram)

  if (!draft) return null

  function setAllowlist(text: string) {
    const ids = text
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0)
    setField('allowed_user_ids', Array.from(new Set(ids)))
  }

  return (
    <FormSection
      title="Telegram"
      description="Bot token from @BotFather. Allowlist gates every message."
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={onSave}
      onReset={onReset}
    >
      <Field label="Enabled" hint="Toggle the long-poll bot on/off." inline>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(v) => setField('enabled', v)}
        />
      </Field>

      <Field label="Bot token" hint="Issued by @BotFather.">
        <PasswordInput
          value={draft.bot_token}
          onChange={(e) => setField('bot_token', e.target.value)}
          placeholder="123456:ABC-DEF…"
        />
      </Field>

      <Field
        label="Allowed user IDs"
        hint="Comma or space separated. DM @userinfobot for your numeric ID."
      >
        <Input
          value={draft.allowed_user_ids.join(', ')}
          onChange={(e) => setAllowlist(e.target.value)}
          placeholder="123456789, 987654321"
          className="font-mono"
        />
      </Field>
    </FormSection>
  )
}

// ── Cron ─────────────────────────────────────────────────────────────────────

function CronForm({ cron }: { cron: AouoConfig['cron'] }) {
  const { draft, setField, isDirty, isSaving, onSave, onReset } =
    useEditableSection<AouoConfig['cron']>('cron', cron)

  if (!draft) return null

  return (
    <FormSection
      title="Cron"
      description="Scheduler tick + default delivery target."
      isDirty={isDirty}
      isSaving={isSaving}
      onSave={onSave}
      onReset={onReset}
    >
      <Field label="Enabled" hint="Run scheduled jobs in background." inline>
        <Switch
          checked={draft.enabled}
          onCheckedChange={(v) => setField('enabled', v)}
        />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Tick (seconds)" hint="How often the scheduler wakes up.">
          <Input
            type="number"
            min={5}
            value={draft.tick_seconds}
            onChange={(e) => setField('tick_seconds', Number(e.target.value))}
          />
        </Field>

        <Field label="Timezone" hint="IANA name, e.g. Asia/Shanghai.">
          <Input
            value={draft.timezone}
            onChange={(e) => setField('timezone', e.target.value)}
            className="font-mono"
          />
        </Field>

        <Field label="Default platform" hint="Adapter to use for cron sends.">
          <Input
            value={draft.default_platform}
            onChange={(e) => setField('default_platform', e.target.value)}
          />
        </Field>

        <Field label="Default chat ID" hint="Required for proactive packs.">
          <Input
            value={draft.default_chat_id}
            onChange={(e) => setField('default_chat_id', e.target.value)}
            placeholder="123456789"
            className="font-mono"
          />
        </Field>
      </div>
    </FormSection>
  )
}
