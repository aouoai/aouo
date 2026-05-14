import { useLocation } from 'react-router-dom'
import { ChevronRight, ExternalLink } from 'lucide-react'

const SECTION_FOR_ROUTE: Record<string, { section: string; page: string }> = {
  '/': { section: '', page: 'Overview' },
  '/provider': { section: 'Configure', page: 'Provider' },
  '/tools': { section: 'Configure', page: 'Tools' },
  '/channels': { section: 'Configure', page: 'Channels' },
  '/security': { section: 'Configure', page: 'Security' },
  '/advanced': { section: 'Configure', page: 'Advanced' },
  '/status': { section: 'Observe', page: 'Status' },
  '/packs': { section: 'Observe', page: 'Packs' },
}

/**
 * Sticky top bar. Left = current section / page breadcrumb. Right = env pill,
 * version, GitHub link. Sits above every page, framing the dashboard.
 */
export function Topbar() {
  const { pathname } = useLocation()
  const current = SECTION_FOR_ROUTE[pathname] ?? { section: '', page: '' }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b bg-background px-6">
      <nav className="flex items-center gap-1.5 text-[13px]">
        {current.section && (
          <>
            <span className="text-muted-foreground">{current.section}</span>
            <ChevronRight className="size-3.5 text-muted-foreground/50" />
          </>
        )}
        <span className="font-medium tracking-tight">{current.page}</span>
      </nav>

      <div className="flex items-center gap-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          local
        </span>
        <a
          href="https://github.com/aouoai/aouo"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          GitHub
          <ExternalLink className="size-3" />
        </a>
      </div>
    </header>
  )
}
