export const dynamic = 'force-dynamic'
import { notFound } from 'next/navigation'
import { DataTable } from '@/components/DataTable'
import { deriveCompetitorMetrics } from '@/lib/dashboard'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'

export default async function ConcurrentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const competitor = await prisma.competitor.findUnique({
    where: { id },
    include: {
      country: true,
      offers: {
        include: {
          productMatch: { include: { product: true } },
          priceHistory: { orderBy: { recordedAt: 'desc' }, take: 5 },
          priceChecks: { orderBy: { checkedAt: 'desc' }, take: 5 },
        },
      },
    },
  })

  if (!competitor) notFound()
  const metrics = deriveCompetitorMetrics(competitor)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-3xl font-semibold">{competitor.name}</h1>
        <p className="mt-2 text-sm text-slate-600">{competitor.country.name} · {competitor.website}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4 text-sm text-slate-600">
          <p>Gekoppelde producten: <span className="font-semibold text-slate-950">{formatNumber(metrics.linkedProducts)}</span></p>
          <p>Geldige prijzen: <span className="font-semibold text-slate-950">{formatNumber(metrics.validPrices)}</span></p>
          <p>Foutpercentage: <span className="font-semibold text-slate-950">{metrics.failedRate === null ? '—' : `${formatNumber(metrics.failedRate, 1)}%`}</span></p>
          <p>Laatste controle: <span className="font-semibold text-slate-950">{formatDate(metrics.lastChecked)}</span></p>
        </div>
      </div>

      <DataTable
        columns={[
          { key: 'product', header: 'Product' },
          { key: 'prijs', header: 'Prijs' },
          { key: 'genormaliseerd', header: 'Genormaliseerd' },
          { key: 'match', header: 'Matchstatus' },
          { key: 'voorraad', header: 'Voorraad' },
          { key: 'laatstGecontroleerd', header: 'Laatste controle' },
        ]}
        rows={competitor.offers.map((offer) => ({
          product: offer.productMatch?.product.name ?? 'Nog niet gekoppeld',
          prijs: formatCurrency(offer.rawPrice, offer.currency),
          genormaliseerd: formatCurrency(offer.normalizedPrice),
          match: offer.productMatch?.matchStatus ?? 'Geen match',
          voorraad: offer.stockStatus ?? '—',
          laatstGecontroleerd: formatDate(offer.lastCheckedAt),
        }))}
      />
    </div>
  )
}
