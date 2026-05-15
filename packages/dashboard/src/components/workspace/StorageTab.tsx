import { useState } from 'react'
import { AlertCircle, Database, KeyRound, RefreshCw, Table as TableIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import {
  usePackStorageRows,
  usePackStorageTables,
  type ColumnInfo,
  type TableInfo,
} from '@/hooks/use-storage'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface StorageTabProps {
  pack: string
}

const ROW_LIMIT = 50
const CELL_CLAMP = 120

export function StorageTab({ pack }: StorageTabProps) {
  const queryClient = useQueryClient()
  const { data, error, isLoading } = usePackStorageTables(pack)
  const [selected, setSelected] = useState<string | null>(null)

  const tables = data?.tables ?? []
  // Derived selection so the highlight can't desync from a refresh that
  // drops the currently-picked table (e.g., pack-managed schema migration).
  const activeName =
    selected && tables.some((t) => t.name === selected)
      ? selected
      : (tables[0]?.name ?? null)

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['pack-storage-tables', pack] })
    void queryClient.invalidateQueries({ queryKey: ['pack-storage-rows', pack] })
  }

  if (error) {
    return (
      <div className="px-6 py-4">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Failed to list tables</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!isLoading && data && !data.exists) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <Database className="size-7 text-muted-foreground/40" />
        <p className="text-sm font-medium">No storage yet</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          This pack hasn't persisted anything. Its SQLite file at
          {' '}<code className="rounded bg-muted px-1">{pack}.db</code> will
          appear here once the agent writes via the <code>persist</code> tool.
        </p>
        <Button variant="outline" size="sm" className="mt-2 gap-1.5" onClick={refreshAll}>
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-64 shrink-0 flex-col border-r">
        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
          <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
            Tables
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={refreshAll}
            aria-label="Refresh storage"
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-2 p-1">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          ) : tables.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              DB is empty — no tables defined.
            </p>
          ) : (
            tables.map((t) => (
              <TableRow_
                key={t.name}
                table={t}
                active={activeName === t.name}
                onClick={() => setSelected(t.name)}
              />
            ))
          )}
        </div>
      </aside>

      <section className="flex flex-1 min-w-0 flex-col overflow-hidden">
        <RowsViewer
          pack={pack}
          table={tables.find((t) => t.name === activeName) ?? null}
        />
      </section>
    </div>
  )
}

function TableRow_({
  table,
  active,
  onClick,
}: {
  table: TableInfo
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
    >
      <TableIcon className="size-3.5 shrink-0 text-foreground/70" />
      <span className="flex-1 truncate font-mono text-[12.5px]">{table.name}</span>
      <Badge variant="outline" className="h-4 px-1 text-[9.5px] font-normal tabular-nums">
        {table.rowCount}
      </Badge>
    </button>
  )
}

function RowsViewer({
  pack,
  table,
}: {
  pack: string
  table: TableInfo | null
}) {
  const { data, error, isLoading, isFetching } = usePackStorageRows(
    pack,
    table?.name ?? null,
    ROW_LIMIT,
  )

  if (!table) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Pick a table from the left to inspect rows.
      </div>
    )
  }

  return (
    <>
      <header className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
        <TableIcon className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-[12.5px]">{table.name}</span>
        <span className="text-[10.5px] text-muted-foreground">
          {table.columns.length} cols · {table.rowCount} rows
        </span>
        {data?.truncated && (
          <Badge variant="outline" className="ml-2 h-5 px-1.5 text-[10px]">
            showing {data.rows.length} most recent
          </Badge>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : error ? (
          <div className="px-6 py-4">
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Failed to read {table.name}</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          </div>
        ) : !data || data.rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Table is empty.
          </div>
        ) : (
          <div className={cn(isFetching && 'opacity-60 transition-opacity')}>
            <Table>
              <TableHeader>
                <TableRow>
                  {data.columns.map((c) => (
                    <ColumnHead key={c.name} column={c} />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, idx) => (
                  <TableRow key={idx}>
                    {data.columns.map((c) => (
                      <CellValue key={c.name} value={row[c.name]} />
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  )
}

function ColumnHead({ column }: { column: ColumnInfo }) {
  return (
    <TableHead className="whitespace-nowrap font-mono text-[10.5px] normal-case tracking-normal">
      <span className="inline-flex items-center gap-1">
        {column.pk && <KeyRound className="size-3 text-amber-500" />}
        {column.name}
        <span className="text-muted-foreground/60">{column.type || 'ANY'}</span>
      </span>
    </TableHead>
  )
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <TableCell className="font-mono text-[12px] text-muted-foreground/70">
        NULL
      </TableCell>
    )
  }
  const display = typeof value === 'string' ? value : JSON.stringify(value)
  const truncated = display.length > CELL_CLAMP
  return (
    <TableCell className="max-w-[28rem] whitespace-nowrap font-mono text-[12px]">
      <span title={truncated ? display : undefined} className="block truncate">
        {truncated ? `${display.slice(0, CELL_CLAMP)}…` : display}
      </span>
    </TableCell>
  )
}
