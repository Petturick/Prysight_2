'use client'

import Link from 'next/link'
import type { ProductGridRow } from '@/components/ProductOverviewGrid'

function LabelValue({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className="min-w-0"><dt className="text-[11px] text-[#718196]">{label}</dt><dd className={`mt-1 tabular-nums ${emphasis ? 'text-[17px] font-semibold text-[#1d344e]' : 'text-[12px] font-medium text-[#40546c]'}`}>{value}</dd></div>
}

export function ProductComparisonView({ rows, canCrawl, refreshSinglePriceAction }: {
  rows: ProductGridRow[]
  canCrawl: boolean
  refreshSinglePriceAction: (data: FormData) => Promise<void>
}) {
  const withPrices = rows.filter(row => row.comparisons.some(offer => offer.priceInc !== '—')).length
  const needingReview = rows.filter(row => row.review > 0).length

  return (
    <section className="space-y-4" aria-label="Producten en concurrentieprijzen">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[#e3eaf2] bg-white px-4 py-3 text-[12px] text-[#51647c]">
        <span><strong className="text-[#1e344c]">{rows.length}</strong> producten op deze pagina</span>
        <span><strong className="text-[#1e344c]">{withPrices}</strong> met bevestigde concurrentieprijzen</span>
        {needingReview > 0 ? <Link href="/productmatches" className="font-semibold text-[#315fa7]">{needingReview} met suggesties om te beoordelen</Link> : null}
      </div>
      {rows.map(row => {
        const hasOwnPrice = row.ownInc !== '—'
        const sortedOffers = row.comparisons
        return <article key={row.id} className="overflow-hidden rounded-[16px] border border-[#dce5ef] bg-white shadow-[0_3px_14px_rgba(26,47,73,.04)]">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e9eef4] px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <Link href={row.detailHref} className="text-[15px] font-semibold leading-6 text-[#20344c] hover:text-[#315fa7]">{row.name || `Artikel ${row.articleNumber}`}</Link>
              <p className="mt-1 text-[11px] text-[#75849a]">Artikel {row.articleNumber}{row.ean ? ` · EAN ${row.ean}` : ''} · {row.group} · {row.markets}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${row.status === 'Actueel' ? 'bg-[#e9f7ef] text-[#21774a]' : row.status === 'Controle mislukt' ? 'bg-[#fff0f1] text-[#a53b46]' : 'bg-[#fff5e5] text-[#92641f]'}`}>{row.status}</span>
              <Link href={row.detailHref} className="secondary-action min-h-[34px] px-3 py-1.5 text-[11px]">Product beheren</Link>
            </div>
          </header>

          <div className="grid gap-4 bg-[#f8fafd] px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div>
              <p className="text-[11px] font-semibold text-[#62768e]">Jouw productprijs</p>
              <p className="mt-1 text-[24px] font-semibold tracking-tight text-[#1e344c]">{row.ownInc}<span className="ml-2 text-[11px] font-normal text-[#75859a]">incl. btw</span></p>
              <p className="text-[12px] text-[#62768e]">Excl. btw {row.ownEx} · Verzending {row.ownShipping}</p>
              <p className="mt-1 text-[12px] font-semibold text-[#35516d]">Totaal incl. verzending {row.ownDelivered}</p>
              {!hasOwnPrice ? <p className="mt-2 text-[11px] text-[#96651c]">Voeg je eigen prijs toe om een prijsverschil te berekenen.</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-4 border-t border-[#e2e9f1] pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0">
              <LabelValue label="Laagste bevestigde productprijs, incl. btw" value={row.marketInc} emphasis />
              <LabelValue label="Verschil met jouw prijs" value={row.difference} emphasis />
              <LabelValue label="Bevestigde bronnen" value={String(sortedOffers.filter(offer => offer.priceInc !== '—').length)} />
              <LabelValue label="Laatste meting" value={row.lastChecked} />
            </div>
          </div>

          {sortedOffers.length > 0 ? <div className="overflow-x-auto px-4 pb-4 pt-3 sm:px-5" role="region" aria-label={`Concurrenten van ${row.name}`} tabIndex={0}>
            <table className="w-full min-w-[680px] text-left text-[12px]">
              <thead className="text-[10px] font-semibold text-[#687b91]">
                <tr><th scope="col" className="py-2 pr-3">Concurrent</th><th scope="col" className="px-3 py-2 text-right">Prijs incl. btw</th><th scope="col" className="px-3 py-2 text-right">Prijs excl. btw</th><th scope="col" className="px-3 py-2 text-right">Verzending incl. btw</th><th scope="col" className="px-3 py-2 text-right">Totaal incl. verzending</th><th scope="col" className="px-3 py-2 text-right">Meting</th><th scope="col" className="py-2 pl-3 text-right">Acties</th></tr>
              </thead>
              <tbody>
                {sortedOffers.map(offer => <tr key={offer.id} className="border-t border-[#e9eef4]">
                  <td className="py-3 pr-3"><span className="font-semibold text-[#2b435c]">{offer.name}</span><span className="mt-0.5 block text-[10px] text-[#718196]">{offer.stock || 'Voorraad onbekend'}</span></td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums text-[#203c56]">{offer.priceInc}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{offer.priceEx}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{offer.shippingInc}</td>
                  <td className="px-3 py-3 text-right font-medium tabular-nums">{offer.totalInc}</td>
                  <td className="px-3 py-3 text-right text-[11px] text-[#718196]">{offer.checked}</td>
                  <td className="py-3 pl-3 text-right"><Link href={offer.detailHref} className="font-semibold text-[#315fa7]">Bekijken</Link></td>
                </tr>)}
              </tbody>
            </table>
            <p className="mt-2 text-[10px] text-[#7c8ba0]">Een onbekende verzendprijs wordt niet als gratis verzending weergegeven. Nieuwe productmatches worden pas als concurrentieprijs getoond na bevestiging en een geslaagde prijscontrole.</p>
          </div> : <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
            <p className="text-[12px] text-[#65778d]">{row.review > 0 ? `${row.review} concurrentiesuggesties wachten op beoordeling.` : 'Nog geen bevestigde concurrentieprijzen voor dit product.'}</p>
            <Link href={row.detailHref + '#concurrenten-vinden'} className="secondary-action min-h-[34px] px-3 py-1.5 text-[11px]">Concurrenten vinden</Link>
          </div>}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ecf0f5] px-4 py-3 sm:px-5">
            <span className="text-[11px] text-[#77889a]">{row.sources} gekoppelde bronnen · {row.review} te beoordelen</span>
            <div className="flex flex-wrap items-center gap-3">
              {canCrawl && row.sources > 0 ? <form action={refreshSinglePriceAction}><input name="singleProductId" type="hidden" value={row.id} /><button type="submit" className="secondary-action min-h-[34px] px-3 py-1.5 text-[11px]">Prijzen opnieuw ophalen</button></form> : null}
              <Link href={row.detailHref + '#concurrentieprijzen'} className="text-[11px] font-semibold text-[#315fa7]">Volledige prijsvergelijking bekijken</Link>
            </div>
          </footer>
        </article>
      })}
      {rows.length === 0 ? <div className="rounded-xl border border-[#e1e8f0] bg-white px-5 py-12 text-center text-[13px] text-[#6f8196]">Geen producten gevonden voor deze zoekopdracht. Pas de filters aan of voeg een product toe.</div> : null}
    </section>
  )
}
