import { useState } from 'react'
import {
  AlertCircle,
  Clock,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

import {
  usePackCron,
  usePackCronAction,
  type CronJob,
} from '@/hooks/use-cron'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface CronTabProps {
  pack: string
}

export function CronTab({ pack }: CronTabProps) {
  const queryClient = useQueryClient()
  const { data, error, isLoading } = usePackCron(pack)

  const jobs = data?.jobs ?? []

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['pack-cron', pack] })
  }

  if (error) {
    return (
      <div className="px-6 py-4">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Failed to list cron jobs</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center justify-between border-b px-4">
        <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          {isLoading ? 'Loading…' : `${jobs.length} job${jobs.length === 1 ? '' : 's'}`}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={refresh}
          aria-label="Refresh cron list"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <Clock className="size-7 text-muted-foreground/40" />
            <p className="text-sm font-medium">No cron jobs registered</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Packs register cron jobs through{' '}
              <code className="rounded bg-muted px-1">cron_defaults</code> in
              their manifest. This pack hasn't declared any.
            </p>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {jobs.map((j) => (
              <JobCard key={j.id} pack={pack} job={j} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function JobCard({ pack, job }: { pack: string; job: CronJob }) {
  const mutation = usePackCronAction(pack)
  const [preview, setPreview] = useState<{ output: string; status: 'ok' | 'silent' } | null>(null)

  // Per-card variant of the mutation pending state — usePackCronAction is one
  // hook instance per card, so this is straightforward without job-id matching.
  const pendingAction = mutation.isPending ? mutation.variables?.action : undefined
  const togglePending = pendingAction === 'pause' || pendingAction === 'resume'
  const runPending = pendingAction === 'run'

  const onToggle = (checked: boolean) => {
    mutation.mutate(
      { jobId: job.id, action: checked ? 'resume' : 'pause' },
      {
        onError: (err) =>
          toast.error(`${checked ? 'Resume' : 'Pause'} failed: ${(err as Error).message}`),
      },
    )
  }

  const onRun = () => {
    setPreview(null)
    mutation.mutate(
      { jobId: job.id, action: 'run' },
      {
        onSuccess: (res) => {
          if (res.action !== 'run') return
          setPreview({ output: res.output, status: res.status })
          toast.success(
            res.status === 'silent'
              ? 'Preview ran — pack chose [SILENT]'
              : 'Preview ready',
          )
        },
        onError: (err) =>
          toast.error(`Preview failed: ${(err as Error).message}`),
      },
    )
  }

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm">{job.name}</span>
              <StateBadge state={job.state} />
              {job.skill && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  /{job.skill}
                </Badge>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {job.schedule.display}
              </span>
              {job.enabled && job.next_run_at && (
                <span>Next · {formatRelative(job.next_run_at)}</span>
              )}
              {job.last_run_at && (
                <span className="inline-flex items-center gap-1.5">
                  Last · {formatRelative(job.last_run_at)}
                  <StatusDot status={job.last_status} />
                </span>
              )}
            </div>
          </div>
          <Switch
            checked={job.enabled}
            onCheckedChange={onToggle}
            disabled={togglePending}
            aria-label={job.enabled ? 'Pause job' : 'Resume job'}
          />
        </div>

        <p className="line-clamp-2 text-xs text-muted-foreground/90">
          {job.prompt}
        </p>

        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={onRun}
            disabled={runPending}
            className="gap-1.5"
          >
            {runPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Run now (preview)
          </Button>
        </div>

        {preview && <PreviewOutput preview={preview} />}

        {job.last_status === 'error' && job.last_error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="size-3.5" />
            <AlertTitle className="text-[11px]">Last run failed</AlertTitle>
            <AlertDescription className="text-[11px]">
              {job.last_error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}

function PreviewOutput({
  preview,
}: {
  preview: { output: string; status: 'ok' | 'silent' }
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
        Preview output
        {preview.status === 'silent' && (
          <Badge variant="outline" className="h-4 px-1 text-[9.5px]">
            [SILENT]
          </Badge>
        )}
      </div>
      {preview.output ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-snug">
          {preview.output}
        </pre>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          The pack chose to send nothing (returned <code>[SILENT]</code>).
        </p>
      )}
    </div>
  )
}

function StateBadge({ state }: { state: CronJob['state'] }) {
  const variant = STATE_STYLES[state] ?? STATE_STYLES.scheduled
  return (
    <Badge
      variant="outline"
      className={cn('h-5 px-1.5 text-[10px] capitalize', variant)}
    >
      {state}
    </Badge>
  )
}

const STATE_STYLES: Record<CronJob['state'], string> = {
  scheduled: 'border-emerald-500/40 text-emerald-700 dark:text-emerald-400',
  running: 'border-sky-500/40 text-sky-700 dark:text-sky-400',
  paused: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
  completed: 'border-muted-foreground/30 text-muted-foreground',
  error: 'border-destructive/50 text-destructive',
}

function StatusDot({ status }: { status?: CronJob['last_status'] }) {
  if (!status) return null
  const colour =
    status === 'ok'
      ? 'bg-emerald-500'
      : status === 'silent'
        ? 'bg-muted-foreground/60'
        : 'bg-destructive'
  return (
    <span
      className={cn('inline-block size-1.5 rounded-full', colour)}
      title={status}
    />
  )
}

/**
 * Renders an ISO timestamp as "in 5m" / "32m ago" / falls back to a locale
 * date when more than 7 days away. Tabs are passive viewers, so a re-render
 * tick is not worth the complexity — the relative label is fine while stale.
 */
function formatRelative(iso: string): string {
  const target = new Date(iso).getTime()
  if (!Number.isFinite(target)) return iso
  const diffMs = target - Date.now()
  const past = diffMs < 0
  const abs = Math.abs(diffMs)
  const days = Math.round(abs / 86_400_000)
  if (days >= 7) return new Date(iso).toLocaleString()
  const hours = Math.round(abs / 3_600_000)
  const mins = Math.round(abs / 60_000)
  const phrase =
    days >= 1 ? `${days}d` : hours >= 1 ? `${hours}h` : mins >= 1 ? `${mins}m` : `${Math.round(abs / 1000)}s`
  return past ? `${phrase} ago` : `in ${phrase}`
}
