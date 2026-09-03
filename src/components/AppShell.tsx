'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EanAutoDiscovery } from '@/components/EanAutoDiscovery'
import { InteractionFeedback } from '@/components/InteractionFeedback'
import { RoutePrefetcher } from '@/components/RoutePrefetcher'
import { Sidebar } from '@/components/Sidebar'
import type { AppRole } from '@/lib/roles'

type ShellUser = { name?: string | null; email?: string | null; role?: AppRole | null }

export function AppShell({ children, user }: { children: React.ReactNode; user?: ShellUser | null }) {
  const pathname = usePathname()
  const isAuthenticationRoute = pathname === '/' || pathname === '/login' || pathname === '/reset-password'
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'

  if (isAuthenticationRoute) return <><InteractionFeedback key={pathname} /><main className="min-h-screen bg-[var(--background)]">{children}</main></>

  return <>
    <InteractionFeedback key={pathname} />
    <RoutePrefetcher />
    <EanAutoDiscovery />
    <div className="flex min-h-dvh bg-[#f7f9fc]">
      <div className="hidden lg:block lg:w-[245px] lg:flex-none"><div className="fixed inset-y-0 z-30 w-[245px]"><Sidebar user={user} /></div></div>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-[#edf0f5] bg-white/98 backdrop-blur">
          <div className="flex min-h-[68px] items-center justify-between gap-5 px-4 sm:px-6 lg:px-8 2xl:px-9">
            <form action="/producten" className="relative w-full max-w-[490px]">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7d8da6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input name="q" aria-label="Zoeken" placeholder="Zoek product, EAN, merk of concurrent..." className="h-[42px] w-full rounded-[8px] border border-[#e0e6ef] bg-white pl-10 pr-4 text-[12px] text-[#1b2a41] shadow-[0_2px_7px_rgba(23,39,65,.04)] placeholder:text-[#8b99ae] focus:border-[#90b8f7] focus:ring-0" />
            </form>
            <div className="flex items-center gap-4">
              <Link href="/waarschuwingen" className="relative flex h-9 w-9 items-center justify-center rounded-full text-[#6f7f95] hover:bg-[#f2f5f9]" title="Meldingen"><svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"/><path d="M10 20h4"/></svg><span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#ef6769] ring-2 ring-white" /></Link>
              {user ? <div className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#4f86e8] text-[11px] font-bold text-white">{initials}</div><div className="hidden md:block"><p className="max-w-[140px] truncate text-[11px] font-semibold text-[#17233a]">{user.name || user.email}</p><p className="text-[9px] text-[#8a97aa]">Prysight</p></div></div> : null}
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto border-t border-[#f0f2f6] px-3 py-2 lg:hidden">{[['/dashboard','Dashboard'],['/producten','Producten'],['/concurrenten','Concurrenten'],['/monitoring','Monitoring'],['/feeds','Data']].map(([href,label]) => <Link key={href} href={href} className={`shrink-0 rounded-[7px] border px-3 py-2 text-[10px] font-semibold ${pathname === href || pathname.startsWith(`${href}/`) ? 'border-[#4f86e8] bg-[#4f86e8] text-white' : 'border-[#dce3ec] bg-white text-[#5f6e84]'}`}>{label}</Link>)}</div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-7 2xl:px-9"><div className="mx-auto w-full max-w-[1530px]">{children}</div></main>
      </div>
    </div>
  </>
}
