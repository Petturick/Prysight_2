export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAdmin } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function BeheerPage() {
  const actor = await requireAdmin()
  const result = await safeDatabaseQuery(() => Promise.all([
    prisma.companyCountry.count({ where: { companyId: actor.companyId, isActive: true } }),
    prisma.competitor.count({ where: { companyId: actor.companyId } }),
    prisma.webshop.count({ where: { companyId: actor.companyId } }),
    prisma.productGroup.count({ where: { companyId: actor.companyId } }),
    prisma.companyMembership.count({ where: { companyId: actor.companyId, isActive: true } }),
    prisma.auditLog.count({ where: { companyId: actor.companyId } }),
  ]), [0, 0, 0, 0, 0, 0])
  const [countries, competitors, webshops, productGroups, users, logs] = result.data

  const stats = [
    { label: 'Actieve markten', value: countries },
    { label: 'Concurrenten', value: competitors },
    { label: 'Webshops', value: webshops },
    { label: 'Productgroepen', value: productGroups },
    { label: 'Gebruikers', value: users },
    { label: 'Auditregels', value: logs },
  ]
  const links = [
    { href: '/instellingen/markten', label: 'Markten', description: 'Kies in welke landen deze organisatie actief monitort.' },
    { href: '/beheer/concurrenten', label: 'Concurrenten', description: 'Marktspelers en controlefrequenties beheren.' },
    { href: '/beheer/webshops', label: 'Webshops', description: 'Verkoopkanalen en koppelingen met concurrenten.' },
    { href: '/beheer/productgroepen', label: 'Productgroepen', description: 'Categorieën en scope voor signalering.' },
    { href: '/instellingen/gebruikers', label: 'Gebruikers en toegang', description: 'Gebruikers, rollen en toegang binnen de organisatie.' },
    { href: '/beheer/auditlog', label: 'Auditlog', description: 'Wijzigingshistorie van de actieve organisatie.' },
    ...(actor.role === 'SUPER_ADMIN' ? [{ href: '/beheer/landen', label: 'Platformlanden', description: 'Globale BTW en valutareferenties voor het hele platform.' }] : []),
  ]

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <div>
        <h1 className="text-3xl font-semibold">Beheer</h1>
        <p className="mt-2 text-sm text-slate-600">Beheer alleen wat bij de actieve organisatie hoort. Platforminstellingen worden uitsluitend aan super admins getoond.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{stat.label}</p>
            <p className="mt-3 text-3xl font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
            <h2 className="text-lg font-semibold">{link.label}</h2>
            <p className="mt-2 text-sm text-slate-600">{link.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
