'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  const isAuthenticationRoute = pathname === '/' || pathname === '/login' || pathname === '/reset-password'
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
  const context = routeMeta(pathname)

  if (isAuthenticationRoute) return <><InteractionFeedback key={pathname} /><main className="min-h-screen bg-[var(--background)]">{children}</main></>

  return <>
    <InteractionFeedback key={pathname} />
    <RoutePrefetcher />
    <EanAutoDiscovery />
    <div className="ps-workspace-shell flex min-h-dvh">
      <div className="hidden lg:block lg:w-[248px] lg:flex-none">
        <div className="fixed inset-y-0 z-30 w-[248px]"><Sidebar user={user} /></div>
      </div>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 px-3 pt-3 sm:px-5 lg:px-6">
          <div className="ps-workspace-topbar mx-auto flex min-h-[68px] max-w-[1540px] items-center gap-4 rounded-[17px] px-4 sm:px-5">
            <div className="min-w-[145px] shrink-0 lg:min-w-[190px]">
              <p className="ps-workspace-context-title text-[13px] sm:text-[14px]">{context.title}</p>
              <p className="ps-workspace-context-copy mt-0.5 hidden text-[10px] xl:block">{context.helper}</p>
            </div>

            <form action="/producten" className="relative min-w-0 flex-1 md:max-w-[610px]">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#7c8a9c]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input name="q" aria-label="Zoeken" placeholder="Zoek product, EAN of concurrent" className="ps-workspace-search h-[43px] w-full rounded-[11px] pl-10 pr-4 text-[12px] font-semibold text-[#26394f] placeholder:font-medium placeholder:text-[#93a0af]" />
            </form>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {context.action ? <Link href={context.action.href} prefetch={false} className="hidden min-h-[40px] items-center rounded-[10px] bg-[#367fda] px-3.5 text-[11px] font-bold text-white shadow-[0_5px_12px_rgba(54,127,218,.18)] transition hover:bg-[#2d74c9] md:inline-flex">{context.action.label}</Link> : null}
              <Link href="/acties" prefetch={false} className="relative flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#f3f6f9] text-[#5f7187] transition hover:bg-[#eaf0f6]" title="Acties">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"/><path d="M10 20h4"/></svg>
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#df5c68] ring-2 ring-[#f3f6f9]" />
              </Link>
              {user ? <Link href="/instellingen/profiel" prefetch={false} className="flex items-center gap-2 rounded-[11px] bg-[#f4f6f9] py-1.5 pl-1.5 pr-2.5 transition hover:bg-[#edf1f5]">
                <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#263247] text-[11px] font-extrabold text-white">{initials}</div>
                <div className="hidden 2xl:block"><p className="max-w-[135px] truncate text-[11px] font-bold text-[#26384e]">{user.name || user.email}</p><p className="mt-0.5 text-[9px] font-semibold text-[#8b98a8]">Profiel</p></div>
              </Link> : null}
            </div>
          </div>

          <nav className="mx-auto mt-2 flex max-w-[1540px] gap-1 overflow-x-auto rounded-[12px] bg-white p-1.5 shadow-[0_4px_14px_rgba(31,48,70,.045)] lg:hidden" aria-label="Hoofdnavigatie">
            {mobileItems.map(([href,label]) => <Link key={href} href={href} prefetch={false} className={`shrink-0 rounded-[8px] px-3 py-2.5 text-[10px] font-bold ${pathname === href || pathname.startsWith(`${href}/`) ? 'bg-[#263247] text-white' : 'text-[#607187]'}`}>{label}</Link>)}
          </nav>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6 2xl:px-10">
          <div className="mx-auto w-full max-w-[1460px]">{children}</div>
        </main>
      </div>
    </div>
  </>
}
