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

const items: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', hint: 'Overzicht' },
  { href: '/producten', label: 'Producten', icon: 'products', hint: 'Prijzen vergelijken' },
  { href: '/concurrenten', label: 'Markt', icon: 'competitors', aliases: ['/monitoring', '/productmatches'], hint: 'Concurrenten' },
  { href: '/acties', label: 'Acties', icon: 'alerts', aliases: ['/waarschuwingen', '/prijsstrategie', '/prijsregels', '/prijswijzigingen'], hint: 'Wat vraagt aandacht' },
  { href: '/rapportages', label: 'Rapportages', icon: 'reports', hint: 'Analyse en export' },
  { href: '/instellingen', label: 'Instellingen', icon: 'settings', aliases: ['/feeds', '/import', '/integraties', '/beheer'], hint: 'Data en koppelingen' },
]

function NavIcon({ name }: { name: IconName }) {
  const common = 'h-[19px] w-[19px]'
  if (name === 'dashboard') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 13h6V4H4v9ZM14 20h6V11h-6v9ZM4 20h6v-3H4v3ZM14 7h6V4h-6v3Z" /></svg>
  if (name === 'products') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" /></svg>
  if (name === 'competitors') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 19c.6-3.1 2.5-5 5.5-5s5 1.9 5.5 5M14.5 15c2.7.1 4.4 1.5 5 4" /></svg>
  if (name === 'alerts') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z" /><path d="M10 20h4" /></svg>
  if (name === 'reports') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3h9l3 3v15H6z" /><path d="M9 11h6M9 15h6M9 7h3" /></svg>
  return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.3 3a8 8 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.5-1a8 8 0 0 0 1.7 1l.3 3h5l.3-3a8 8 0 0 0 1.7-1l2.5 1 2-3.5-2.1-1.5c.1-.3.1-.7.1-1Z" /></svg>
}

function activeFor(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)) ?? false)
}

export function Sidebar({ user }: { user?: SidebarUser | null }) {
  const pathname = usePathname()
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'

  return <aside className="flex h-dvh w-[260px] flex-col overflow-hidden bg-[#263247] text-white shadow-[10px_0_34px_rgba(22,34,52,.14)]">
    <div className="shrink-0 px-5 pb-4 pt-5">
      <div className="rounded-[15px] bg-white/[.055] px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
        <Image src="/prysight-logo-sidebar.svg" width={188} height={47} alt="Prysight" priority className="h-auto w-[166px]" />
        <p className="mt-1.5 text-[9px] font-semibold tracking-[.045em] text-[#9eadc0]">PRICING INTELLIGENCE</p>
      </div>
    </div>

    <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <p className="px-3 pb-2 pt-1 text-[9px] font-bold uppercase tracking-[.11em] text-[#8798ad]">Werkruimte</p>
      <div className="space-y-1.5">
        {items.map(item => {
          const active = activeFor(pathname,item)
          return <Link key={item.href} href={item.href} prefetch={false} className={cn('group flex min-h-[54px] items-center gap-3 rounded-[12px] px-3.5 transition', active ? 'bg-[#2f7edb] text-white shadow-[0_9px_20px_rgba(12,31,54,.28)]' : 'text-[#d4deea] hover:bg-white/[.075] hover:text-white')}>
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition', active ? 'bg-white/[.14] text-white' : 'bg-white/[.05] text-[#aebccc] group-hover:bg-white/[.08] group-hover:text-white')}><NavIcon name={item.icon}/></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-bold">{item.label}</span>
              <span className={cn('mt-0.5 block truncate text-[9px] font-semibold', active ? 'text-[#d9eaff]' : 'text-[#8999ad]')}>{item.hint}</span>
            </span>
            {active ? <span className="h-2 w-2 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,.1)]" /> : null}
          </Link>
        })}
      </div>

      <div className="mt-5 rounded-[14px] bg-[#1f2a3c] p-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.055)]">
        <p className="text-[9px] font-bold uppercase tracking-[.09em] text-[#8192a7]">Snel starten</p>
        <p className="mt-1 text-[11px] font-bold text-white">Nieuwe data toevoegen</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/producten/nieuw" prefetch={false} className="rounded-[9px] bg-[#2f7edb] px-2 py-2.5 text-center text-[9px] font-bold text-white transition hover:bg-[#3a88e3]">Product</Link>
          <Link href="/import" prefetch={false} className="rounded-[9px] bg-[#2eaa63] px-2 py-2.5 text-center text-[9px] font-bold text-white transition hover:bg-[#37b56c]">Import</Link>
        </div>
      </div>
    </nav>

    {user ? <div className="shrink-0 px-3 pb-4 pt-2">
      <div className="rounded-[15px] bg-[#1f2a3c] p-3.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
        <Link href="/onboarding" prefetch={false} className="mb-3 flex items-center justify-between rounded-[9px] bg-white/[.055] px-3 py-2.5 text-[9px] font-bold text-[#d8e2ed] transition hover:bg-white/[.09]"><span>Configuratie controleren</span><span aria-hidden="true">→</span></Link>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#2f7edb] text-[11px] font-extrabold text-white shadow-[0_6px_14px_rgba(10,27,47,.25)]">{initials}</div>
          <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-white">{user.name||user.email}</p><p className="mt-0.5 truncate text-[9px] font-semibold text-[#8fa0b4]">{roleLabel(user.role)}</p></div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/instellingen/profiel" prefetch={false} className="rounded-[9px] bg-white/[.055] px-2 py-2 text-center text-[9px] font-bold text-[#cad5e2] transition hover:bg-white/[.09]">Profiel</Link>
          <form action={logoutAction}><button type="submit" className="w-full rounded-[9px] bg-white/[.055] px-2 py-2 text-[9px] font-bold text-[#cad5e2] transition hover:bg-white/[.09]">Uitloggen</button></form>
        </div>
      </div>
    </div> : null}
  </aside>
}
