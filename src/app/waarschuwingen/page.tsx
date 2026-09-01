export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { AlertSeverity } from '@/generated/prisma/client'
import { markAlertReadAction } from '@/app/actions/alertActions'
import { AlertBadge } from '@/components/AlertBadge'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAuthenticatedUser } from '@/lib/authz'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function WaarschuwingenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireAuthenticatedUser()
  const companyId = user.companyId
  const params = await searchParams
  const severity = readParam(params.severity) as AlertSeverity | undefined
  const type = readParam(params.type)
  const productId = readParam(params.product)

  const result = await safeDatabaseQuery(async () => {
    const [alerts, products, activeOffers, checks] = await Promise.all([
      prisma.alert.findMany({
        where: {
          companyId,
          severity: severity || undefined,
          type: type || undefined,
          productId: productId || undefined,
        },
        include: { product: true, competitorOffer: { include: { competitor: true } } },
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.product.count({ where: { companyId, isActive: true } }),
      prisma.competitorOffer.count({ where: { companyId, isActive: true } }),
      prisma.priceCheck.count({ where: { companyId } }),
    ])
    return { alerts, products, activeOffers, checks }
  }, { alerts: [], products: 0, activeOffers: 0, checks: 0 })

  const { alerts, products, activeOffers, checks } = result.data
  const monitoringHasStarted = products > 0 && activeOffers > 0 && checks > 0

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Analyse en actie</p>
            <h1 className="mt-2 text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">Waarschuwingen</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Signaleringen ontstaan uit echte prijscontroles, prijsverschillen, voorraadwijzigingen en afwijkende marktontwikkelingen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/monitoring" className="secondary-action">Monitoringstatus</Link>
            <Link href="/producten" className="primary-action">Producten bekijken</Link>
          </div>
        </div>
        <div className="grid border-t border-[var(--border)] sm:grid-cols-3">
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Producten</p><p className="mt-1 text-[22px] font-semibold text-[#202536]">{formatNumber(products)}</p></div>
          <div className="border-y border-[var(--border)] px-5 py-4 sm:border-x sm:border-y-0 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Concurrent URLs</p><p className="mt-1 text-[22px] font-semibold text-[#202536]">{formatNumber(activeOffers)}</p></div>
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Prijscontroles</p><p className="mt-1 text-[22px] font-semibold text-[#202536]">{formatNumber(checks)}</p></div>
        </div>
      </section>

      {!monitoringHasStarted ? <section className="strong-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[14px] font-semibold text-[#252a37]">Monitoring is nog niet volledig gestart</p>
            <p className="mt-2 max-w-3xl text-[11px] leading-6 text-[#697386]">Een lege waarschuwingentabel is in deze situatie geen fout. Prysight heeft eerst producten, een gekoppelde concurrent URL en minimaal één uitgevoerde prijscontrole nodig. Daarna worden prijsbewegingen en prijsverschillen automatisch als waarschuwing vastgelegd.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {products === 0 ? <Link href="/import" className="primary-action">Producten importeren</Link> : null}
            {products > 0 && activeOffers === 0 ? <Link href="/concurrenten" className="primary-action">Concurrent URL toevoegen</Link> : null}
            {products > 0 ? <Link href="/monitoring" className="secondary-action">Bekijk ontbrekende stappen</Link> : null}
          </div>
        </div>
      </section> : null}

      <form className="strong-panel p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <input name="type" defaultValue={type} placeholder="Type waarschuwing" className="toolbar-control w-full" />
          <select name="severity" defaultValue={severity} className="toolbar-control w-full">
            <option value="">Alle niveaus</option>
            {Object.values(AlertSeverity).map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
          <input name="product" defaultValue={productId} placeholder="Product ID" className="toolbar-control w-full" />
          <button className="primary-action">Filteren</button>
        </div>
      </form>

      <DataTable
        emptyText={monitoringHasStarted ? 'Geen waarschuwingen voor deze selectie.' : 'Nog geen waarschuwingen. Rond eerst de monitoringflow af.'}
        columns={[
          { key: 'niveau', header: 'Niveau' },
          { key: 'titel', header: 'Titel' },
          { key: 'bericht', header: 'Bericht' },
          { key: 'product', header: 'Product' },
          { key: 'concurrent', header: 'Concurrent' },
          { key: 'datum', header: 'Datum' },
          { key: 'status', header: 'Status' },
        ]}
        rows={alerts.map((alert) => ({
          niveau: <AlertBadge severity={alert.severity} />,
          titel: alert.title,
          bericht: alert.message,
          product: alert.product?.name ?? '—',
          concurrent: alert.competitorOffer?.competitor.name ?? '—',
          datum: formatDate(alert.createdAt),
          status: alert.isRead ? 'Gelezen' : <form action={markAlertReadAction.bind(null, alert.id)}><button className="secondary-action min-h-0 px-3 py-2">Markeer als gelezen</button></form>,
        }))}
      />
    </div>
  )
}
