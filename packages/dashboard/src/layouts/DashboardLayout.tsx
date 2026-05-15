import { Outlet, useLocation, useMatch } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

import { AppSidebar } from '@/components/AppSidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

const TITLES: Record<string, string> = {
  '/': 'Overview',
  '/provider': 'Provider',
  '/tools': 'Tools',
  '/channels': 'Channels',
  '/security': 'Security',
  '/advanced': 'Advanced',
  '/status': 'Status',
  '/packs': 'Packs',
}

const SECTIONS: Record<string, string> = {
  '/': 'Workspace',
  '/packs': 'Workspace',
  '/status': 'Workspace',
  '/provider': 'Settings',
  '/tools': 'Settings',
  '/channels': 'Settings',
  '/security': 'Settings',
  '/advanced': 'Settings',
}

export function DashboardLayout() {
  const fullBleed = useMatch('/packs/:pack/*')
  return (
    <TooltipProvider delay={120}>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* Pack workspaces render their own topbar (with pack name + settings
              affordance). Other routes get the simple breadcrumb topbar. */}
          {!fullBleed && <DashboardTopbar />}
          {fullBleed ? (
            <main className="flex flex-1 min-h-0 flex-col overflow-hidden">
              <Outlet />
            </main>
          ) : (
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-5xl px-8 py-7">
                <Outlet />
              </div>
            </main>
          )}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function DashboardTopbar() {
  const { pathname } = useLocation()
  const title = TITLES[pathname] ?? 'Dashboard'
  const section = SECTIONS[pathname] ?? 'Workspace'

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <nav className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">{section}</span>
        <ChevronRight className="size-3.5 text-muted-foreground/60" />
        <span className="font-medium">{title}</span>
      </nav>
    </header>
  )
}
