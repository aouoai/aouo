import { cn } from '@/lib/utils'
import {
  Activity,
  Cpu,
  Gauge,
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings2,
  Shield,
  Wrench,
} from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { Topbar } from '@/components/topbar'

type NavItem = { to: string; label: string; icon: typeof Activity; end?: boolean }

const NAV_PRIMARY: NavItem[] = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
]

const NAV_CONFIGURE: NavItem[] = [
  { to: '/provider', label: 'Provider', icon: Cpu },
  { to: '/tools', label: 'Tools', icon: Wrench },
  { to: '/channels', label: 'Channels', icon: MessageSquare },
  { to: '/security', label: 'Security', icon: Shield },
  { to: '/advanced', label: 'Advanced', icon: Settings2 },
]

const NAV_OBSERVE: NavItem[] = [
  { to: '/status', label: 'Status', icon: Gauge },
  { to: '/packs', label: 'Packs', icon: Package },
]

export function DashboardLayout() {
  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <SidebarHeader />
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
          <NavList items={NAV_PRIMARY} />
          <NavGroup label="Configure" items={NAV_CONFIGURE} />
          <NavGroup label="Observe" items={NAV_OBSERVE} />
        </nav>
        <SidebarFooter />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-8 py-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function SidebarHeader() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3.5">
      <img src="/logo.svg" alt="AOUO" className="size-7" />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="text-[15px] font-semibold tracking-[0.04em]">AOUO</span>
        <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
          Dashboard
        </span>
      </div>
    </div>
  )
}

function SidebarFooter() {
  return (
    <div className="border-t px-4 py-3">
      <div className="flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          <span>Connected</span>
        </span>
        <span className="font-mono text-muted-foreground">v0.0.1</span>
      </div>
    </div>
  )
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
        {label}
      </div>
      <NavList items={items} />
    </div>
  )
}

function NavList({ items }: { items: NavItem[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <NavRow key={item.to} {...item} />
      ))}
    </div>
  )
}

function NavRow({ to, label, icon: Icon, end }: NavItem) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span>{label}</span>
    </NavLink>
  )
}
