'use client'

import Link from 'next/link'
import type { ProductGridRow } from '@/components/ProductOverviewGrid'

function Tone({ value, positive }: { value: string; positive: boolean | null }) {
  const tone = positive === null
    ? 'bg-[#f3f6fa] text-[#66778b]'
    : positive
      ? 'bg-[#ecf8f2] text-[#247554]'
      : 'bg-[#fff1f1] text-[#a8464d]'

  return <span className={'inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums ' + tone}>{value}</span>
}

export function ProductComparisonView({ rows, canCrawl, refreshSinglePriceAction }: {
  rows: ProductGridRow[]
  canCrawl: boolean
  refreshSinglePriceAction: (data: FormData) => Promise<void>
}) {
  const withPrices = rows.filter(row => row.comparisons.some(offer => offer.priceEx !== '—')).length
  const needingReview = rows.filter(row => row.quality === 'ATTENTION').length

  return (
    <section className="space-y-3" aria-label="Producten en concurrentieprijzen">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[#718096]">
        <span>{rows.length} producten op deze pagina, {withPrices} met bevestigde prijzen</span>
        {needingReview > 0 ? <Link href="/productmatches" className="text-[#315fa7] hover:underline">{needingReview} vragen om controle</Link> : null}
      </div>

      {rows.map(row => {
        const hasOwnPrice = row.ownEx !== '—'
        const hasCompetitorPrice = row.marketEx !== '—'
        const deltaPositive = row.differencePct === null ? null : row.differencePct <= 0

        return (
          <article key={row.id} className="overflow-hidden rounded-[14px] border border-[#e2e8f0] bg-white shadow-[0_3px_14px_rgba(31,49,77,.035)]">
            <header className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={row.detailHref} className="truncate text-[14px] font-medium text-[#20344c] hover:text-[#315fa7]">
                    {row.name || `Artikel ${row.articleNumber}`}
                  </Link>
                  <span title={row.qualityDetail} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    row.quality === 'VERIFIED'
                      ? 'bg-[#ecf8f2] text-[#247554]'
                      : row.quality === 'ATTENTION'
                        ? 'bg-[#fff1f1] text-[#a8464d]'
                        : row.quality === 'LIMITED'
                          ? 'bg-[#edf4ff] text-[#3d73d4]'
                          : 'bg-[#fff6e4] text-[#916317]'
                  }`}>{row.qualityLabel}</span>
                </div>
                <p className="mt-1 text-[10px] text-[#8794a7]">
                  {row.articleNumber}{row.ean ? ` · EAN ${row.ean}` : ''}{row.group && row.group !== '—' ? ` · ${row.group}` : ''}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {canCrawl && row.sources > 0 ? (
                  <form action={refreshSinglePriceAction}>
                    <input name="singleProductId" type="hidden" value={row.id} />
                    <button type="submit" className="secondary-action min-h-[32px] px-3 py-1.5 text-[10px]">Vernieuw</button>
                  </form>
                ) : null}
                <Link href={row.detailHref} className="secondary-action min-h-[32px] px-3 py-1.5 text-[10px]">Open</Link>
              </div>
            </header>

            <div className="grid border-t border-[#edf1f5] sm:grid-cols-3">
              <div className="px-4 py-4 sm:px-5">
                <p className="text-[10px] text-[#8190a3]">Jouw B2B prijs</p>
                <p className="mt-1 text-[20px] font-semibold tracking-tight text-[#1f344b] tabular-nums">{row.ownEx}</p>
                <p className="mt-1 text-[10px] text-[#7a899c]">{hasOwnPrice ? `excl. btw · Incl. btw ${row.ownInc}` : 'Nog geen eigen prijs'}</p>
              </div>

              <div className="border-t border-[#edf1f5] px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
                <p className="text-[10px] text-[#8190a3]">Laagste bevestigde prijs, excl. btw</p>
                <p className="mt-1 text-[20px] font-semibold tracking-tight text-[#1f344b] tabular-nums">{row.marketEx}</p>
                <p className="mt-1 text-[10px] text-[#7a899c]">{hasCompetitorPrice ? `${row.sources} gekoppelde bronnen` : 'Nog geen bevestigde prijs'}</p>
              </div>

              <div className="border-t border-[#edf1f5] px-4 py-4 sm:border-l sm:border-t-0 sm:px-5">
                <p className="text-[10px] text-[#8190a3]">Verschil</p>
                <div className="mt-2"><Tone value={row.comparisonDifference} positive={deltaPositive} /></div>
                <p className="mt-2 text-[10px] text-[#7a899c]">Laatste meting {row.lastChecked.toLowerCase()}</p>
              </div>
            </div>

            {row.comparisons.length > 0 ? (
              <details className="group border-t border-[#edf1f5]">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[11px] font-medium text-[#52657d] sm:px-5">
                  <span>Prijsdetails, {row.comparisons.length} concurrent{row.comparisons.length === 1 ? '' : 'en'}</span>
                  <span aria-hidden="true" className="text-[#9aa6b5]">⌄</span>
                </summary>
                <div className="border-t border-[#edf1f5] bg-[#fbfcfe] px-4 pb-4 pt-3 sm:px-5">
                  <div className="mb-3 grid gap-2 text-[10px] text-[#6f7f92] sm:grid-cols-3">
                    <span>Eigen levering incl. btw, {row.ownDelivered}</span>
                    <span>Eigen verzending, {row.ownShipping}</span>
                    <span>Laagste prijs incl. btw, {row.marketInc}</span>
                  </div>

                  <div className="overflow-x-auto" role="region" aria-label={`Concurrenten van ${row.name}`} tabIndex={0}>
                    <table className="w-full min-w-[620px] text-left text-[11px]">
                      <thead>
                        <tr>
                          <th scope="col" className="py-2 pr-3">Concurrent</th>
                          <th scope="col" className="px-3 py-2 text-right">Excl. btw</th>
                          <th scope="col" className="px-3 py-2 text-right">Incl. btw</th>
                          <th scope="col" className="px-3 py-2 text-right">Verzending</th>
                          <th scope="col" className="px-3 py-2 text-right">Totaal</th>
                          <th scope="col" className="py-2 pl-3 text-right">Meting</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.comparisons.map(offer => (
                          <tr key={offer.id} className="border-t border-[#edf1f5]">
                            <td className="py-3 pr-3">
                              <Link href={offer.detailHref} className="font-medium text-[#2b435c] hover:text-[#315fa7]">{offer.name}</Link>
                              <span className="mt-0.5 block text-[9px] text-[#8b98a8]">{offer.stock || 'Voorraad onbekend'}</span>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{offer.priceEx}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{offer.priceInc}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{offer.shippingInc}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{offer.totalInc}</td>
                            <td className="py-3 pl-3 text-right text-[#7e8b9d]">{offer.checked}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </details>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f5] px-4 py-3 sm:px-5">
                <p className="text-[11px] text-[#718096]">{row.review > 0 ? `${row.review} suggesties wachten op controle` : 'Nog geen concurrentieprijs gevonden'}</p>
                <Link href={row.detailHref + '#concurrenten-vinden'} className="text-[11px] font-medium text-[#315fa7] hover:underline">Concurrent vinden</Link>
              </div>
            )}
          </article>
        )
      })}

      {rows.length === 0 ? (
        <div className="premium-empty-state px-5 py-10 text-center text-[12px]">
          Geen producten gevonden. Pas je zoekopdracht of filters aan.
        </div>
      ) : null}
    </section>
  )
}
