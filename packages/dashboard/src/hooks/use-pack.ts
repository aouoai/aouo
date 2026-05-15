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
