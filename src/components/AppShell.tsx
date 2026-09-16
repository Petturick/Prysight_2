'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { EanAutoDiscovery } from '@/components/EanAutoDiscovery'
import { InteractionFeedback } from '@/components/InteractionFeedback'
import { RoutePrefetcher } from '@/components/RoutePrefetcher'
import { Sidebar } from '@/components/Sidebar'
import type { AppRole } from '@/lib/roles'

type ShellUser = { name?: string | null; email?: string | null; role?: AppRole | null }
type RouteMeta = { title: string; helper: string; action?: { href: string; label: string } }

const mobileItems = [
  ['/dashboard','Overzicht'],
  ['/producten','Producten'],
  ['/concurrenten','Markt'],
  ['/acties','Acties'],
  ['/rapportages','Inzichten'],
  ['/instellingen','Beheer'],
] as const

function routeMeta(pathname: string): RouteMeta {
  if (pathname.startsWith('/producten')) return { title: 'Producten', helper: 'Vergelijk eigen prijzen met de markt', action: { href: '/producten/nieuw', label: 'Product toevoegen' } }
  if (pathname.startsWith('/concurrenten') || pathname.startsWith('/monitoring') || pathname.startsWith('/productmatches')) return { title: 'Markt', helper: 'Concurrenten, matches en meetkwaliteit', action: { href: '/productmatches', label: 'Matches controleren' } }
  if (pathname.startsWith('/acties') || pathname.startsWith('/waarschuwingen') || pathname.startsWith('/prijsstrategie') || pathname.startsWith('/prijsregels') || pathname.startsWith('/prijswijzigingen') || pathname.startsWith('/prijsautomatisering')) return { title: 'Acties', helper: 'Werk alleen af wat echt aandacht vraagt', action: { href: '/acties', label: 'Open acties' } }
  if (pathname.startsWith('/rapportages')) return { title: 'Inzichten', helper: 'Analyseer trends en deel conclusies' }
  if (pathname.startsWith('/instellingen') || pathname.startsWith('/feeds') || pathname.startsWith('/import') || pathname.startsWith('/integraties') || pathname.startsWith('/beheer') || pathname.startsWith('/onboarding')) return { title: 'Beheer', helper: 'Data, feeds, koppelingen en organisatie', action: { href: '/import/bulk', label: 'Bulk import' } }
  return { title: 'Overzicht', helper: 'Zie direct wat vandaag belangrijk is', action: { href: '/acties', label: 'Bekijk acties' } }
}

export function AppShell({ children, user }: { children: React.ReactNode; user?: ShellUser | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const isAuthenticationRoute = pathname === '/' || pathname === '/login' || pathname === '/reset-password'
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
  const context = routeMeta(pathname)
  const warm = (href: string) => router.prefetch(href)

  if (isAuthenticationRoute) return <><InteractionFeedback key={pathname} /><main className="min-h-screen bg-[var(--background)]">{children}</main></>

  return <>
    <InteractionFeedback key={pathname} />
    <RoutePrefetcher />
    <EanAutoDiscovery />
    <div className="ps-workspace-shell flex min-h-dvh">
      <div className="hidden lg:block lg:w-60 lg:flex-none">
        <div className="fixed inset-y-0 z-30 w-60"><Sidebar user={user} /></div>
      </div>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-[#e5ebf0] bg-white/95 backdrop-blur-sm">
          <div className="ps-workspace-topbar flex min-h-[88px] items-center gap-5 px-5 py-4 sm:px-7">
            <div className="min-w-[180px] shrink-0">
              <h1 className="ps-workspace-context-title text-[22px] font-semibold tracking-[-0.025em] text-[#0b1f35]">{context.title}</h1>
              <p className="ps-workspace-context-copy mt-1 hidden text-sm leading-5 text-[#6b7b8e] xl:block">{context.helper}</p>
            </div>

            <form action="/producten" className="relative min-w-0 flex-1 md:max-w-[520px]">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b8d9f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input name="q" aria-label="Zoeken" placeholder="Zoek product, EAN of concurrent" className="ps-workspace-search h-10 w-full rounded-lg border border-[#dbe4eb] bg-[#f9fbfc] pl-9 pr-3 text-sm font-normal text-[#334b63] placeholder:text-[#8b9aaa]" />
            </form>

            <div className="ml-auto flex shrink-0 items-center gap-2.5">
              {context.action ? <Link href={context.action.href} prefetch={false} onMouseEnter={() => warm(context.action!.href)} onFocus={() => warm(context.action!.href)} className="hidden min-h-10 items-center rounded-lg bg-blue-600 px-3.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 md:inline-flex">{context.action.label}</Link> : null}
              <Link href="/acties" prefetch={false} onMouseEnter={() => warm('/acties')} onFocus={() => warm('/acties')} className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-[#e5ebf0] bg-white text-[#60778c] transition-colors hover:bg-[#f9fbfc]" title="Acties">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"/><path d="M10 20h4"/></svg>
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#cf5558]" />
              </Link>
              {user ? <Link href="/instellingen/profiel" prefetch={false} onMouseEnter={() => warm('/instellingen/profiel')} onFocus={() => warm('/instellingen/profiel')} className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-[#f9fbfc]">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#183d58] text-xs font-semibold text-white">{initials}</div>
                <div className="hidden 2xl:block"><p className="max-w-[135px] truncate text-xs font-semibold text-[#0b1f35]">{user.name || user.email}</p><p className="mt-0.5 text-[10px] font-medium text-[#7c8fa3]">Profiel</p></div>
              </Link> : null}
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-[#edf1f4] bg-white px-3 py-2 lg:hidden" aria-label="Hoofdnavigatie">
            {mobileItems.map(([href,label]) => <Link key={href} href={href} prefetch={false} onMouseEnter={() => warm(href)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium ${pathname === href || pathname.startsWith(`${href}/`) ? 'bg-blue-600 text-white' : 'text-[#60778c]'}`}>{label}</Link>)}
          </nav>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-6 lg:px-7 lg:pb-10 lg:pt-6">
          <div className="w-full max-w-[1540px]">{children}</div>
        </main>
      </div>
    </div>
  </>
}
