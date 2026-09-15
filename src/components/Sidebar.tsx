'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
  const common = 'h-[19px] w-[19px]'
  if (name === 'dashboard') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 13h6V4H4v9ZM14 20h6V11h-6v9ZM4 20h6v-3H4v3ZM14 7h6V4h-6v3Z" /></svg>
  if (name === 'products') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" /></svg>
  if (name === 'competitors') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 19c.6-3.1 2.5-5 5.5-5s5 1.9 5.5 5M14.5 15c2.7.1 4.4 1.5 5 4" /></svg>
  if (name === 'alerts') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z" /><path d="M10 20h4" /></svg>
  if (name === 'reports') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 19V9M10 19V5M15 19v-7M20 19V3" /><path d="M3 21h19" /></svg>
  return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.3 3a8 8 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.5-1a8 8 0 0 0 1.7 1l.3 3h5l.3-3a8 8 0 0 0 1.7-1l2.5 1 2-3.5-2.1-1.5c.1-.3.1-.7.1-1Z" /></svg>
}

function activeFor(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)) ?? false)
}

function NavGroup({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string }) {
  return <div>
    <p className="px-3 pb-2 text-[9px] font-bold uppercase tracking-[.09em] text-[#77899f]">{label}</p>
    <div className="space-y-1">
      {items.map(item => {
        const active = activeFor(pathname,item)
        return <Link key={item.href} href={item.href} prefetch={false} className={cn('group flex min-h-[52px] items-center gap-3 rounded-[11px] px-3 transition', active ? 'bg-white text-[#20324a] shadow-[0_7px_20px_rgba(8,21,39,.16)]' : 'text-[#d4deea] hover:bg-white/[.07] hover:text-white')}>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] transition', active ? 'bg-[#edf5ff] text-[#2f76c8]' : 'bg-white/[.055] text-[#aebccc] group-hover:bg-white/[.09] group-hover:text-white')}><NavIcon name={item.icon}/></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold">{item.label}</span>
            <span className={cn('mt-0.5 block truncate text-[9px] font-semibold', active ? 'text-[#74859a]' : 'text-[#8496ab]')}>{item.hint}</span>
          </span>
        </Link>
      })}
    </div>
  </div>
}

export function Sidebar({ user }: { user?: SidebarUser | null }) {
  const pathname = usePathname()
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'

  return <aside className="flex h-dvh w-[248px] flex-col overflow-hidden bg-[#202d40] text-white shadow-[8px_0_28px_rgba(22,34,52,.12)]">
    <div className="shrink-0 px-5 pb-5 pt-6">
      <Image src="/prysight-logo-sidebar.svg" width={188} height={47} alt="Prysight" priority className="h-auto w-[160px]" />
      <p className="mt-2 text-[9px] font-semibold tracking-[.04em] text-[#8495aa]">Pricing intelligence</p>
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      <NavGroup label="Dagelijks" items={dailyItems} pathname={pathname} />
      <div className="my-5 h-px bg-white/[.07]" />
      <NavGroup label="Organiseren" items={supportItems} pathname={pathname} />
    </nav>

    {user ? <div className="shrink-0 p-3">
      <div className="rounded-[13px] bg-[#192538] p-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#367fda] text-[11px] font-extrabold text-white">{initials}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-white">{user.name||user.email}</p><p className="mt-0.5 truncate text-[9px] font-semibold text-[#8799ae]">{roleLabel(user.role)}</p></div>
        </div>
        <div className="mt-3 flex gap-2">
          <Link href="/onboarding" prefetch={false} className="flex-1 rounded-[8px] bg-white/[.06] px-2 py-2 text-center text-[9px] font-bold text-[#cad5e2] transition hover:bg-white/[.1]">Setup</Link>
          <Link href="/instellingen/profiel" prefetch={false} className="flex-1 rounded-[8px] bg-white/[.06] px-2 py-2 text-center text-[9px] font-bold text-[#cad5e2] transition hover:bg-white/[.1]">Profiel</Link>
          <form action={logoutAction} className="flex-1"><button type="submit" className="w-full rounded-[8px] bg-white/[.06] px-2 py-2 text-[9px] font-bold text-[#cad5e2] transition hover:bg-white/[.1]">Uit</button></form>
        </div>
      </div>
    </div> : null}
  </aside>
}
