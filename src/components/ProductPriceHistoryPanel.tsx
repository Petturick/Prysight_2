import { unstable_cache } from 'next/cache'
import { Prisma } from '@/generated/prisma/client'
import { PriceChart } from '@/components/PriceChart'
import { prisma } from '@/lib/prisma'

type OwnDailyRow = { day: Date; ownPrice: number | null }
type CompetitorDailyRow = { day: Date; competitorPrice: number | null }

const getProductPriceHistory = unstable_cache(
  async (companyId: string, productId: string) => {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    const [ownRows, competitorRows] = await Promise.all([
      prisma.$queryRaw<OwnDailyRow[]>(Prisma.sql`
        select date_trunc('day', recorded_at) as day,
               avg(price)::float8 as "ownPrice"
        from own_price_history
        where company_id = ${companyId}
          and product_id = ${productId}
          and recorded_at >= ${since}
        group by 1
        order by 1 asc
      `),
      prisma.$queryRaw<CompetitorDailyRow[]>(Prisma.sql`
        select date_trunc('day', ph.recorded_at) as day,
               min(coalesce(ph.normalized_price, ph.price))::float8 as "competitorPrice"
        from price_history ph
        inner join competitor_offers co on co.id = ph.competitor_offer_id
        inner join product_matches pm on pm.competitor_offer_id = co.id
        where ph.company_id = ${companyId}
          and co.company_id = ${companyId}
          and pm.company_id = ${companyId}
          and pm.product_id = ${productId}
          and pm.match_status = 'CERTAIN'
          and ph.recorded_at >= ${since}
        group by 1
        order by 1 asc
      `),
    ])

    const merged = new Map<string, { date: string; ownPrice: number | null; competitorPrice: number | null }>()
    const keyFor = (date: Date) => date.toISOString().slice(0, 10)
    const labelFor = (date: Date) => date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })

    for (const row of ownRows) {
      const key = keyFor(row.day)
      merged.set(key, { date: labelFor(row.day), ownPrice: row.ownPrice === null ? null : Number(row.ownPrice), competitorPrice: null })
    }
    for (const row of competitorRows) {
      const key = keyFor(row.day)
      const current = merged.get(key) ?? { date: labelFor(row.day), ownPrice: null, competitorPrice: null }
      current.competitorPrice = row.competitorPrice === null ? null : Number(row.competitorPrice)
      merged.set(key, current)
    }

    return [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
  },
  ['prysight-product-price-history-v1'],
  { revalidate: 60 },
)

export async function ProductPriceHistoryPanel({ companyId, productId }: { companyId: string; productId: string }) {
  const data = await getProductPriceHistory(companyId, productId)

  if (data.length === 0) {
    return (
      <section className="surface-card p-5">
        <h2 className="text-[14px] font-semibold text-[#0b1f35]">Prijsverloop</h2>
        <p className="mt-2 text-[13px] text-[#6b7b8e]">Er is nog onvoldoende prijshistorie om een trend te tonen.</p>
      </section>
    )
  }

  return <PriceChart data={data} />
}
