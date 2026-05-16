import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertCircle, FileText, FileX2, Loader2, Pencil, Plus, RefreshCw, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'

import {
  usePackMemory,
  usePackMemoryFile,
  usePackMemoryWrite,
  type MemoryFileInfo,
} from '@/hooks/use-memory'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface MemoryTabProps {
  pack: string
}

export function MemoryTab({ pack }: MemoryTabProps) {
  const queryClient = useQueryClient()
  const { data, error, isLoading } = usePackMemory(pack)
  const [selected, setSelected] = useState<string | null>(null)

  const files = data?.files ?? []

  // Highlighted row: explicit user pick wins, otherwise auto-select the first
  // existing file (or the first canonical entry as a last resort so the picker
  // always has a row highlighted; the right pane's empty state explains why).
  // Derived rather than stored so it can't get out of sync with the list.
  const activeName =
    selected ?? files.find((f) => f.exists)?.name ?? files[0]?.name ?? null

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['pack-memory', pack] })
    void queryClient.invalidateQueries({ queryKey: ['pack-memory-file', pack] })
  }

  if (error) {
    return (
      <div className="px-6 py-4">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Failed to list memory files</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-60 shrink-0 flex-col border-r">
        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
          <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
            Files
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={refresh}
            aria-label="Refresh memory list"
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
          ) : files.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              No memory files yet.
            </p>
          ) : (
            files.map((f) => (
              <FileRow
                key={f.name}
                file={f}
                active={activeName === f.name}
                onClick={() => setSelected(f.name)}
              />
            ))
          )}
        </div>
      </aside>

      <section className="flex flex-1 min-w-0 flex-col overflow-hidden">
        <FileViewer
          pack={pack}
          file={files.find((f) => f.name === activeName) ?? null}
        />
      </section>
    </div>
  )
}

function FileRow({
  file,
  active,
  onClick,
}: {
  file: MemoryFileInfo
  active: boolean
  onClick: () => void
}) {
  const Icon = file.exists ? FileText : FileX2
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
    >
      <Icon
        className={cn(
          'size-3.5 shrink-0',
          file.exists ? 'text-foreground/70' : 'text-muted-foreground/60',
        )}
      />
      <span className="flex-1 truncate font-mono text-[12.5px]">
        {file.displayName}
      </span>
      {!file.exists && (
        <Badge variant="outline" className="h-4 px-1 text-[9.5px] font-normal">
          empty
        </Badge>
      )}
    </button>
  )
}

function FileViewer({
  pack,
  file,
}: {
  pack: string
  file: MemoryFileInfo | null
}) {
  const { data, error, isLoading, isFetching } = usePackMemoryFile(
    pack,
    file?.name,
    Boolean(file?.exists),
  )
  const writeMutation = usePackMemoryWrite(pack)

  // Editing is a local snapshot of the file's content. We deliberately
  // freeze it for the lifetime of the edit session — external refetches
  // do not nudge the textarea, so the user's draft can't be silently
  // overwritten. The `key={file.name}` on the textarea below ensures a
  // fresh edit session for a fresh file.
  const [editSession, setEditSession] = useState<{
    file: string
    draft: string
    base: string
  } | null>(null)

  if (!file) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Pick a memory file from the left to view its contents.
      </div>
    )
  }

  const editingThisFile = editSession?.file === file.name
  const dirty = editingThisFile && editSession.draft !== editSession.base
  const isSaving = writeMutation.isPending && writeMutation.variables?.file === file.name

  const enterEdit = (base: string) => {
    setEditSession({ file: file.name, draft: base, base })
  }

  const cancelEdit = () => {
    if (
      dirty &&
      !window.confirm('Discard unsaved changes to ' + file.name + '?')
    ) {
      return
    }
    setEditSession(null)
  }

  const save = () => {
    if (!editingThisFile) return
    writeMutation.mutate(
      { file: file.name, content: editSession.draft },
      {
        onSuccess: (saved) => {
          toast.success(`Saved ${saved.name}`)
          setEditSession(null)
        },
        onError: (err) => {
          toast.error(`Save failed: ${(err as Error).message}`)
        },
      },
    )
  }

  return (
    <>
      <header className="flex h-10 shrink-0 items-center gap-3 border-b px-4">
        <FileText className="size-3.5 text-muted-foreground" />
        <span className="font-mono text-[12.5px]">{file.name}</span>
        {file.exists ? (
          <span className="text-[10.5px] text-muted-foreground">
            {file.size} bytes · updated{' '}
            {new Date(file.mtime).toLocaleString()}
          </span>
        ) : (
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            not created yet
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {editingThisFile ? (
            <>
              {dirty && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-amber-700 dark:text-amber-400 border-amber-500/40">
                  unsaved
                </Badge>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={cancelEdit}
                disabled={isSaving}
                className="h-7 gap-1.5"
              >
                <X className="size-3.5" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={save}
                disabled={!dirty || isSaving}
                className="h-7 gap-1.5"
              >
                {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                Save
              </Button>
            </>
          ) : file.exists ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => enterEdit(data?.content ?? '')}
              disabled={isLoading || Boolean(error)}
              className="h-7 gap-1.5"
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => enterEdit('')}
              className="h-7 gap-1.5"
            >
              <Plus className="size-3.5" />
              Create
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {editingThisFile ? (
          <div className="h-full p-4">
            <Textarea
              key={file.name}
              value={editSession.draft}
              onChange={(e) =>
                setEditSession({ ...editSession, draft: e.target.value })
              }
              disabled={isSaving}
              spellCheck={false}
              className="h-full min-h-[200px] resize-none font-mono text-[12.5px] leading-relaxed"
              placeholder={`# ${file.displayName}\n\nWrite markdown here…`}
            />
          </div>
        ) : !file.exists ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground/80">
              {file.displayName} is empty
            </p>
            <p className="mt-1 max-w-md mx-auto text-xs">
              The pack hasn't written to <code>{file.name}</code> yet. The
              agent's <code>memory</code> tool will populate it when the model
              decides to remember something — or click <strong>Create</strong>{' '}
              above to seed it from the dashboard.
            </p>
          </div>
        ) : isLoading ? (
          <div className="space-y-3 p-6">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : error ? (
          <div className="px-6 py-4">
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Failed to read {file.name}</AlertTitle>
              <AlertDescription>{(error as Error).message}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <div
            className={cn(
              'mx-auto max-w-3xl px-6 py-6',
              isFetching && 'opacity-60 transition-opacity',
            )}
          >
            <article className="prose prose-sm dark:prose-invert max-w-none [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {data?.content ?? ''}
              </ReactMarkdown>
            </article>
          </div>
        )}
      </div>
    </>
  )
}
