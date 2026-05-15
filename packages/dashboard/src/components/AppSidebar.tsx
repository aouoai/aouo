import { useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Activity,
  AppWindow,
  Boxes,
  Cpu,
  Gauge,
  Plug,
  Settings2,
  Shield,
  Sparkles,
  Wrench,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from '@/components/ui/sidebar'
import { useConfig, usePacks } from '@/hooks/use-config'

type NavEntry = {
  to: string
  label: string
  icon: typeof Activity
  end?: boolean
}

// "Workspace" — runtime/inspection surfaces. Lives at the top because users
// drop in here daily, not into provider keys.
const WORKSPACE_NAV: NavEntry[] = [
  { to: '/', label: 'Overview', icon: Sparkles, end: true },
  { to: '/packs', label: 'Packs', icon: Boxes },
  { to: '/status', label: 'Status', icon: Gauge },
]

// "Settings" — everything that wires the runtime to external services. Grouped
// together so first-time setup feels linear, and so the eventual
// settings-dropdown footer can absorb this group wholesale.
const SETTINGS_NAV: NavEntry[] = [
  { to: '/provider', label: 'Provider', icon: Cpu },
  { to: '/tools', label: 'Tools', icon: Wrench },
  { to: '/channels', label: 'Channels', icon: Plug },
  { to: '/security', label: 'Security', icon: Shield },
  { to: '/advanced', label: 'Advanced', icon: Settings2 },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const { data: packs, isLoading: packsLoading } = usePacks()
  const { data: config } = useConfig()

  const apps = useMemo(() => packs?.packs ?? [], [packs])

  const providerLabel = config
    ? `${config.provider.backend} · ${config.provider.model}`
    : '—'

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-md">
                <span className="font-mono text-[13px] font-semibold tracking-tight">A</span>
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">AOUO</span>
                <span className="truncate text-xs text-muted-foreground">Local workspace</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Apps</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {packsLoading && (
                <>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                </>
              )}
              {!packsLoading && apps.length === 0 && (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <AppWindow />
                    <span className="text-muted-foreground">No packs installed</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {!packsLoading &&
                apps.map((pack) => {
                  const to = `/packs/${pack.name}`
                  const active = pathname === to || pathname.startsWith(`${to}/`)
                  return (
                    <SidebarMenuItem key={pack.name}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={pack.name}
                        render={<NavLink to={to} />}
                      >
                        <AppWindow />
                        <span className="truncate">{pack.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {WORKSPACE_NAV.map((item) => (
                <NavRow key={item.to} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {SETTINGS_NAV.map((item) => (
                <NavRow key={item.to} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
          <span className="font-mono">{providerLabel}</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}

function NavRow({ item }: { item: NavEntry }) {
  const { pathname } = useLocation()
  const active = item.end ? pathname === item.to : pathname.startsWith(item.to)
  const Icon = item.icon
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        render={<NavLink to={item.to} end={item.end} />}
      >
        <Icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
