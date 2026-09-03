'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logoutAction } from '@/app/actions/authActions'
import { cn } from '@/lib/format'
import { roleLabel, type AppRole } from '@/lib/roles'

type IconName = 'dashboard' | 'products' | 'competitors' | 'alerts' | 'strategy' | 'reports' | 'feeds' | 'monitoring' | 'integrations' | 'settings'
type SidebarUser = { name?: string | null; email?: string | null; role?: AppRole | null }
type NavItem = { href: string; label: string; icon: IconName; aliases?: string[] }

const groups: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' }] },
  { label: 'Prijsbeheer', items: [
    { href: '/producten', label: 'Producten', icon: 'products', aliases: ['/productmatches'] },
    { href: '/concurrenten', label: 'Concurrenten', icon: 'competitors' },
    { href: '/prijsstrategie', label: 'Prijsstrategie', icon: 'strategy' },
    { href: '/waarschuwingen', label: 'Aandacht nodig', icon: 'alerts' },
  ] },
  { label: 'Data & monitoring', items: [
    { href: '/monitoring', label: 'Monitoring', icon: 'monitoring' },
    { href: '/feeds', label: 'Databronnen', icon: 'feeds', aliases: ['/import'] },
  ] },
  { label: 'Analyse & rapportage', items: [
    { href: '/rapportages', label: 'Rapportages', icon: 'reports' },
  ] },
  { label: 'Instellingen', items: [
    { href: '/integraties', label: 'Integraties', icon: 'integrations' },
    { href: '/instellingen', label: 'Instellingen', icon: 'settings' },
  ] },
]

function NavIcon({ name }: { name: IconName }) {
  const common = 'h-[18px] w-[18px]'
  if (name === 'dashboard') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 13h6V4H4v9ZM14 20h6V11h-6v9ZM4 20h6v-3H4v3ZM14 7h6V4h-6v3Z" /></svg>
  if (name === 'products') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" /></svg>
  if (name === 'competitors') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3.5 19c.6-3.1 2.5-5 5.5-5s5 1.9 5.5 5M14.5 15c2.7.1 4.4 1.5 5 4" /></svg>
  if (name === 'alerts') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z" /><path d="M10 20h4" /></svg>
  if (name === 'strategy') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 18V6M4 18h16" /><path d="m7 15 4-4 3 2 5-6" /></svg>
  if (name === 'reports') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M6 3h9l3 3v15H6z" /><path d="M9 11h6M9 15h6M9 7h3" /></svg>
  if (name === 'feeds') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M5 18a1 1 0 1 0 0 .01M4 11a9 9 0 0 1 9 9M4 5a15 15 0 0 1 15 15" /><path d="M14 6h5v5" /></svg>
  if (name === 'monitoring') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M3 12h4l2-5 4 10 2-5h6" /><path d="M4 4h16v16H4z" /></svg>
  if (name === 'integrations') return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M8 7V3M16 7V3M7 7h10v4a5 5 0 0 1-5 5v5" /><path d="M9 21h6" /></svg>
  return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.3 3a8 8 0 0 0-1.7 1L5 6 3 9.5 5.1 11a7 7 0 0 0 0 2L3 14.5 5 18l2.5-1a8 8 0 0 0 1.7 1l.3 3h5l.3-3a8 8 0 0 0 1.7-1l2.5 1 2-3.5-2.1-1.5c.1-.3.1-.7.1-1Z" /></svg>
}

function activeFor(pathname: string, item: NavItem) {
  return pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)) ?? false)
}

export function Sidebar({ user }: { user?: SidebarUser | null }) {
  const pathname = usePathname()
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'

  return <aside className="flex h-dvh w-[245px] flex-col overflow-hidden bg-[#101d30] text-white shadow-[8px_0_28px_rgba(15,29,48,.08)]">
    <div className="shrink-0 px-6 pb-5 pt-5">
      <Image src="/prysight-logo-sidebar.svg" width={188} height={47} alt="Prysight" priority className="h-auto w-[162px]" />
    </div>
    <nav className="min-h-0 flex-1 px-3 pb-3">
      {groups.map((group, index) => <div key={group.label ?? 'dashboard'} className={index === 0 ? '' : 'mt-6'}>
        {group.label ? <p className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-[.08em] text-[#93a2b7]">{group.label}</p> : null}
        <div className="space-y-1">{group.items.map((item) => { const active = activeFor(pathname, item); return <Link key={item.href} href={item.href} prefetch className={cn('flex min-h-[44px] items-center gap-3 rounded-[7px] px-4 text-[13px] font-semibold transition', active ? 'bg-[#294b79] text-white shadow-[0_4px_12px_rgba(3,15,31,.18)]' : 'text-[#d6dfeb] hover:bg-white/[.06] hover:text-white')}><span className={active ? 'text-[#d9e8ff]' : 'text-[#a9b7c9]'}><NavIcon name={item.icon} /></span><span className="min-w-0 flex-1 truncate">{item.label}</span>{item.href === '/waarschuwingen' ? <span className="rounded-full bg-[#ec5b5d] px-2 py-0.5 text-[9px] font-bold text-white">!</span> : null}</Link>})}</div>
      </div>)}
    </nav>
    {user ? <div className="shrink-0 border-t border-white/10 px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#4d86e8] text-[12px] font-bold text-white">{initials}</div>
        <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-white">{user.name || user.email}</p><p className="mt-0.5 truncate text-[10px] text-[#9fb0c6]">{roleLabel(user.role)}</p></div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2"><Link href="/instellingen/profiel" className="rounded-[7px] border border-white/10 px-2 py-2 text-center text-[10px] font-semibold text-[#cbd7e6] hover:bg-white/[.06]">Profiel</Link><form action={logoutAction}><button type="submit" className="w-full rounded-[7px] border border-white/10 px-2 py-2 text-[10px] font-semibold text-[#cbd7e6] hover:bg-white/[.06]">Uitloggen</button></form></div>
    </div> : null}
  </aside>
}
