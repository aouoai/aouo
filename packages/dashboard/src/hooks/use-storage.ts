import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface ColumnInfo {
  name: string
  type: string
  notnull: boolean
  pk: boolean
}

export interface TableInfo {
  name: string
  columns: ColumnInfo[]
  rowCount: number
}

export interface StorageTablesResponse {
  exists: boolean
  tables: TableInfo[]
}

export interface StorageRowsResponse {
  table: string
  columns: ColumnInfo[]
  rows: Array<Record<string, unknown>>
  truncated: boolean
  rowCount: number
}

export function usePackStorageTables(pack: string | undefined) {
  return useQuery({
    enabled: Boolean(pack),
    queryKey: ['pack-storage-tables', pack],
    queryFn: () =>
      api.get<StorageTablesResponse>(`/api/packs/${pack}/storage/tables`),
    staleTime: 5_000,
  })
}

/**
 * Reads the trailing `limit` rows of one table. Disabled until a table is
 * picked so navigating to Storage without a selection doesn't fire a 404.
 */
export function usePackStorageRows(
  pack: string | undefined,
  table: string | null,
  limit = 50,
) {
  return useQuery({
    enabled: Boolean(pack) && Boolean(table),
    queryKey: ['pack-storage-rows', pack, table, limit],
    queryFn: () =>
      api.get<StorageRowsResponse>(
        `/api/packs/${pack}/storage/tables/${table}?limit=${limit}`,
      ),
    staleTime: 5_000,
  })
}
