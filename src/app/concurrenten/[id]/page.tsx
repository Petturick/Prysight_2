export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { updateCompetitorFrequencyAction } from '@/app/actions/productActions'
import { DataTable } from '@/components/DataTable'
import { requirePermission } from '@/lib/authz'
import { deriveCompetitorMetrics } from '@/lib/dashboard'
import { formatCurrency, formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'

const MANUAL_CHECK_FREQUENCY_HOURS = 876000

type LatestCheck = {
  checkedAt: Date
  isSuccess: boolean
  errorMessage: string | null
}

function frequencyLabel(hours: number) {
  if (hours >= MANUAL_CHECK_FREQUENCY_HOURS) return 'Handmatig'
  if (hours === 6) return 'Iedere 6 uur'
  if (hours === 12) return 'Iedere 12 uur'
  if (hours === 24) return 'Dagelijks'
  if (hours === 48) return 'Iedere 2 dagen'
  if (hours === 168) return 'Wekelijks'
  return `Iedere ${hours} uur`
}

function friendlyFailureReason(message: string | null | undefined) {
  const value = (message ?? '').toLowerCase()
  if (!value) return 'Prijs kon niet worden opgehaald'
  if (value.includes('robots.txt')) return 'Website blokkeert automatische controle'
  if (value.includes('http 401') || value.includes('http 403')) return 'Website weigert automatische toegang'
  if (value.includes('http 404')) return 'Product URL bestaat niet meer'
  if (value.includes('http 429')) return 'Website beperkt te veel verzoeken'
  if (value.includes('geen betrouwbare prijs')) return 'Geen betrouwbare prijs gevonden op de pagina'
  if (value.includes('prijsvalidatie afgekeurd')) return 'Gevonden prijs kon niet betrouwbaar worden bevestigd'
  if (value.includes('contenttype')) return 'De URL levert geen normale productpagina'
  if (value.includes('browser renderer') || value.includes('browser rendering')) return 'Deze pagina vereist een browsercontrole'
  if (value.includes('abort') || value.includes('timeout')) return 'Website reageerde niet op tijd'
  return 'Prijs kon niet betrouwbaar worden opgehaald'
}

export default async function ConcurrentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission('competitors.read')
  const { id } = await params
  const canWrite = actor.permissions.includes('competitors.write')
  const competitor = await prisma.competitor.findFirst({
    where: { id, companyId: actor.companyId },
    include: {
      country: true,
      offers: {
        where: { companyId: actor.companyId, isActive: true },
        include: {
          productMatch: { include: { product: true } },
          priceHistory: { where: { companyId: actor.companyId }, orderBy: { recordedAt: 'desc' }, take: 5 },
          priceChecks: { where: { companyId: actor.companyId }, orderBy: { checkedAt: 'desc' }, take: 5 },
        },
      },
    },
  })

  if (!competitor) notFound()
  const metrics = deriveCompetitorMetrics(competitor)
  const latestChecks = competitor.offers.map((offer) => offer.priceChecks[0]).filter((check): check is LatestCheck => Boolean(check))
  const failedLatestChecks = latestChecks.filter((check) => !check.isSuccess)
  const lastAttempt = latestChecks.map((check) => check.checkedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  return (
    <div className="space-y-4">
      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div>
            <Link href="/concurrenten" className="text-[11px] font-semibold text-[#2f6edb]">Terug naar Markt</Link>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-[#18273a]">{competitor.name}</h1>
            <p className="mt-1 text-[12px] text-[#748296]">{competitor.country.name} · {competitor.website}</p>
          </div>
          {canWrite ? (
            <form action={updateCompetitorFrequencyAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="competitorId" value={competitor.id} />
              <label className="text-[10px] font-medium text-[#69798a]">Controlefrequentie<select name="checkFrequencyHours" defaultValue={String(competitor.checkFrequencyHours)} className="toolbar-control mt-1 block min-w-[150px]"><option value="6">Iedere 6 uur</option><option value="12">Iedere 12 uur</option><option value="24">Dagelijks</option><option value="48">Iedere 2 dagen</option><option value="168">Wekelijks</option><option value="876000">Handmatig</option></select></label>
              <button className="secondary-action min-h-[38px] px-3 py-2 text-[11px]">Opslaan</button>
            </form>
          ) : null}
        </div>
        <div className="grid border-t border-[#e7edf3] sm:grid-cols-2 xl:grid-cols-4">
          <div className="px-5 py-3.5"><p className="text-[11px] text-[#7a8798]">Producten</p><p className="mt-1 text-[21px] font-semibold text-[#20344b]">{formatNumber(metrics.linkedProducts)}</p></div>
          <div className="px-5 py-3.5"><p className="text-[11px] text-[#7a8798]">Geldige prijzen</p><p className="mt-1 text-[21px] font-semibold text-[#20344b]">{formatNumber(metrics.validPrices)}</p></div>
          <div className="px-5 py-3.5"><p className="text-[11px] text-[#7a8798]">Laatste controle</p><p className="mt-1 text-[13px] font-semibold text-[#20344b]">{lastAttempt ? formatDate(lastAttempt) : 'Nog niet gecontroleerd'}</p></div>
          <div className="px-5 py-3.5"><p className="text-[11px] text-[#7a8798]">Planning</p><p className="mt-1 text-[13px] font-semibold text-[#20344b]">{frequencyLabel(competitor.checkFrequencyHours)}</p></div>
        </div>
      </section>

      {failedLatestChecks.length > 0 ? (
        <div className="rounded-[12px] border border-[#efc8cd] bg-[#fff3f4] px-4 py-3">
          <p className="text-[12px] font-semibold text-[#913140]">{failedLatestChecks.length} prijsbron{failedLatestChecks.length === 1 ? '' : 'nen'} is bij de laatste controle mislukt.</p>
          <p className="mt-1 text-[11px] text-[#81525a]">De oorzaak staat hieronder per product. Oude fouten tellen niet mee in deze melding.</p>
        </div>
      ) : null}

      <section className="ps-panel overflow-hidden">
        <div className="border-b border-[#e7edf3] px-5 py-4"><h2 className="text-[15px] font-semibold text-[#21364d]">Prijsbronnen</h2></div>
        <DataTable
          emptyText="Nog geen product URLs gekoppeld aan deze concurrent."
          columns={[
            { key: 'product', header: 'Product' },
            { key: 'prijs', header: 'Prijs' },
            { key: 'status', header: 'Status' },
            { key: 'controle', header: 'Laatste controle' },
            { key: 'bron', header: 'Bron' },
          ]}
          rows={competitor.offers.map((offer) => {
            const latest = offer.priceChecks[0]
            const status = latest
              ? latest.isSuccess
                ? <span className="ps-chip ps-chip-green">Geslaagd</span>
                : <div><span className="ps-chip ps-chip-red">Mislukt</span><p className="mt-1 max-w-[260px] text-[10px] text-[#8d4652]">{friendlyFailureReason(latest.errorMessage)}</p></div>
              : <span className="ps-chip ps-chip-amber">Nog niet gecontroleerd</span>

            return {
              product: offer.productMatch?.product ? <Link href={`/producten/${offer.productMatch.product.id}`} className="font-semibold text-[#2f6edb]">{offer.productMatch.product.name}</Link> : 'Nog niet gekoppeld',
              prijs: formatCurrency(offer.normalizedPrice),
              status,
              controle: latest ? formatDate(latest.checkedAt) : 'Nog niet gecontroleerd',
              bron: <a href={offer.url} target="_blank" rel="noreferrer" className="font-semibold text-[#2f6edb]">Open URL</a>,
            }
          })}
        />
      </section>
    </div>
  )
}
