export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAdmin } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

const links = [
  { href: '/beheer/landen', label: 'Landen beheer', description: 'BTW, valuta en activatie per land.' },
  { href: '/beheer/concurrenten', label: 'Concurrenten beheer', description: 'Marktspelers en controlefrequenties beheren.' },
  { href: '/beheer/webshops', label: 'Webshops beheer', description: 'Verkoopkanalen en koppelingen met concurrenten.' },
  { href: '/beheer/productgroepen', label: 'Productgroepen beheer', description: 'Categorieën en scope voor signalering.' },
  { href: '/beheer/gebruikers', label: 'Gebruikers beheer', description: 'Rollen en toegangsbeheer.' },
  { href: '/beheer/auditlog', label: 'Auditlog', description: 'Volledige wijzigingshistorie en compliance.' },
]

export default async function BeheerPage() {
  await requireAdmin()
  const result = await safeDatabaseQuery(() => Promise.all([
    prisma.country.count(),
    prisma.competitor.count(),
    prisma.webshop.count(),
    prisma.productGroup.count(),
    prisma.user.count(),
    prisma.auditLog.count(),
  ]), [0, 0, 0, 0, 0, 0])
  const [countries, competitors, webshops, productGroups, users, logs] = result.data

  const stats = [
    { label: 'Landen', value: countries },
    { label: 'Concurrenten', value: competitors },
    { label: 'Webshops', value: webshops },
    { label: 'Productgroepen', value: productGroups },
    { label: 'Gebruikers', value: users },
    { label: 'Auditregels', value: logs },
  ]

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <div>
        <h1 className="text-3xl font-semibold">Beheer</h1>
        <p className="mt-2 text-sm text-slate-600">Beheer kerngegevens, rollen en configuraties voor prijsmonitoring.</p>
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
