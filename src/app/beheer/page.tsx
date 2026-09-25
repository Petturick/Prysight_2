export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAdmin } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

type ManageLink = {
  href: string
  label: string
  count?: number
}

function Group({ title, links }: { title: string; links: ManageLink[] }) {
  return (
    <section className="ps-panel overflow-hidden">
      <div className="border-b border-[#edf0f3] px-5 py-3.5">
        <h2 className="text-[13px] font-semibold text-[#25364b]">{title}</h2>
      </div>
      <div className="divide-y divide-[#eef1f4]">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="flex min-h-[54px] items-center justify-between gap-4 px-5 py-3 text-[13px] font-medium text-[#344054] transition-colors hover:bg-[#f8fafc]">
            <span>{link.label}</span>
            <span className="flex items-center gap-3">
              {typeof link.count === 'number' ? <span className="text-[11px] font-medium tabular-nums text-[#98a2b3]">{link.count}</span> : null}
              <svg className="h-4 w-4 text-[#98a2b3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 18 6-6-6-6" /></svg>
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default async function BeheerPage() {
  const actor = await requireAdmin()
  const result = await safeDatabaseQuery(() => Promise.all([
    prisma.companyCountry.count({ where: { companyId: actor.companyId, isActive: true } }),
    prisma.competitor.count({ where: { companyId: actor.companyId } }),
    prisma.webshop.count({ where: { companyId: actor.companyId } }),
    prisma.productGroup.count({ where: { companyId: actor.companyId } }),
    prisma.companyMembership.count({ where: { companyId: actor.companyId, isActive: true } }),
    prisma.auditLog.count({ where: { companyId: actor.companyId } }),
    prisma.feedSource.count({ where: { companyId: actor.companyId } }),
    prisma.product.count({ where: { companyId: actor.companyId, isActive: true } }),
  ]), [0, 0, 0, 0, 0, 0, 0, 0])
  const [countries, competitors, webshops, productGroups, users, logs, feeds, products] = result.data

  return (
    <div className="space-y-4">
      {!result.available && <DatabaseNotice />}

      <div className="grid gap-3 lg:grid-cols-3">
        <Group title="Data" links={[
          { href: '/instellingen/feedbeheer', label: 'Feeds', count: feeds },
          { href: '/beheer/synchronisatie', label: 'Synchronisatie' },
          { href: '/producten', label: 'Productdata', count: products },
          { href: '/import', label: 'Importeren' },
        ]} />

        <Group title="Markt" links={[
          { href: '/instellingen/markten', label: 'Markten', count: countries },
          { href: '/beheer/concurrenten', label: 'Concurrenten', count: competitors },
          { href: '/beheer/webshops', label: 'Webshops', count: webshops },
          { href: '/beheer/productgroepen', label: 'Productgroepen', count: productGroups },
        ]} />

        <Group title="Organisatie" links={[
          { href: '/instellingen/gebruikers', label: 'Gebruikers en toegang', count: users },
          { href: '/beheer/auditlog', label: 'Auditlog', count: logs },
          ...(actor.role === 'SUPER_ADMIN' ? [{ href: '/beheer/landen', label: 'Platformlanden' }] : []),
        ]} />
      </div>
    </div>
  )
}
