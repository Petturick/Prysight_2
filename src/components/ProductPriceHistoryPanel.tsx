import { unstable_cache } from 'next/cache'
import { Prisma } from '@/generated/prisma/client'
import { PriceChart, type PriceChartSeries } from '@/components/PriceChart'
import { prisma } from '@/lib/prisma'

type OwnDailyRow = { day: Date; ownPrice: number | null }
type CompetitorDailyRow = {
  day: Date
  competitorId: string
  competitorName: string
  competitorPrice: number | null
}
type CompetitorSeriesRow = { competitorId: string; competitorName: string }

const getProductPriceHistory = unstable_cache(
  async (companyId: string, productId: string, countryId?: string) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const ownCountryFilter = countryId ? Prisma.sql`and country_id = ${countryId}` : Prisma.empty
    const competitorCountryFilter = countryId ? Prisma.sql`and c.country_id = ${countryId}` : Prisma.empty
    const [ownRows, competitorRows, competitorSeriesRows] = await Promise.all([
      prisma.$queryRaw<OwnDailyRow[]>(Prisma.sql`
        select date_trunc('day', recorded_at) as day,
               avg(price)::float8 as "ownPrice"
        from own_price_history
        where company_id = ${companyId}
          and product_id = ${productId}
          ${ownCountryFilter}
          and recorded_at >= ${since}
        group by 1
        order by 1 asc
      `),
      prisma.$queryRaw<CompetitorDailyRow[]>(Prisma.sql`
        select date_trunc('day', ph.recorded_at) as day,
               c.id as "competitorId",
               c.name as "competitorName",
               avg(coalesce(ph.normalized_price, ph.price))::float8 as "competitorPrice"
        from price_history ph
        inner join competitor_offers co on co.id = ph.competitor_offer_id
        inner join competitors c on c.id = co.competitor_id
        inner join product_matches pm on pm.competitor_offer_id = co.id
        where ph.company_id = ${companyId}
          and co.company_id = ${companyId}
          and c.company_id = ${companyId}
          and pm.company_id = ${companyId}
          and pm.product_id = ${productId}
          ${competitorCountryFilter}
          and pm.match_status = 'CERTAIN'
          and ph.recorded_at >= ${since}
        group by 1, c.id, c.name
        order by 1 asc, c.name asc
      `),
      prisma.$queryRaw<CompetitorSeriesRow[]>(Prisma.sql`
        select distinct c.id as "competitorId", c.name as "competitorName"
        from product_matches pm
        inner join competitor_offers co on co.id = pm.competitor_offer_id
        inner join competitors c on c.id = co.competitor_id
        where pm.company_id = ${companyId}
          and co.company_id = ${companyId}
          and c.company_id = ${companyId}
          and pm.product_id = ${productId}
          ${competitorCountryFilter}
          and pm.match_status = 'CERTAIN'
          and co.is_active = true
          and c.is_active = true
        order by c.name asc
      `),
    ])

    const competitors = competitorSeriesRows.map((row) => [row.competitorId, row.competitorName] as const)

    const series: PriceChartSeries[] = [
      { key: 'ownPrice', name: 'Eigen prijs', kind: 'own' },
      ...competitors.map(([competitorId, competitorName], index) => ({
        key: `competitor_${index}`,
        name: competitorName,
        kind: 'competitor' as const,
        competitorId,
      })),
    ]
    const keyByCompetitorId = new Map(
      series
        .filter((item) => item.kind === 'competitor' && item.competitorId)
        .map((item) => [item.competitorId!, item.key]),
    )

    const merged = new Map<string, Record<string, string | number | null>>()
    const keyFor = (date: Date) => date.toISOString().slice(0, 10)
    const labelFor = (date: Date) => date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })

    const pointFor = (date: Date) => {
      const key = keyFor(date)
      const existing = merged.get(key)
      if (existing) return existing
      const point: Record<string, string | number | null> = { date: labelFor(date), sortKey: key, ownPrice: null }
      for (const item of series) {
        if (item.kind === 'competitor') point[item.key] = null
      }
      merged.set(key, point)
      return point
    }

    for (const row of ownRows) {
      const point = pointFor(row.day)
      point.ownPrice = row.ownPrice === null ? null : Number(row.ownPrice)
    }

    for (const row of competitorRows) {
      const point = pointFor(row.day)
      const seriesKey = keyByCompetitorId.get(row.competitorId)
      if (seriesKey) point[seriesKey] = row.competitorPrice === null ? null : Number(row.competitorPrice)
    }

    const data = [...merged.values()]
      .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)))
      .map(({ sortKey: _sortKey, ...point }) => point)

    return { data, series }
  },
  ['prysight-product-price-history-v3'],
  { revalidate: 60 },
)

export async function ProductPriceHistoryPanel({ companyId, productId, countryId }: { companyId: string; productId: string; countryId?: string }) {
  const { data, series } = await getProductPriceHistory(companyId, productId, countryId)

  if (data.length === 0) {
    return (
      <section className="surface-card p-5">
        <h2 className="text-[14px] font-semibold text-[#0b1f35]">Prijsverloop</h2>
        <p className="mt-2 text-[13px] text-[#6b7b8e]">Er is nog onvoldoende prijshistorie om een trend te tonen.</p>
      </section>
    )
  }

  return <PriceChart data={data} series={series} />
}
