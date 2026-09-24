'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { EanAutoDiscovery } from '@/components/EanAutoDiscovery'
import { InteractionFeedback } from '@/components/InteractionFeedback'
import { RoutePrefetcher } from '@/components/RoutePrefetcher'
import { Sidebar } from '@/components/Sidebar'
import { GlobalMarketSwitcher } from '@/components/GlobalMarketSwitcher'
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
  if (pathname.startsWith('/concurrenten')) return { title: 'Concurrenten', helper: 'Beheer concurrenten per markt', action: { href: '/productmatches', label: 'Matches controleren' } }
  if (pathname.startsWith('/monitoring') || pathname.startsWith('/productmatches')) return { title: 'Markt', helper: 'Productmatches en meetkwaliteit', action: { href: '/concurrenten', label: 'Concurrenten' } }
  if (pathname.startsWith('/acties') || pathname.startsWith('/waarschuwingen') || pathname.startsWith('/prijsstrategie') || pathname.startsWith('/prijsregels') || pathname.startsWith('/prijswijzigingen') || pathname.startsWith('/prijsautomatisering')) return { title: 'Acties', helper: 'Werk alleen af wat echt aandacht vraagt', action: { href: '/acties', label: 'Open acties' } }
  if (pathname.startsWith('/rapportages')) return { title: 'Inzichten', helper: 'Analyseer trends en deel conclusies' }
  if (pathname.startsWith('/instellingen') || pathname.startsWith('/feeds') || pathname.startsWith('/import') || pathname.startsWith('/integraties') || pathname.startsWith('/beheer') || pathname.startsWith('/onboarding')) return { title: 'Beheer', helper: 'Data, feeds, koppelingen en organisatie', action: { href: '/import/bulk', label: 'Bulk import' } }
  return { title: 'Overzicht', helper: 'Zie direct wat vandaag belangrijk is', action: { href: '/acties', label: 'Bekijk acties' } }
}

export function AppShell({ children, user }: { children: React.ReactNode; user?: ShellUser | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const isAuthenticationRoute = pathname === '/' || pathname === '/login' || pathname === '/reset-password'
  const context = routeMeta(pathname)
  const warm = (href: string) => router.prefetch(href)

  if (isAuthenticationRoute) return <><InteractionFeedback key={pathname} /><div className="min-h-screen bg-[var(--background)]">{children}</div></>

  return <>
    <InteractionFeedback key={pathname} />
    <RoutePrefetcher />
    <EanAutoDiscovery />
    <div className="ps-workspace-shell flex h-dvh overflow-hidden">
      <div className="hidden lg:block lg:w-[232px] lg:flex-none"><Sidebar user={user} /></div>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 border-b border-[#e7ebf0] bg-white/95 backdrop-blur-xl">
          <div className="flex min-h-[76px] items-center justify-between px-5 py-4 sm:px-7 lg:px-8">
            <div className="min-w-0">
              <h1 className="text-[20px] font-semibold leading-[1.2] tracking-[-0.03em] text-[#172033]">{context.title}</h1>
              <p className="mt-1 text-[13px] leading-5 text-[#7a8699]">{context.helper}</p>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-2 sm:gap-2.5">
              <GlobalMarketSwitcher />
              <Link href="/acties" prefetch={false} onMouseEnter={() => warm('/acties')} onFocus={() => warm('/acties')} className="group relative flex h-10 w-10 items-center justify-center rounded-[11px] border border-[#e3e8ee] bg-white text-[#667085] shadow-[0_1px_2px_rgba(16,24,40,.03)] transition-all hover:border-[#d5dce5] hover:bg-[#f8fafc] hover:text-[#172033]" title="Acties" aria-label="Acties">
                <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"/><path d="M10 20h4"/></svg>
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#c95c61] ring-2 ring-white" />
              </Link>
              {context.action ? <Link href={context.action.href} prefetch={false} onMouseEnter={() => warm(context.action!.href)} onFocus={() => warm(context.action!.href)} className="app-header-primary-action hidden min-h-10 items-center gap-2 rounded-[11px] px-4 text-[13px] font-semibold tracking-[-0.01em] transition-all md:inline-flex"><span>{context.action.label}</span><svg className="h-3.5 w-3.5 opacity-75" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg></Link> : null}
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-[#eef1f4] bg-white px-3 py-2 lg:hidden" aria-label="Hoofdnavigatie">
            {mobileItems.map(([href,label]) => { const active = pathname === href || pathname.startsWith(`${href}/`); return <Link key={href} href={href} prefetch={false} aria-current={active ? 'page' : undefined} onMouseEnter={() => warm(href)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${active ? 'bg-[#172033] text-white' : 'text-[#667085] hover:bg-[#f4f6f8] hover:text-[#172033]'}`}>{label}</Link> })}
          </nav>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f5f7fa]">
          <main className="min-w-0 px-4 pb-9 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">
            <div className="w-full max-w-[1540px]">{children}</div>
          </main>
        </div>
      </section>
    </div>
  </>
}
