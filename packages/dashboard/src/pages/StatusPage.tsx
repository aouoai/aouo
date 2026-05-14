import { AlertCircle, CheckCircle2, Cpu, Database, FolderCheck, Send } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { DescList } from '@/components/desc-list'
import { PageHeader } from '@/components/page-header'
import { StatCard } from '@/components/stat-card'
import { useStatus } from '@/hooks/use-config'

export function StatusPage() {
  const { data, isLoading, error } = useStatus()

  return (
    <div>
      <PageHeader
        title="Status"
        description="System health checks and environment diagnostics."
        actions={data && <Badge variant="secondary">{data.version}</Badge>}
      />

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle />
          <AlertTitle>Could not load status</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-22 rounded-xl" />)
          : data && (
              <>
                <StatCard
                  label="Provider"
                  value={data.provider}
                  tone={kpiTone(data, 'Provider credential')}
                  hint={kpiHint(data, 'Provider credential')}
                  icon={Cpu}
                />
                <StatCard
                  label="Runtime"
                  value={data.checks.find((c) => c.name === 'Initialized')?.ok ? 'Ready' : 'Init needed'}
                  tone={kpiTone(data, 'Initialized')}
                  hint={data.checks.find((c) => c.name === 'Initialized')?.detail}
                  icon={FolderCheck}
                />
                <StatCard
                  label="Telegram"
                  value={telegramStatusLabel(data)}
                  tone={kpiTone(data, 'Telegram')}
                  hint={data.checks.find((c) => c.name === 'Telegram')?.detail}
                  icon={Send}
                />
                <StatCard
                  label="Database"
                  value={data.checks.find((c) => c.name === 'Database')?.ok ? 'Active' : 'Pending'}
                  tone={kpiTone(data, 'Database')}
                  hint={data.checks.find((c) => c.name === 'Database')?.detail}
                  icon={Database}
                />
              </>
            )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Health checks</CardTitle>
            <CardDescription>Runtime gates evaluated at request time.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-md" />
                ))}
              </div>
            )}
            {data && (
              <ul className="space-y-1.5">
                {data.checks.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-start justify-between gap-3 rounded-md px-3 py-2.5 ring-1 ring-foreground/5 hover:bg-muted/30"
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      {c.ok ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{c.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{c.detail}</div>
                      </div>
                    </div>
                    <Badge variant={c.ok ? 'outline' : 'secondary'} className="shrink-0">
                      {c.ok ? 'OK' : 'Check'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
            <CardDescription>Where this agent is running from.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-6" />
                ))}
              </div>
            ) : (
              data && (
                <DescList
                  labelWidth="w-20"
                  items={[
                    { label: 'Version', value: data.version },
                    { label: 'Provider', value: data.provider },
                    { label: 'Home', value: data.home, mono: true },
                    { label: 'Config', value: data.configPath, mono: true },
                  ]}
                />
              )
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function kpiTone(
  data: { checks: Array<{ name: string; ok: boolean }> },
  name: string,
): 'ok' | 'warn' | 'neutral' {
  const c = data.checks.find((x) => x.name === name)
  if (!c) return 'neutral'
  return c.ok ? 'ok' : 'warn'
}

function kpiHint(
  data: { checks: Array<{ name: string; detail: string }> },
  name: string,
): string | undefined {
  return data.checks.find((c) => c.name === name)?.detail
}

function telegramStatusLabel(data: { checks: Array<{ name: string; ok: boolean; detail: string }> }): string {
  const c = data.checks.find((x) => x.name === 'Telegram')
  if (!c) return 'unknown'
  if (c.detail === 'disabled') return 'Disabled'
  return c.ok ? 'Active' : 'Misconfigured'
}
