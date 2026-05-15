import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface SkillInfo {
  name: string
  qualifiedName: string
  displayName: string
  description: string
}

export interface CronJobInfo {
  id: string
  schedule: string
  skill: string
  enabledByDefault: boolean
}

export interface PackDetail {
  name: string
  version: string
  displayName: string
  description: string
  path: string
  skills: SkillInfo[]
  cron: CronJobInfo[]
}

export function usePackDetail(name: string | undefined) {
  return useQuery({
    enabled: Boolean(name),
    queryKey: ['pack', name],
    queryFn: () => api.get<PackDetail>(`/api/packs/${name}`),
  })
}

export interface HistoryMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface PackHistory {
  sessionId: string | null
  messages: HistoryMessage[]
}

/**
 * Hydration payload for the pack chat panel. We fetch once per mount and keep
 * the data fresh forever — new turns from the current session live in local
 * state inside `useChat`, so a background refetch would only re-render with
 * the same data. When the user switches packs the workspace remounts (the
 * route param changes plus `key={pack.name}` on ChatPanel), which mints a
 * new query key and re-fetches.
 */
export function usePackHistory(name: string | undefined) {
  return useQuery({
    enabled: Boolean(name),
    queryKey: ['pack-history', name],
    queryFn: () => api.get<PackHistory>(`/api/packs/${name}/history?limit=50`),
    staleTime: Infinity,
  })
}
