'use client'

import { usePathname } from 'next/navigation'
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
      <div className="flex min-h-screen">
        <div className="hidden lg:block lg:w-[272px] lg:flex-none">
          <div className="fixed inset-y-0 w-[272px]">
            <Sidebar user={user} />
          </div>
        </div>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="border-b border-[var(--border)] bg-white px-5 py-4 lg:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#98a2b3]">Engels Group</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <h1 className="text-lg font-semibold text-[#171b28]">Pricing intelligence</h1>
              {user?.name ? <span className="text-xs font-medium text-[#667085]">{user.name}</span> : null}
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
