import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface MemoryFileInfo {
  name: string
  displayName: string
  exists: boolean
  size: number
  mtime: string
}

export interface MemoryListResponse {
  files: MemoryFileInfo[]
}

export interface MemoryFile {
  name: string
  content: string
  size: number
  mtime: string
}

export function usePackMemory(pack: string | undefined) {
  return useQuery({
    enabled: Boolean(pack),
    queryKey: ['pack-memory', pack],
    queryFn: () => api.get<MemoryListResponse>(`/api/packs/${pack}/memory`),
    staleTime: 5_000,
  })
}

/**
 * Reads one memory file. The hook is intentionally enabled only when both
 * `pack` and `file` are present *and* the file is known to exist — the
 * dashboard picker holds that signal and feeds it in via `exists`. We keep
 * the staleness short so a refresh button can re-pull after the pack's
 * `memory` tool writes new content.
 */
export function usePackMemoryFile(
  pack: string | undefined,
  file: string | undefined,
  exists: boolean,
) {
  return useQuery({
    enabled: Boolean(pack) && Boolean(file) && exists,
    queryKey: ['pack-memory-file', pack, file],
    queryFn: () =>
      api.get<MemoryFile>(`/api/packs/${pack}/memory/${file}`),
    staleTime: 5_000,
  })
}

/**
 * Replaces (or creates) one memory file. Invalidates both the listing and
 * the single-file query on success so the picker's `exists` flag and the
 * viewer's content refresh from the server's echoed state.
 */
export function usePackMemoryWrite(pack: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (vars: { file: string; content: string }) => {
      return api.put<MemoryFile>(
        `/api/packs/${pack}/memory/${vars.file}`,
        { content: vars.content },
      )
    },
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: ['pack-memory', pack] })
      void queryClient.invalidateQueries({
        queryKey: ['pack-memory-file', pack, vars.file],
      })
    },
  })
}
