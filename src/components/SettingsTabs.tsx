'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/format'
import type { AppRole } from '@/lib/roles'
import type { Permission } from '@/lib/authz'

const tabs: Array<{ href: string; label: string; permission?: Permission; superAdminOnly?: boolean }> = [
  { href: '/instellingen/organisaties', label: 'Organisaties', superAdminOnly: true },
  { href: '/instellingen/team', label: 'Team', permission: 'users.manage' },
  { href: '/instellingen/gebruikers', label: 'Gebruikers', permission: 'users.manage' },
  { href: '/instellingen/rollen', label: 'Rollen en rechten', permission: 'settings.manage' },
  { href: '/instellingen/integraties', label: 'Integraties', permission: 'settings.manage' },
  { href: '/instellingen/licentie', label: 'Licentie en facturatie', permission: 'billing.manage' },
  { href: '/instellingen/systeem', label: 'Systeeminstellingen', permission: 'settings.manage' },
  { href: '/instellingen/profiel', label: 'Mijn profiel' },
]

export function SettingsTabs({ role, permissions = [] }: { role?: AppRole | null; permissions?: Permission[] }) {
  const pathname = usePathname()
  const isSuperAdmin = role === 'SUPER_ADMIN'
  const visible = tabs.filter((tab) => {
    if (tab.superAdminOnly && !isSuperAdmin) return false
    if (tab.permission && !isSuperAdmin && !permissions.includes(tab.permission)) return false
    return true
  })
  return <div className="overflow-x-auto rounded-[14px] border-2 border-[var(--border)] bg-white p-2 shadow-sm"><div className="flex min-w-max items-center gap-1">{visible.map((tab) => {
    const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
    return <Link key={tab.href} href={tab.href} prefetch className={cn('rounded-[9px] px-3 py-2 text-[12px] font-bold text-[#667085] transition hover:bg-[#f3f5f9] hover:text-[#344054]', active && 'bg-[var(--blue-soft)] text-[var(--blue)]')}>{tab.label}</Link>
  })}</div></div>
}
