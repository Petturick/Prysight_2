'use client'

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

export function AppShell({ children, user }: { children: React.ReactNode; user?: ShellUser | null }) {
  const pathname = usePathname()
  const isAuthenticationRoute = pathname === '/' || pathname === '/login' || pathname === '/reset-password'

  if (isAuthenticationRoute) {
    return <><InteractionFeedback key={pathname} /><main className="min-h-screen bg-[var(--background)]">{children}</main></>
  }

  return (
    <>
      <InteractionFeedback key={pathname} />
      <RoutePrefetcher />
      <EanAutoDiscovery />
      <div className="flex min-h-screen bg-[radial-gradient(circle_at_80%_0%,rgba(103,88,238,0.07),transparent_32%),linear-gradient(180deg,#fafbfe_0%,#f2f4f9_100%)]">
        <div className="hidden lg:block lg:w-[272px] lg:flex-none">
          <div className="fixed inset-y-0 z-20 w-[272px] shadow-[12px_0_34px_rgba(17,24,39,0.06)]">
            <Sidebar user={user} />
          </div>
        </div>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="border-b border-[#e3e5ef] bg-white/95 px-5 py-4 shadow-[0_4px_16px_rgba(31,42,68,0.05)] backdrop-blur lg:hidden">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#5a56d9]">Prysight</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-[#17233b]">Pricing intelligence</h1>
              {user?.name ? <span className="rounded-full bg-[#eef1ff] px-3 py-1 text-xs font-semibold text-[#5753d9]">{user.name}</span> : null}
            </div>
          </header>
          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 2xl:px-10">
            <div className="mx-auto w-full max-w-[1680px]">{children}</div>
          </main>
        </div>
      </div>
    </>
  )
}
