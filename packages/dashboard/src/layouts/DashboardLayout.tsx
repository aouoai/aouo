import { cn } from '@/lib/utils'
import {
  Layers,
  Wrench,
  MessageSquare,
  Settings,
  Shield,
  Package,
  Activity,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Separator } from '@/components/ui/separator'

const NAV_ITEMS = [
  { to: '/provider', label: 'Provider', icon: Layers },
  { to: '/tools', label: 'Tools', icon: Wrench },
  { to: '/channels', label: 'Channels', icon: MessageSquare },
  { to: '/advanced', label: 'Advanced', icon: Settings },
  { to: '/security', label: 'Security', icon: Shield },
] as const

const NAV_SECONDARY = [
  { to: '/packs', label: 'Packs', icon: Package },
  { to: '/status', label: 'Status', icon: Activity },
] as const

export function DashboardLayout() {
  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        {/* Header */}
        <div className="border-b px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-xl text-primary">⬡</span>
            <span className="text-lg font-bold tracking-tight">aouo</span>
          </div>
          <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            dashboard
          </span>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-0.5 p-2.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )
              }
            >
              <Icon className="size-[18px]" />
              {label}
            </NavLink>
          ))}

          <Separator className="my-2" />

          {NAV_SECONDARY.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                )
              }
            >
              <Icon className="size-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-green-500 shadow-[0_0_6px] shadow-green-500/50" />
          <span>v0.0.1</span>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-10 py-9">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
