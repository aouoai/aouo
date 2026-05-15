import { AlertCircle, ArrowRight, Package } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { usePacks } from '@/hooks/use-config'

export function PacksPage() {
  const { data, isLoading, error } = usePacks()
  const navigate = useNavigate()

  return (
    <div>
      <PageHeader
        title="Packs"
        description="Installed vertical agent app packs."
        actions={
          data && (
            <Badge variant="secondary">
              {data.packs.length} installed
            </Badge>
          )
        }
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertTitle>Could not load packs</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Linked & installed</CardTitle>
          <CardDescription>
            Packs are linked from the CLI for now — installation from the dashboard lands later.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {isLoading && (
            <div className="space-y-2 px-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          )}

          {data && data.packs.length === 0 && (
            <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <Package className="size-9 text-muted-foreground/40" />
              <p className="text-sm font-medium">No packs installed yet.</p>
              <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                aouo pack link ./apps/notes
              </div>
            </div>
          )}

          {data && data.packs.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead className="w-24">Version</TableHead>
                  <TableHead className="w-20 text-right">Skills</TableHead>
                  <TableHead className="w-20 text-right">Cron</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead className="w-24 pr-4 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.packs.map((p) => (
                  <TableRow
                    key={p.name}
                    className="cursor-pointer"
                    onClick={() => navigate(`/packs/${p.name}`)}
                  >
                    <TableCell className="pl-4">
                      <div className="flex flex-col">
                        <span className="font-medium">{p.name}</span>
                        {p.description && (
                          <span className="text-xs text-muted-foreground">{p.description}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        v{p.version}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{p.skills}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.cronDefaults}</TableCell>
                    <TableCell className="max-w-55 truncate font-mono text-[11px] text-muted-foreground" title={p.path}>
                      {p.path}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/packs/${p.name}`)
                        }}
                      >
                        Open
                        <ArrowRight className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
