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

const primaryGroups: Array<{ label: string; items: NavItem[] }> = [
  { label: 'Overzicht', items: [{ href: '/dashboard', label: 'Prijsdashboard', icon: 'dashboard' }] },
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
]

const utilityItems: NavItem[] = [
  { href: '/rapportages', label: 'Rapportages', icon: 'reports' },
  { href: '/integraties', label: 'Integraties', icon: 'integrations' },
  { href: '/instellingen', label: 'Instellingen', icon: 'settings' },
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

function itemIsActive(pathname: string, item: NavItem) {
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true
  return item.aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)) ?? false
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = itemIsActive(pathname, item)
  return <Link href={item.href} prefetch className={cn('focus-ring group flex min-h-[40px] items-center gap-3 rounded-[8px] border border-transparent px-3 py-2 text-[12px] font-semibold transition-all duration-150', 'text-[#b8c4d1] hover:bg-white/6 hover:text-white', active && 'border-[#2f5274] bg-[#1b3650] text-white shadow-[inset_3px_0_0_#3f8fc8]')}><span className={cn('text-[#7f91a3] transition-colors group-hover:text-[#b7c6d4]', active && 'text-[#68a9d6]')}><NavIcon name={item.icon} /></span><span className="min-w-0 flex-1 truncate">{item.label}</span>{active ? <span className="h-1.5 w-1.5 rounded-full bg-[#68a9d6]" /> : null}</Link>
}

export function Sidebar({ user }: { user?: SidebarUser | null }) {
  const pathname = usePathname()
  const initials = user?.name?.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'U'

  return <aside className="flex h-dvh w-full max-w-[256px] flex-col overflow-hidden border-r border-[#26384c] bg-[#101c2c] text-white shadow-[8px_0_24px_rgba(16,28,44,.08)]">
    <div className="shrink-0 border-b border-white/8 px-4 pb-4 pt-4">
      <Image src="/prysight-logo-sidebar.svg" width={188} height={47} alt="Prysight" priority className="h-auto w-[160px]" />
      <div className="mt-3 flex items-center justify-between rounded-[8px] border border-white/8 bg-white/[.035] px-3 py-2"><div><p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#708297]">Workspace</p><p className="mt-0.5 text-[11px] font-semibold text-[#e7edf3]">Pricing intelligence</p></div><span className="h-2 w-2 rounded-full bg-[#47a77d]" /></div>
    </div>

    <nav className="min-h-0 flex-1 px-3 py-3">
      {primaryGroups.map((group, groupIndex) => <div key={group.label} className={groupIndex === 0 ? '' : 'mt-4'}><p className="px-3 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#64778b]">{group.label}</p><div className="space-y-1">{group.items.map((item) => <NavRow key={item.href} item={item} pathname={pathname} />)}</div></div>)}
    </nav>

    <div className="shrink-0 border-t border-white/8 px-3 pb-3 pt-2.5">
      <div className="grid grid-cols-3 gap-1">{utilityItems.map((item) => { const active = itemIsActive(pathname, item); return <Link key={item.href} href={item.href} title={item.label} className={cn('flex min-h-[50px] flex-col items-center justify-center gap-1 rounded-[8px] border border-transparent text-[9px] font-semibold text-[#7f91a3] transition hover:bg-white/6 hover:text-[#d8e1e9]', active && 'border-white/10 bg-white/7 text-white')}><NavIcon name={item.icon} /><span>{item.label}</span></Link>})}</div>
      {user ? <div className="mt-2.5 rounded-[10px] border border-white/8 bg-white/[.035] p-2.5"><div className="flex items-center gap-2.5"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[#1b3650] text-[11px] font-bold text-[#dce8f0]">{initials}</div><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-white">{user.name || user.email}</p><p className="mt-0.5 truncate text-[9px] font-medium text-[#8091a3]">{roleLabel(user.role)}</p></div><Link href="/instellingen/profiel" className="rounded-[7px] border border-white/8 px-2 py-1.5 text-[9px] font-semibold text-[#aebdca] hover:bg-white/6">Profiel</Link></div><form action={logoutAction} className="mt-2"><button type="submit" className="w-full rounded-[7px] px-2 py-1.5 text-[9px] font-semibold text-[#718398] transition hover:bg-white/6 hover:text-white">Uitloggen</button></form></div> : null}
    </div>
  </aside>
}
