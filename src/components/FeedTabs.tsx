'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/feeds', label: 'Feedbeheer' },
  { href: '/feeds/map', label: 'Feed map' },
  { href: '/feeds/data', label: 'Feeddata opbouwen' },
  { href: '/feeds/publicaties', label: 'Feedpublicaties' },
  { href: '/feeds/diagnose', label: 'Feeddiagnose' },
]

export function FeedTabs() {
  const pathname = usePathname()
  return (
    <div className="overflow-x-auto border-b border-[var(--border)] bg-white px-4 sm:px-5">
      <div className="flex min-w-max items-center gap-1 py-2">
        <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#9aa3b5]">Feeds</span>
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return <Link key={tab.href} href={tab.href} className={`rounded-lg px-3 py-2 text-[11px] font-medium transition-colors ${active ? 'bg-[var(--blue-soft)] text-[var(--blue)]' : 'text-[#596174] hover:bg-[#f7f8fb] hover:text-[#202536]'}`}>{tab.label}</Link>
        })}
      </div>
    </div>
  )
}
