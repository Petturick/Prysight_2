'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/format'
import type { AppRole } from '@/lib/roles'
import type { Permission } from '@/lib/authz'

const tabs: Array<{ href: string; label: string; permission?: Permission; superAdminOnly?: boolean }> = [
  { href: '/instellingen', label: 'Beheeroverzicht' },
  { href: '/instellingen/organisaties', label: 'Organisaties', superAdminOnly: true },
  { href: '/instellingen/markten', label: 'Markten', permission: 'settings.manage' },
  { href: '/instellingen/feedbeheer', label: 'Feedbeheer', permission: 'feeds.read' },
  
  { href: '/instellingen/gebruikers', label: 'Gebruikers en rechten', permission: 'users.manage' },
  { href: '/instellingen/rollen', label: 'Rollen en rechten', superAdminOnly: true },
  { href: '/integraties', label: 'Integraties', permission: 'settings.manage' },
  { href: '/instellingen/licentie', label: 'Licentie en facturatie', permission: 'billing.manage' },
  { href: '/instellingen/systeem', label: 'Systeem', permission: 'settings.manage' },
  { href: '/instellingen/data', label: 'Gegevens verwijderen', superAdminOnly: true },
  
]

export function SettingsTabs({ role, permissions = [] }: { role?: AppRole | null; permissions?: Permission[] }) {
  const pathname = usePathname()
  const isSuperAdmin = role === 'SUPER_ADMIN'

  const visible = tabs.filter((tab) => {
    if (tab.superAdminOnly && !isSuperAdmin) return false
    if (tab.permission && !isSuperAdmin && !permissions.includes(tab.permission)) return false
    return true
  })

  return (
    <nav aria-label="Beheermenu" className="rounded-[10px] border border-[#e2e7ee] bg-white p-2 shadow-[0_2px_8px_rgba(31,49,77,.03)]">
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1">
        {visible.map((tab) => {
          const active = pathname === tab.href || (tab.href !== '/instellingen' && pathname.startsWith(`${tab.href}/`))
          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              className={cn(
                'rounded-[7px] px-3 py-2.5 text-[11px] font-semibold text-[#6b788b] transition hover:bg-[#f7f9fc] hover:text-[#33445d]',
                active && 'bg-[#edf4ff] text-[#3d73d4]',
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
