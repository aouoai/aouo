import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface CronSchedule {
  kind: 'once' | 'interval' | 'cron'
  display: string
  /** Present on `kind: 'cron'`. */
  expr?: string
  /** Present on `kind: 'interval'`. */
  minutes?: number
  /** Present on `kind: 'once'`. */
  run_at?: string
}

export interface CronJob {
  id: string
  name: string
  prompt: string
  pack?: string
  skill?: string
  schedule: CronSchedule
  enabled: boolean
  state: 'scheduled' | 'paused' | 'running' | 'completed' | 'error'
  deliver: { platform: string; chat_id: string }
  repeat: { times: number | null; completed: number }
  next_run_at: string | null
  last_run_at?: string
  last_status?: 'ok' | 'error' | 'silent'
  last_error?: string
  created_at: string
  updated_at: string
}

export interface CronListResponse {
  jobs: CronJob[]
}

export type CronAction = 'pause' | 'resume' | 'run'

export type CronActionResponse =
  | { ok: true; action: 'pause' | 'resume'; job: CronJob }
  | { ok: true; action: 'run'; output: string; status: 'ok' | 'silent' }

export function usePackCron(pack: string | undefined) {
  return useQuery({
    enabled: Boolean(pack),
    queryKey: ['pack-cron', pack],
    queryFn: () => api.get<CronListResponse>(`/api/packs/${pack}/cron`),
    staleTime: 5_000,
  })
}

/**
 * Mutation for pause/resume/run on one cron job.
 *
 * `pause`/`resume` invalidate the list so the toggled state is reflected;
 * `run` does not, because preview leaves the scheduler untouched by design.
 */
export function usePackCronAction(pack: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { jobId: string; action: CronAction }) => {
      return api.post<CronActionResponse>(
        `/api/packs/${pack}/cron/${vars.jobId}/${vars.action}`,
      )
    },
    onSuccess: (data) => {
      if (data.action !== 'run') {
        void queryClient.invalidateQueries({ queryKey: ['pack-cron', pack] })
      }
    },
  })
}
