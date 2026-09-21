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
  async (companyId: string, productId: string, countryId?: string | null) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const selectedCountryId = countryId ?? null
    const [ownRows, competitorRows, competitorSeriesRows] = await Promise.all([
      prisma.$queryRaw<OwnDailyRow[]>(Prisma.sql`
        select date_trunc('day', oph.recorded_at) as day,
               avg(
                 case
                   when coalesce(pm.vat_included, true) then oph.price
                   else oph.price * (1 + coalesce(ct.vat_rate, 0) / 100)
                 end
               )::float8 as "ownPrice"
        from own_price_history oph
        left join product_markets pm
          on pm.company_id = oph.company_id
         and pm.product_id = oph.product_id
         and pm.country_id = oph.country_id
        left join countries ct on ct.id = oph.country_id
        where oph.company_id = ${companyId}
          and oph.product_id = ${productId}
          and (${selectedCountryId}::text is null or oph.country_id = ${selectedCountryId})
          and oph.recorded_at >= ${since}
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
          and pm.match_status = 'CERTAIN'
          and (${selectedCountryId}::text is null or c.country_id = ${selectedCountryId})
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
          and pm.match_status = 'CERTAIN'
          and (${selectedCountryId}::text is null or c.country_id = ${selectedCountryId})
          and co.is_active = true
          and c.is_active = true
        order by c.name asc
      `),
    ])

    const competitors = competitorSeriesRows.map((row) => [row.competitorId, row.competitorName] as const)

    const series: PriceChartSeries[] = [
      { key: 'ownPrice', name: 'Eigen prijs incl. btw', kind: 'own' },
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

export async function ProductPriceHistoryPanel({ companyId, productId, countryId, highlightedCompetitorId }: { companyId: string; productId: string; countryId?: string | null; highlightedCompetitorId?: string | null }) {
  const { data, series } = await getProductPriceHistory(companyId, productId, countryId)

  if (data.length === 0) {
    return (
      <section className="surface-card p-5">
        <h2 className="text-[14px] font-semibold text-[#0b1f35]">Prijsverloop</h2>
        <p className="mt-2 text-[13px] text-[#6b7b8e]">Er is nog onvoldoende prijshistorie om een trend te tonen.</p>
      </section>
    )
  }

  return <PriceChart data={data} series={series} highlightedCompetitorId={highlightedCompetitorId} />
}
