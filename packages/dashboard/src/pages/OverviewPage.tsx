import { Link } from 'react-router-dom'
import { ArrowRight, Cpu, FolderCheck, Package, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCard } from '@/components/stat-card'
import {
  usePacks,
  useStatus,
  type StatusCheck,
  type StatusResponse,
} from '@/hooks/use-config'

export function OverviewPage() {
  const status = useStatus()
  const packs = usePacks()
  const data = status.data
  const packsCount = packs.data?.packs.length ?? 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A quick look at your runtime — credentials, channels, and installed packs.
        </p>
      </div>

      <div className="mb-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {status.isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-22 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              label="Provider"
              value={providerHeadline(data)}
              hint={data.provider}
              tone={checkTone(data, 'Provider credential')}
              icon={Cpu}
            />
            <StatCard
              label="Runtime"
              value={check(data, 'Initialized')?.ok ? 'Ready' : 'Init needed'}
              hint={check(data, 'Initialized')?.detail}
              tone={checkTone(data, 'Initialized')}
              icon={FolderCheck}
            />
            <StatCard
              label="Telegram"
              value={telegramHeadline(data)}
              hint={check(data, 'Telegram')?.detail}
              tone={checkTone(data, 'Telegram')}
              icon={Send}
            />
            <StatCard
              label="Packs"
              value={String(packsCount)}
              hint={packsCount === 0 ? 'Link one to get started' : 'installed'}
              tone={packsCount === 0 ? 'warn' : 'ok'}
              icon={Package}
            />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Installed packs</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {packs.isLoading && (
                <div className="space-y-2 px-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              )}
              {packs.data && packs.data.packs.length === 0 && (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                  <Package className="size-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No packs linked yet.</p>
                  <div className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                    aouo pack link ./apps/notes
                  </div>
                </div>
              )}
              {packs.data && packs.data.packs.length > 0 && (
                <ul className="divide-y">
                  {packs.data.packs.slice(0, 5).map((p) => (
                    <li
                      key={p.name}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Package className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-medium">{p.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              v{p.version}
                            </span>
                          </div>
                          {p.description && (
                            <p className="truncate text-xs text-muted-foreground">
                              {p.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-baseline gap-3 font-mono text-[11px] text-muted-foreground">
                        <span>
                          <span className="text-foreground tabular-nums">{p.skills}</span> skills
                        </span>
                        <span>
                          <span className="text-foreground tabular-nums">{p.cronDefaults}</span> cron
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <ul className="divide-y">
                <QuickAction
                  to="/provider"
                  title="Set provider keys"
                  hint="Gemini, Codex, or DeepSeek"
                />
                <QuickAction
                  to="/channels"
                  title="Configure Telegram"
                  hint="Bot token + allowlist"
                />
                <QuickAction
                  to="/packs"
                  title="Browse installed packs"
                  hint="View linked vertical apps"
                />
                <QuickAction
                  to="/status"
                  title="Run health checks"
                  hint="Runtime gates and warnings"
                />
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function QuickAction({ to, title, hint }: { to: string; title: string; hint: string }) {
  return (
    <li>
      <Link
        to={to}
        className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
      >
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  )
}

// ── helpers ──────────────────────────────────────────────────────────────────

function check(data: StatusResponse, name: string): StatusCheck | undefined {
  return data.checks.find((c) => c.name === name)
}

function checkTone(data: StatusResponse, name: string): 'ok' | 'warn' | 'neutral' {
  const c = check(data, name)
  if (!c) return 'neutral'
  return c.ok ? 'ok' : 'warn'
}

function providerHeadline(data: StatusResponse): string {
  return check(data, 'Provider credential')?.ok ? 'Ready' : 'Set key'
}

function telegramHeadline(data: StatusResponse): string {
  const c = check(data, 'Telegram')
  if (!c) return '—'
  if (c.detail === 'disabled') return 'Disabled'
  return c.ok ? 'Active' : 'Setup'
}
