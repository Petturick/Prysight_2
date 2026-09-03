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
    <div className="overflow-x-auto border-b border-[#e7ebf1] bg-white px-4 sm:px-5">
      <div className="flex min-w-max items-center gap-1 py-2.5">
        <span className="mr-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-[#94a0b1]">Feeds</span>
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return <Link key={tab.href} href={tab.href} className={`rounded-[7px] px-3 py-2 text-[10px] font-semibold transition-colors ${active ? 'bg-[#edf4ff] text-[#3d73d4]' : 'text-[#66758a] hover:bg-[#f7f9fc] hover:text-[#24344d]'}`}>{tab.label}</Link>
        })}
      </div>
    </div>
  )
}
