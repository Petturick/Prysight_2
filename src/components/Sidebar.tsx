'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { logoutAction } from '@/app/actions/authActions'
import { cn } from '@/lib/format'
import { roleLabel, type AppRole } from '@/lib/roles'

type IconName = 'dashboard' | 'products' | 'competitors' | 'alerts' | 'reports' | 'settings'
type SidebarUser = { name?: string | null; email?: string | null; role?: AppRole | null }
type NavItem = { href: string; label: string; icon: IconName; aliases?: string[] }

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Overzicht', icon: 'dashboard' },
  { href: '/producten', label: 'Producten', icon: 'products' },
  { href: '/concurrenten', label: 'Concurrenten', icon: 'competitors', aliases: ['/monitoring', '/productmatches'] },
  { href: '/acties', label: 'Acties', icon: 'alerts', aliases: ['/waarschuwingen', '/prijsstrategie', '/prijsregels', '/prijswijzigingen', '/prijsautomatisering'] },
  { href: '/rapportages', label: 'Inzichten', icon: 'reports' },
  { href: '/instellingen', label: 'Beheer', icon: 'settings', aliases: ['/feeds', '/import', '/integraties', '/beheer', '/onboarding'] },
]

function NavIcon({ name }: { name: IconName }) {
  const common = 'h-[17px] w-[17px]'
  if (name === 'dashboard') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 13h6V4H4v9ZM14 20h6V11h-6v9ZM4 20h6v-3H4v3ZM14 7h6V4h-6v3Z" /></svg>
  if (name === 'products') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" /></svg>
  if (name === 'competitors') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 19c.6-3.1 2.5-5 5.5-5s5 1.9 5.5 5M14.5 15c2.7.1 4.4 1.5 5 4" /></svg>
  if (name === 'alerts') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z" /><path d="M10 20h4" /></svg>
  if (name === 'reports') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 19V9M10 19V5M15 19v-7M20 19V3" /><path d="M3 21h19" /></svg>
  return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.3 3a8 8 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.5-1a8 8 0 0 0 1.7 1l.3 3h5l.3-3a8 8 0 0 0 1.7-1l2.5 1 2-3.5-2.1-1.5c.1-.3.1-.7.1-1Z" /></svg>
}

function activeFor(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)) ?? false)
}

export function Sidebar({ user }: { user?: SidebarUser | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
  const warm = (href: string) => router.prefetch(href)

  return <aside className="flex h-dvh w-[232px] flex-col overflow-hidden border-r border-white/[0.055] bg-[#0b1728] text-white shadow-[12px_0_32px_rgba(7,18,33,.07)]">
    <div className="px-4 pb-4 pt-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.06] ring-1 ring-white/[0.07]">
          <Image src="/prysight-mark.svg" width={30} height={22} alt="" priority className="h-auto w-[29px]" />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight tracking-[-0.025em] text-white">PrySight</p>
          <p className="mt-1 text-[9px] font-medium uppercase tracking-[0.17em] text-[#8192a8]">Pricing intelligence</p>
        </div>
      </div>
    </div>

    <div className="mx-4 h-px bg-white/[0.06]" />

    <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 py-4">
      {navItems.map((item) => {
        const active = activeFor(pathname, item)
        return <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          onMouseEnter={() => warm(item.href)}
          onFocus={() => warm(item.href)}
          className={cn(
            'group relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
            active
              ? 'bg-white/[0.075] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.035)]'
              : 'text-[#a6b4c5] hover:bg-white/[0.045] hover:text-white',
          )}
        >
          {active ? <span className="absolute left-0 top-2.5 h-7 w-[3px] rounded-r-full bg-[#5b8ff6]" /> : null}
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] transition-colors', active ? 'bg-[#2f6fec] text-white' : 'bg-white/[0.035] text-[#98a8bb] group-hover:bg-white/[0.06] group-hover:text-white')}><NavIcon name={item.icon}/></span>
          <span className="truncate">{item.label}</span>
        </Link>
      })}
    </nav>

    {user ? <div className="border-t border-white/[0.06] p-3">
      <div className="rounded-[12px] bg-white/[0.035] p-2.5 ring-1 ring-white/[0.045]">
        <div className="flex items-center gap-2.5">
          <Link href="/instellingen/profiel" prefetch={false} onMouseEnter={() => warm('/instellingen/profiel')} onFocus={() => warm('/instellingen/profiel')} className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#22354d] text-[11px] font-semibold text-white ring-1 ring-white/[0.08]">{initials}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-semibold text-white">{user.name || user.email}</p>
              <span className="mt-1 inline-flex rounded-full bg-white/[0.055] px-2 py-0.5 text-[9px] font-medium leading-none text-[#a7b6c7] ring-1 ring-white/[0.055]">{roleLabel(user.role)}</span>
            </div>
          </Link>
          <form action={logoutAction}><button type="submit" className="rounded-lg p-1.5 text-[#778aa1] transition-colors hover:bg-white/[0.06] hover:text-white" title="Uitloggen" aria-label="Uitloggen"><svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></svg></button></form>
        </div>
        <div className="mt-2 flex gap-1">
          <Link href="/onboarding" prefetch={false} onMouseEnter={() => warm('/onboarding')} className="flex-1 rounded-lg px-2 py-1.5 text-left text-[10px] font-medium text-[#8093a8] transition-colors hover:bg-white/[0.045] hover:text-white">Setup</Link>
          <Link href="/instellingen/profiel" prefetch={false} onMouseEnter={() => warm('/instellingen/profiel')} className="flex-1 rounded-lg px-2 py-1.5 text-left text-[10px] font-medium text-[#8093a8] transition-colors hover:bg-white/[0.045] hover:text-white">Profiel</Link>
        </div>
      </div>
    </div> : null}
  </aside>
}
