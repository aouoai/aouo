import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ── Types (mirroring @aouo/agent AouoConfig — no direct import, dashboard is pure frontend) ──

export interface AouoConfig {
  version: string
  provider: {
    backend: 'gemini' | 'codex' | 'deepseek'
    model: string
    max_tokens: number
    temperature: number
    max_retries: number
  }
  gemini: { api_key: string; vision_model: string }
  deepseek: { api_key: string }
  tools: {
    enabled: string[]
    web_search: { backend: string; api_key: string; max_results: number }
  }
  security: { allowed_paths: string[]; fence_mode: 'ask' | 'deny' | 'allow' }
  packs: { enabled: string[]; scan_dirs: string[] }
  telegram: { enabled: boolean; bot_token: string; allowed_user_ids: number[] }
  cron: {
    enabled: boolean
    tick_seconds: number
    timezone: string
    default_platform: string
    default_chat_id: string
  }
  stt: { groq_api_key: string; model: string }
  tts: { voice: string; rate: string }
  azure: { speech_key: string; speech_region: string }
  ui: { show_tool_calls: boolean }
  advanced: {
    context_window: number
    compress_threshold: number
    max_history_messages: number
    log_level: 'debug' | 'info' | 'warn' | 'error'
    max_react_loops: number
    session_tokens_max: number
    daily_tokens_max: number
  }
}

export interface StatusCheck {
  name: string
  ok: boolean
  detail: string
}

export interface StatusResponse {
  version: string
  provider: string
  home: string
  configPath: string
  checks: StatusCheck[]
}

export interface PackInfo {
  name: string
  path: string
}

interface SaveResponse {
  ok: boolean
  config: AouoConfig
}

// ── Query Keys ──

export const queryKeys = {
  config: ['config'] as const,
  configRaw: ['config', 'raw'] as const,
  status: ['status'] as const,
  packs: ['packs'] as const,
}

// ── Hooks ──

/** Fetch masked config (for display). */
export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => api.get<AouoConfig>('/api/config'),
  })
}

/** Fetch raw config (for form values — contains unmasked secrets). */
export function useConfigRaw() {
  return useQuery({
    queryKey: queryKeys.configRaw,
    queryFn: () => api.get<AouoConfig>('/api/config/raw'),
  })
}

/** Save a config section. Invalidates config queries on success. */
export function useSaveConfig(section: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.put<SaveResponse>(`/api/config/${section}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.config })
      queryClient.invalidateQueries({ queryKey: queryKeys.configRaw })
    },
  })
}

/** Fetch system status (doctor-style health checks). */
export function useStatus() {
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: () => api.get<StatusResponse>('/api/status'),
  })
}

/** Fetch installed packs list. */
export function usePacks() {
  return useQuery({
    queryKey: queryKeys.packs,
    queryFn: () => api.get<{ packs: PackInfo[] }>('/api/packs'),
  })
}
