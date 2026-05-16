import { useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  ScrollText,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { usePackLogs, type LogEntry, type LogLevel } from '@/hooks/use-logs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface LogsTabProps {
  pack: string
}

const LEVELS: ReadonlyArray<{ value: LogLevel | 'all'; label: string }> = [
  { value: 'all', label: 'All levels' },
  { value: 'debug', label: 'Debug' },
  { value: 'info', label: 'Info' },
  { value: 'warn', label: 'Warn' },
  { value: 'error', label: 'Error' },
]

export function LogsTab({ pack }: LogsTabProps) {
  const queryClient = useQueryClient()
  const [level, setLevel] = useState<LogLevel | 'all'>('all')

  const {
    data,
    error,
    isLoading,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    hasNextPage,
  } = usePackLogs(pack, { level })

  const entries = data?.pages.flatMap((p) => p.entries) ?? []
  const sources = data?.pages[0]?.sources ?? []

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['pack-logs', pack] })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
        <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          {isLoading
            ? 'Loading…'
            : `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}${hasNextPage ? '+' : ''}`}
        </span>
        <Select value={level} onValueChange={(v) => setLevel(v as LogLevel | 'all')}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEVELS.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2 text-[10.5px] text-muted-foreground">
          {sources.map((s) => (
            <span key={s.name} className="font-mono">
              {s.name}
              {s.truncated && (
                <Badge variant="outline" className="ml-1 h-4 px-1 text-[9.5px]">
                  tail
                </Badge>
              )}
            </span>
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={refresh}
            disabled={isFetching}
            aria-label="Refresh logs"
          >
            {isFetching && !isFetchingNextPage ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RefreshCw className="size-3.5" />
            )}
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        {error ? (
          <div className="px-6 py-4">
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Failed to read logs</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          </div>
        ) : isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState pack={pack} />
        ) : (
          <>
            <ul className="divide-y">
              {entries.map((e, idx) => (
                <LogRow key={`${e.source}-${idx}-${e.time}`} entry={e} packName={pack} />
              ))}
            </ul>
            <div className="flex justify-center p-4">
              {hasNextPage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void fetchNextPage()
                  }}
                  disabled={isFetchingNextPage}
                  className="gap-1.5"
                >
                  {isFetchingNextPage && <Loader2 className="size-3.5 animate-spin" />}
                  Load older
                </Button>
              )}
              {!hasNextPage && entries.length >= 200 && (
                <span className="text-[10.5px] text-muted-foreground">
                  Reached the start of the available log buffer.
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState({ pack }: { pack: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <ScrollText className="size-7 text-muted-foreground/40" />
      <p className="text-sm font-medium">No log entries</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        Nothing tagged for <code className="rounded bg-muted px-1">{pack}</code>{' '}
        (or untagged system events) was found in{' '}
        <code className="rounded bg-muted px-1">~/.aouo/logs/</code>. The
        daemon writes here only when run via{' '}
        <code className="rounded bg-muted px-1">aouo ui start</code> or{' '}
        <code className="rounded bg-muted px-1">aouo telegram start</code>.
      </p>
    </div>
  )
}

function LogRow({ entry, packName }: { entry: LogEntry; packName: string }) {
  const [open, setOpen] = useState(false)
  const hasContext = Object.keys(entry.context).length > 0
  const ChevronIcon = open ? ChevronDown : ChevronRight

  return (
    <li className="px-4 py-1.5 font-mono text-[11.5px] leading-tight hover:bg-muted/30">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => hasContext && setOpen((p) => !p)}
          disabled={!hasContext}
          className={cn(
            'mt-0.5 shrink-0 text-muted-foreground/50',
            hasContext && 'hover:text-foreground',
          )}
          aria-label={hasContext ? 'Toggle context' : 'No extra fields'}
        >
          <ChevronIcon className={cn('size-3', !hasContext && 'opacity-30')} />
        </button>
        <span className="shrink-0 text-muted-foreground/70">
          {formatTime(entry.time)}
        </span>
        <LevelBadge level={entry.level} />
        <span className="flex-1 break-all">{entry.msg || '<no message>'}</span>
        {entry.pack && entry.pack !== packName ? null : entry.pack ? (
          <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9.5px]">
            {entry.pack}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="h-4 shrink-0 px-1 text-[9.5px] text-muted-foreground/70"
            title="System event (no pack tag)"
          >
            sys
          </Badge>
        )}
        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9.5px] text-muted-foreground/70">
          {entry.source.replace(/\.log$/, '')}
        </Badge>
      </div>
      {open && hasContext && (
        <pre className="mt-1 ml-5 max-h-64 overflow-auto rounded-sm bg-muted/50 px-2 py-1.5 text-[10.5px] whitespace-pre-wrap break-words">
          {JSON.stringify(entry.context, null, 2)}
        </pre>
      )}
    </li>
  )
}

const LEVEL_STYLES: Record<string, string> = {
  debug: 'border-muted-foreground/30 text-muted-foreground',
  info: 'border-sky-500/40 text-sky-700 dark:text-sky-400',
  warn: 'border-amber-500/40 text-amber-700 dark:text-amber-400',
  error: 'border-destructive/50 text-destructive',
  fatal: 'border-destructive/70 bg-destructive/10 text-destructive',
  trace: 'border-muted-foreground/20 text-muted-foreground/70',
}

function LevelBadge({ level }: { level: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-4 shrink-0 px-1 text-[9.5px] uppercase tracking-wider',
        LEVEL_STYLES[level] ?? 'border-muted-foreground/30 text-muted-foreground',
      )}
    >
      {level}
    </Badge>
  )
}

function formatTime(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // Compact HH:mm:ss.SSS for terminal feel.
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
}
