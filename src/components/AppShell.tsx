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
type RouteMeta = { title: string; action?: { href: string; label: string } }

const mobileItems = [
  ['/dashboard','Overzicht'],
  ['/producten','Producten'],
  ['/concurrenten','Concurrenten'],
  ['/acties','Acties'],
  ['/rapportages','Inzichten'],
  ['/instellingen','Beheer'],
] as const

function routeMeta(pathname: string): RouteMeta {
  if (pathname === '/producten') return { title: 'Producten', action: { href: '/producten/nieuw', label: 'Product toevoegen' } }
  if (pathname.startsWith('/producten/')) return { title: 'Product' }
  if (pathname.startsWith('/concurrenten')) return { title: 'Concurrenten' }
  if (pathname.startsWith('/monitoring')) return { title: 'Monitoring' }
  if (pathname.startsWith('/productmatches')) return { title: 'Matches' }
  if (pathname.startsWith('/waarschuwingen')) return { title: 'Waarschuwingen' }
  if (pathname.startsWith('/prijsstrategie')) return { title: 'Prijsadvies' }
  if (pathname.startsWith('/prijsregels')) return { title: 'Prijsregels' }
  if (pathname.startsWith('/prijswijzigingen')) return { title: 'Prijswijzigingen' }
  if (pathname.startsWith('/prijsautomatisering')) return { title: 'Automatisering' }
  if (pathname.startsWith('/prijsuitleg')) return { title: 'Prijsuitleg' }
  if (pathname.startsWith('/acties')) return { title: 'Acties' }
  if (pathname.startsWith('/rapportages')) return { title: 'Rapportages' }
  if (pathname.startsWith('/feeds')) return { title: 'Feeds' }
  if (pathname.startsWith('/import/bulk')) return { title: 'Bulk import' }
  if (pathname.startsWith('/import')) return { title: 'Importeren' }
  if (pathname.startsWith('/integraties')) return { title: 'Integraties' }
  if (pathname.startsWith('/beheer')) return { title: 'Beheer' }
  if (pathname.startsWith('/instellingen/feedbeheer')) return { title: 'Feedbeheer' }
  if (pathname.startsWith('/instellingen/data')) return { title: 'Databeheer' }
  if (pathname.startsWith('/instellingen')) return { title: 'Instellingen' }
  if (pathname.startsWith('/onboarding')) return { title: 'Setup' }
  return { title: 'Overzicht' }
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
      <div className="hidden lg:block lg:w-[220px] lg:flex-none"><Sidebar user={user} /></div>
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-20 border-b border-[#e8ecf1] bg-white/95 backdrop-blur-xl">
          <div className="flex min-h-[62px] items-center justify-between px-5 py-3 sm:px-7 lg:px-8">
            <h1 className="min-w-0 truncate text-[18px] font-semibold leading-none tracking-[-0.025em] text-[#172033]">{context.title}</h1>
            <div className="ml-3 flex shrink-0 items-center gap-2">
              <GlobalMarketSwitcher />
              <Link href="/acties" prefetch={false} onMouseEnter={() => warm('/acties')} onFocus={() => warm('/acties')} className="group relative flex h-9 w-9 items-center justify-center rounded-[10px] text-[#667085] transition-colors hover:bg-[#f4f6f8] hover:text-[#172033]" title="Acties" aria-label="Acties">
                <svg className="h-[17px] w-[17px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"/><path d="M10 20h4"/></svg>
              </Link>
              {context.action ? <Link href={context.action.href} prefetch={false} onMouseEnter={() => warm(context.action!.href)} onFocus={() => warm(context.action!.href)} className="app-header-primary-action hidden min-h-9 items-center rounded-[10px] px-3.5 text-[12px] font-semibold md:inline-flex">{context.action.label}</Link> : null}
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto border-t border-[#f0f2f5] bg-white px-3 py-1.5 lg:hidden" aria-label="Hoofdnavigatie">
            {mobileItems.map(([href,label]) => {
              const active = pathname === href || pathname.startsWith(`${href}/`)
              return <Link key={href} href={href} prefetch={false} aria-current={active ? 'page' : undefined} onMouseEnter={() => warm(href)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${active ? 'bg-[#172033] text-white' : 'text-[#667085] hover:bg-[#f4f6f8] hover:text-[#172033]'}`}>{label}</Link>
            })}
          </nav>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f6f7f9]">
          <main className="min-w-0 px-4 pb-10 pt-5 sm:px-6 lg:px-8 lg:pt-6">
            <div className="w-full max-w-[1500px]">{children}</div>
          </main>
        </div>
      </section>
    </div>
  </>
}
