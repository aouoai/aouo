import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface LogEntry {
  time: string
  level: string
  msg: string
  pack?: string
  source: string
  context: Record<string, unknown>
}

export interface LogSource {
  name: string
  size: number
  mtime: string
  truncated: boolean
}

export interface LogsResponse {
  entries: LogEntry[]
  sources: LogSource[]
  hasMore: boolean
  oldestTime: string | null
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface UsePackLogsOpts {
  level?: LogLevel | 'all'
  limit?: number
}

/**
 * Cursor-paginated log tail for one pack.
 *
 * `useInfiniteQuery` maps each page to a `before=<oldestTime>` request so
 * "Load older" walks backwards through the merged log stream. The query key
 * includes the level filter so flipping it issues a fresh paginated read
 * rather than appending to the previous filter's pages.
 */
export function usePackLogs(pack: string | undefined, opts: UsePackLogsOpts = {}) {
  const level = opts.level && opts.level !== 'all' ? opts.level : undefined
  const limit = opts.limit ?? 200

  return useInfiniteQuery({
    enabled: Boolean(pack),
    queryKey: ['pack-logs', pack, level, limit],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams()
      if (level) params.set('level', level)
      if (limit !== 200) params.set('limit', String(limit))
      if (pageParam) params.set('before', pageParam)
      const qs = params.toString()
      return api.get<LogsResponse>(
        `/api/packs/${pack}/logs${qs ? `?${qs}` : ''}`,
      )
    },
    getNextPageParam: (lastPage) =>
      lastPage.hasMore && lastPage.oldestTime ? lastPage.oldestTime : undefined,
    staleTime: 5_000,
  })
}
