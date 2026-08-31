export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { deriveCompetitorMetrics, getCompetitorsOverview } from '@/lib/dashboard'
import { formatDate, formatNumber } from '@/lib/format'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function ConcurrentenPage() {
  const result = await safeDatabaseQuery(() => getCompetitorsOverview(), [])
  const competitors = result.data

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <div>
        <h1 className="text-3xl font-semibold">Concurrenten</h1>
        <p className="mt-2 text-sm text-slate-600">Per markt inzicht in gekoppelde producten, prijsdekking en kwaliteit van de prijscontroles.</p>
      </div>
      <DataTable
        columns={[
          { key: 'naam', header: 'Naam' },
          { key: 'markt', header: 'Markt' },
          { key: 'website', header: 'Website' },
          { key: 'producten', header: 'Gekoppelde producten' },
          { key: 'prijzen', header: 'Geldige prijzen' },
          { key: 'positie', header: 'Gem. positie vs Engels' },
          { key: 'laatsteControle', header: 'Laatste controle' },
          { key: 'fouten', header: '% mislukte controles' },
        ]}
        rows={competitors.map((competitor) => {
          const metrics = deriveCompetitorMetrics(competitor)
          return {
            naam: <Link href={`/concurrenten/${competitor.id}`} className="font-medium text-sky-700">{competitor.name}</Link>,
            markt: competitor.country.name,
            website: competitor.website,
            producten: formatNumber(metrics.linkedProducts),
            prijzen: formatNumber(metrics.validPrices),
            positie: metrics.averagePositionPct === null ? '—' : `${formatNumber(metrics.averagePositionPct, 1)}% lager dan Engels`,
            laatsteControle: formatDate(metrics.lastChecked),
            fouten: metrics.failedRate === null ? '—' : `${formatNumber(metrics.failedRate, 1)}%`,
          }
        })}
      />
    </div>
  )
}
