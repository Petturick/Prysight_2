'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EanAutoDiscovery } from '@/components/EanAutoDiscovery'
import { InteractionFeedback } from '@/components/InteractionFeedback'
import { RoutePrefetcher } from '@/components/RoutePrefetcher'
import { Sidebar } from '@/components/Sidebar'
import type { AppRole } from '@/lib/roles'

type ShellUser = { name?: string | null; email?: string | null; role?: AppRole | null }

const mobileItems = [
  ['/dashboard','Dashboard'],
  ['/producten','Producten'],
  ['/concurrenten','Markt'],
  ['/acties','Acties'],
  ['/rapportages','Rapportages'],
  ['/instellingen','Instellingen'],
] as const

export function AppShell({ children, user }: { children: React.ReactNode; user?: ShellUser | null }) {
  const pathname = usePathname()
  const isAuthenticationRoute = pathname === '/' || pathname === '/login' || pathname === '/reset-password'
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'

  if (isAuthenticationRoute) return <><InteractionFeedback key={pathname} /><main className="min-h-screen bg-[var(--background)]">{children}</main></>

  return <>
    <InteractionFeedback key={pathname} />
    <RoutePrefetcher />
    <EanAutoDiscovery />
    <div className="flex min-h-dvh bg-[var(--background)]">
      <div className="hidden lg:block lg:w-[260px] lg:flex-none">
        <div className="fixed inset-y-0 z-30 w-[260px]"><Sidebar user={user} /></div>
      </div>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 px-3 pt-3 sm:px-5 lg:px-6">
          <div className="mx-auto flex min-h-[66px] max-w-[1580px] items-center justify-between gap-5 rounded-[16px] bg-white px-4 shadow-[0_8px_24px_rgba(31,48,70,.08)] sm:px-5">
            <form action="/producten" className="relative w-full max-w-[560px]">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#738399]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
              <input name="q" aria-label="Zoeken" placeholder="Zoek product, EAN, GTIN of concurrent..." className="h-[44px] w-full rounded-[12px] border-0 bg-[#f1f5f9] pl-10 pr-4 text-[12px] font-semibold text-[#26394f] shadow-[inset_0_0_0_1px_#e0e7ef] placeholder:font-medium placeholder:text-[#8b99aa] focus:bg-white focus:ring-0" />
            </form>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/import" prefetch={false} className="hidden min-h-[39px] items-center gap-2 rounded-[10px] bg-[#eef5fd] px-3.5 text-[10px] font-bold text-[#2d70b9] transition hover:bg-[#e2effd] md:inline-flex">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
                Importeren
              </Link>
              <Link href="/onboarding" prefetch={false} className="hidden min-h-[39px] items-center rounded-[10px] bg-[#f5f7fa] px-3.5 text-[10px] font-bold text-[#586a80] transition hover:bg-[#edf1f5] xl:inline-flex">Setup</Link>
              <Link href="/acties" prefetch={false} className="relative flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#f4f6f9] text-[#63758b] transition hover:bg-[#eaf0f6]" title="Acties">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"/><path d="M10 20h4"/></svg>
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#df5c68] ring-2 ring-[#f4f6f9]" />
              </Link>
              {user ? <div className="flex items-center gap-2.5 rounded-[12px] bg-[#f5f7fa] py-1.5 pl-1.5 pr-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#2f7edb] text-[11px] font-extrabold text-white shadow-[0_5px_12px_rgba(47,126,219,.22)]">{initials}</div>
                <div className="hidden md:block"><p className="max-w-[145px] truncate text-[11px] font-bold text-[#26384e]">{user.name || user.email}</p><p className="mt-0.5 text-[9px] font-semibold text-[#8b98a8]">Prysight workspace</p></div>
              </div> : null}
            </div>
          </div>
          <div className="mx-auto mt-2 flex max-w-[1580px] gap-1.5 overflow-x-auto rounded-[13px] bg-white p-2 shadow-[0_6px_18px_rgba(31,48,70,.06)] lg:hidden">
            {mobileItems.map(([href,label]) => <Link key={href} href={href} prefetch={false} className={`shrink-0 rounded-[9px] px-3 py-2.5 text-[10px] font-bold ${pathname === href || pathname.startsWith(`${href}/`) ? 'bg-[#2f7edb] text-white shadow-[0_5px_12px_rgba(47,126,219,.2)]' : 'bg-[#f3f6f9] text-[#607187]'}`}>{label}</Link>)}
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6 2xl:px-10">
          <div className="mx-auto w-full max-w-[1530px]">{children}</div>
        </main>
      </div>
    </div>
  </>
}
