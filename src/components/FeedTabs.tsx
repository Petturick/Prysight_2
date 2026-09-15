'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/feeds', label: 'Bronnen', step: '1' },
  { href: '/feeds/map', label: 'Mapping', step: '2' },
  { href: '/feeds/data', label: 'Data', step: '3' },
  { href: '/feeds/publicaties', label: 'Publiceren', step: '4' },
  { href: '/feeds/diagnose', label: 'Controle', step: '5' },
]

export function FeedTabs() {
  const pathname = usePathname()
  return (
    <div className="bg-white px-4 pb-4 sm:px-5">
      <div className="ps-flow-tabs flex min-w-max items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = pathname === tab.href
          return <Link key={tab.href} href={tab.href} className={`ps-flow-tab flex shrink-0 items-center gap-2 px-3 ${active ? 'ps-flow-tab-active' : ''}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${active ? 'bg-[#367fda] text-white' : 'bg-[#e7edf3] text-[#77879a]'}`}>{tab.step}</span>
            {tab.label}
          </Link>
        })}
      </div>
    </div>
  )
}
