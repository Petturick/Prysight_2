'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EanAutoDiscovery } from '@/components/EanAutoDiscovery'
import { InteractionFeedback } from '@/components/InteractionFeedback'
import { RoutePrefetcher } from '@/components/RoutePrefetcher'
import { Sidebar } from '@/components/Sidebar'
import type { AppRole } from '@/lib/roles'

type ShellUser = {
  name?: string | null
  email?: string | null
  role?: AppRole | null
}

const routeTitles: Array<{ prefix: string; title: string; section: string }> = [
  { prefix: '/dashboard', title: 'Prijsdashboard', section: 'Overzicht' },
  { prefix: '/producten', title: 'Producten', section: 'Prijsbeheer' },
  { prefix: '/productmatches', title: 'Productmatches', section: 'Producten' },
  { prefix: '/concurrenten', title: 'Concurrenten', section: 'Prijsbeheer' },
  { prefix: '/prijsstrategie', title: 'Prijsstrategie', section: 'Prijsbeheer' },
  { prefix: '/waarschuwingen', title: 'Aandacht nodig', section: 'Prijsbeheer' },
  { prefix: '/monitoring', title: 'Monitoring', section: 'Data & monitoring' },
  { prefix: '/feeds', title: 'Databronnen', section: 'Data & monitoring' },
  { prefix: '/import', title: 'Importeren', section: 'Databronnen' },
  { prefix: '/rapportages', title: 'Rapportages', section: 'Analyse' },
  { prefix: '/integraties', title: 'Integraties', section: 'Beheer' },
  { prefix: '/instellingen', title: 'Instellingen', section: 'Beheer' },
]

function currentRoute(pathname: string) {
  return routeTitles.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)) ?? { title: 'Prysight', section: 'Pricing intelligence' }
}

export function AppShell({ children, user }: { children: React.ReactNode; user?: ShellUser | null }) {
  const pathname = usePathname()
  const isAuthenticationRoute = pathname === '/' || pathname === '/login' || pathname === '/reset-password'
  const route = currentRoute(pathname)

  if (isAuthenticationRoute) {
    return <><InteractionFeedback key={pathname} /><main className="min-h-screen bg-[var(--background)]">{children}</main></>
  }

  return (
    <>
      <InteractionFeedback key={pathname} />
      <RoutePrefetcher />
      <EanAutoDiscovery />
      <div className="flex min-h-dvh bg-[#eef1f6]">
        <div className="hidden lg:block lg:w-[256px] lg:flex-none">
          <div className="fixed inset-y-0 z-30 w-[256px]">
            <Sidebar user={user} />
          </div>
        </div>

        <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b-2 border-[#dce1ea] bg-white/96 shadow-[0_5px_18px_rgba(31,42,68,.06)] backdrop-blur">
            <div className="flex min-h-[64px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 2xl:px-10">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.12em] text-[#7b879c]"><span>Prysight</span><span className="text-[#b0b8c7]">/</span><span>{route.section}</span></div>
                <p className="mt-0.5 truncate text-[17px] font-black tracking-[-.025em] text-[#172033]">{route.title}</p>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <Link href="/producten" className="secondary-action min-h-0 px-3 py-2 text-[10px]">Product zoeken</Link>
                <Link href="/import" className="secondary-action min-h-0 px-3 py-2 text-[10px]">Importeren</Link>
                <Link href="/waarschuwingen" className="primary-action min-h-0 px-3 py-2 text-[10px]">Aandacht nodig</Link>
              </div>
            </div>
            <div className="flex gap-1 overflow-x-auto border-t border-[#edf0f4] px-3 py-2 lg:hidden">
              {[['/dashboard','Dashboard'],['/producten','Producten'],['/concurrenten','Concurrenten'],['/monitoring','Monitoring'],['/feeds','Data']].map(([href,label]) => <Link key={href} href={href} className={`shrink-0 rounded-[9px] border px-3 py-2 text-[10px] font-black ${pathname === href || pathname.startsWith(`${href}/`) ? 'border-[#5b2be8] bg-[#5b2be8] text-white' : 'border-[#d6dce6] bg-white text-[#536078]'}`}>{label}</Link>)}
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-7 lg:py-6 2xl:px-9">
            <div className="mx-auto w-full max-w-[1540px]">{children}</div>
          </main>
        </div>
      </div>
    </>
  )
}
