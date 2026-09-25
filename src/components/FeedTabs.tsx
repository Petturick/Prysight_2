'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/feeds', label: 'Bronnen' },
  { href: '/feeds/map', label: 'Mapping' },
  { href: '/feeds/data', label: 'Data' },
  { href: '/feeds/publicaties', label: 'Publiceren' },
  { href: '/feeds/diagnose', label: 'Controle' },
]

export function FeedTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="Feedbeheer" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-[9px] px-3 py-2 text-[12px] font-medium transition-colors ${active ? 'bg-[#172033] text-white' : 'text-[#667085] hover:bg-[#f2f4f7] hover:text-[#172033]'}`}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
