'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { logoutAction } from '@/app/actions/authActions'
import { cn } from '@/lib/format'
import { roleLabel, type AppRole } from '@/lib/roles'

type IconName = 'dashboard' | 'products' | 'competitors' | 'alerts' | 'reports' | 'settings'
type SidebarUser = { name?: string | null; email?: string | null; role?: AppRole | null }
type NavItem = { href: string; label: string; icon: IconName; aliases?: string[]; hint: string }

const dailyItems: NavItem[] = [
  { href: '/dashboard', label: 'Overzicht', icon: 'dashboard', hint: 'Wat speelt er nu' },
  { href: '/producten', label: 'Producten', icon: 'products', hint: 'Prijzen vergelijken' },
  { href: '/concurrenten', label: 'Markt', icon: 'competitors', aliases: ['/monitoring', '/productmatches'], hint: 'Concurrenten en matches' },
  { href: '/acties', label: 'Acties', icon: 'alerts', aliases: ['/waarschuwingen', '/prijsstrategie', '/prijsregels', '/prijswijzigingen', '/prijsautomatisering'], hint: 'Wat moet je doen' },
]

const supportItems: NavItem[] = [
  { href: '/rapportages', label: 'Inzichten', icon: 'reports', hint: 'Analyse en export' },
  { href: '/instellingen', label: 'Beheer', icon: 'settings', aliases: ['/feeds', '/import', '/integraties', '/beheer', '/onboarding'], hint: 'Data en koppelingen' },
]

function NavIcon({ name }: { name: IconName }) {
  const common = 'h-4 w-4'
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

function NavGroup({ label, items, pathname, warm }: { label: string; items: NavItem[]; pathname: string; warm: (href: string) => void }) {
  return <div>
    <p className="px-3 pb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#6f8ba1]">{label}</p>
    <div className="space-y-0.5">
      {items.map(item => {
        const active = activeFor(pathname,item)
        return <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          onMouseEnter={() => warm(item.href)}
          onFocus={() => warm(item.href)}
          className={cn(
            'group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors duration-150',
            active
              ? 'bg-blue-600 text-white shadow-[inset_0_0_0_1px_rgba(147,197,253,0.16)]'
              : 'text-[#b8c8d5] hover:bg-white/[0.055] hover:text-white',
          )}
        >
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors', active ? 'bg-white/10' : 'bg-white/[0.035] group-hover:bg-white/[0.06]')}><NavIcon name={item.icon}/></span>
          <span className="truncate">{item.label}</span>
        </Link>
      })}
    </div>
  </div>
}

export function Sidebar({ user }: { user?: SidebarUser | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'
  const warm = (href: string) => router.prefetch(href)

  return <aside className="flex h-dvh w-60 flex-col overflow-hidden border-r border-[#123858] bg-[#061a2f] text-white shadow-[12px_0_36px_rgba(5,24,44,.08)]">
    <div className="shrink-0 border-b border-white/10 px-4 py-5">
      <Image src="/prysight-logo-sidebar.svg" width={188} height={47} alt="Prysight" priority className="h-auto w-[148px]" />
      <p className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-[#8aa5bd]">Pricing intelligence</p>
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
      <NavGroup label="Dagelijks" items={dailyItems} pathname={pathname} warm={warm} />
      <div className="my-3 h-px bg-white/10" />
      <NavGroup label="Organiseren" items={supportItems} pathname={pathname} warm={warm} />
    </nav>

    {user ? <div className="shrink-0 border-t border-white/10 p-3">
      <div className="flex items-center gap-2.5 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.045]">
        <Link href="/instellingen/profiel" prefetch={false} onMouseEnter={() => warm('/instellingen/profiel')} onFocus={() => warm('/instellingen/profiel')} className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#183d58] text-xs font-semibold text-white ring-1 ring-white/10">{initials}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{user.name || user.email}</p>
            <p className="mt-0.5 truncate text-[10px] font-medium text-[#8aa5bd]">{roleLabel(user.role)}</p>
          </div>
        </Link>
      </div>
      <div className="mt-1 flex gap-1">
        <Link href="/onboarding" prefetch={false} onMouseEnter={() => warm('/onboarding')} className="flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-medium text-[#7190a3] transition-colors hover:bg-white/[0.045] hover:text-white">Setup</Link>
        <Link href="/instellingen/profiel" prefetch={false} onMouseEnter={() => warm('/instellingen/profiel')} className="flex-1 rounded-lg px-2 py-1.5 text-center text-xs font-medium text-[#7190a3] transition-colors hover:bg-white/[0.045] hover:text-white">Profiel</Link>
        <form action={logoutAction} className="flex-1"><button type="submit" className="w-full rounded-lg px-2 py-1.5 text-xs font-medium text-[#7190a3] transition-colors hover:bg-white/[0.045] hover:text-white">Uit</button></form>
      </div>
    </div> : null}
  </aside>
}
