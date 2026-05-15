import { Link, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ChevronRight,
  Clock,
  Database,
  FolderTree,
  MessageSquare,
  ScrollText,
  Settings,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePackDetail } from '@/hooks/use-pack'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { MemoryTab } from '@/components/workspace/MemoryTab'
import { StorageTab } from '@/components/workspace/StorageTab'

const PHASE5_TABS = [
  { value: 'cron', label: 'Cron', icon: Clock },
  { value: 'logs', label: 'Logs', icon: ScrollText },
] as const

export function PackWorkspacePage() {
  const { pack: packName } = useParams<{ pack: string }>()
  const { data: pack, error, isLoading } = usePackDetail(packName)

  if (!packName) return null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* ── Topbar: breadcrumb · pack name · settings ─────────────────────── */}
      <header className="relative flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-1" />
          <nav className="flex items-center gap-1.5 text-sm">
            <Link to="/packs" className="text-muted-foreground hover:text-foreground">
              Apps
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground/60" />
            <span className="font-mono text-[12.5px]">{packName}</span>
          </nav>
        </div>

        <div className="pointer-events-none absolute inset-x-0 flex justify-center">
          {pack && (
            <span className="text-sm font-semibold tracking-tight">
              {pack.displayName}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="Pack settings" disabled />
              }
            >
              <Settings className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Pack settings · Phase 5</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {error && (
        <div className="shrink-0 px-6 py-4">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Pack not loaded</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        </div>
      )}

      {isLoading && (
        <div className="flex flex-1 items-center justify-center px-6">
          <Skeleton className="h-8 w-40" />
        </div>
      )}

      {pack && (
        <Tabs
          defaultValue="chat"
          className="flex flex-1 min-h-0 flex-col overflow-hidden"
        >
          <div className="shrink-0 border-b px-4">
            <TabsList className="h-10 bg-transparent p-0">
              <TabsTrigger
                value="chat"
                className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <MessageSquare className="size-3.5" />
                Chat
              </TabsTrigger>
              <TabsTrigger
                value="memory"
                className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <FolderTree className="size-3.5" />
                Memory
              </TabsTrigger>
              <TabsTrigger
                value="storage"
                className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                <Database className="size-3.5" />
                Storage
              </TabsTrigger>
              {PHASE5_TABS.map((t) => {
                const Icon = t.icon
                return (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    disabled
                    className="gap-1.5 text-muted-foreground/50"
                  >
                    <Icon className="size-3.5" />
                    {t.label}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>

          <TabsContent
            value="chat"
            className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <ChatPanel key={pack.name} pack={pack} />
          </TabsContent>

          <TabsContent
            value="memory"
            className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <MemoryTab key={pack.name} pack={pack.name} />
          </TabsContent>

          <TabsContent
            value="storage"
            className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden"
          >
            <StorageTab key={pack.name} pack={pack.name} />
          </TabsContent>

          {PHASE5_TABS.map((t) => (
            <TabsContent
              key={t.value}
              value={t.value}
              className="flex-1 min-h-0 overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t.label} viewer arrives in a follow-up commit.
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
