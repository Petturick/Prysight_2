export const dynamic = 'force-dynamic'
import { AlertSeverity } from '@/generated/prisma/client'
import { markAlertReadAction } from '@/app/actions/alertActions'
import { AlertBadge } from '@/components/AlertBadge'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { formatDate } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function WaarschuwingenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const severity = readParam(params.severity) as AlertSeverity | undefined
  const type = readParam(params.type)
  const productId = readParam(params.product)

  const result = await safeDatabaseQuery(() => prisma.alert.findMany({
    where: {
      severity: severity || undefined,
      type: type || undefined,
      productId: productId || undefined,
    },
    include: { product: true, competitorOffer: { include: { competitor: true } } },
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
  }), [])
  const alerts = result.data

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <div>
        <h1 className="text-3xl font-semibold">Waarschuwingen</h1>
        <p className="mt-2 text-sm text-slate-600">Signaleringen op prijsverschillen, mislukte controles en afwijkende marktontwikkelingen.</p>
      </div>
      <form className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
        <input name="type" defaultValue={type} placeholder="Type waarschuwing" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <select name="severity" defaultValue={severity} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="">Alle niveaus</option>
          {Object.values(AlertSeverity).map((level) => <option key={level} value={level}>{level}</option>)}
        </select>
        <input name="product" defaultValue={productId} placeholder="Product ID" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" />
        <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white">Filteren</button>
      </form>
      <DataTable
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
          status: alert.isRead ? 'Gelezen' : <form action={markAlertReadAction.bind(null, alert.id)}><button className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white">Markeer als gelezen</button></form>,
        }))}
      />
    </div>
  )
}
