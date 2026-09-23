export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { saveCompetitorSourceAction } from '@/app/actions/competitorSourceActions'
import { CompetitorSourceDeleteButton } from '@/components/CompetitorSourceDeleteButton'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

export default async function PriceSourceEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; offerId: string }>
  searchParams: Promise<{ zoek?: string }>
}) {
  const actor = await requirePermission('competitors.write')
  const { id: competitorId, offerId } = await params
  const query = await searchParams
  const q = typeof query.zoek === 'string' ? query.zoek.trim().slice(0, 80) : ''
  const offer = await prisma.competitorOffer.findFirst({
    where: { id: offerId, competitorId, companyId: actor.companyId, isActive: true },
    include: {
      competitor: { include: { country: true } },
      productMatch: { include: { product: true } },
    },
  })
  if (!offer) notFound()
  const country = offer.competitor.country
  const products = await prisma.product.findMany({
    where: {
      companyId: actor.companyId,
      isActive: true,
      ...(q.length >= 2 ? { OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { articleNumber: { contains: q, mode: 'insensitive' } },
        { ean: { contains: q } },
        { gtin: { contains: q } },
      ] } : {}),
    },
    select: {
      id: true, articleNumber: true, name: true, ean: true,
      productMarkets: {
        where: { companyId: actor.companyId, countryId: country.id },
        select: { isActive: true },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
    take: 40,
  })
  const currentProduct = offer.productMatch?.product
  const choices = currentProduct && !products.some((product) => product.id === currentProduct.id)
    ? [{ id: currentProduct.id, name: currentProduct.name, articleNumber: currentProduct.articleNumber, ean: currentProduct.ean, productMarkets: [] }, ...products]
    : products
  const currentMarket = currentProduct?.id
    ? await prisma.productMarket.findUnique({
        where: { companyId_productId_countryId: { companyId: actor.companyId, productId: currentProduct.id, countryId: country.id } },
        select: { isActive: true },
      })
    : null

  return (
    <div className="mx-auto max-w-[880px] space-y-4">
      <Link href={`/concurrenten/${competitorId}#prijsbronnen`} className="inline-flex text-[12px] font-semibold text-[#356ccd]">← Terug naar prijsbronnen van {offer.competitor.name}</Link>
      <section className="ps-panel overflow-hidden">
        <div className="border-b border-[#e4eaf0] px-5 py-5 sm:px-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6e7f93]">{country.name} · {offer.competitor.name}</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-[-0.025em] text-[#22364c]">Prijsbron wijzigen</h1>
          <p className="mt-1 text-[12px] leading-5 text-[#718197]">Koppel het juiste product, pas de product URL of verpakking aan en controleer daarna de nieuwe prijs.</p>
        </div>
        <div className="space-y-3 px-5 py-4 sm:px-6">
          <div className="rounded-[10px] bg-[#f5f8fc] px-4 py-3 text-[12px]">
            <span className="block font-semibold text-[#283b55]">Huidige productkoppeling</span>
            <span className="mt-1 block text-[#65768b]">{currentProduct ? `${currentProduct.name} · ${currentProduct.articleNumber}` : 'Nog niet gekoppeld, daarom kan geen betrouwbare productprijs worden vergeleken.'}</span>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="min-w-[220px] flex-1 space-y-1 text-[11px] font-semibold text-[#53647a]">
              <span>Product zoeken</span>
              <input name="zoek" defaultValue={q} placeholder="Naam, artikelnummer of EAN" className="toolbar-control w-full" maxLength={80} />
            </label>
            <button type="submit" className="secondary-action">Zoeken</button>
            {q ? <Link href={`/concurrenten/${competitorId}/bronnen/${offerId}/bewerken`} className="secondary-action">Wissen</Link> : null}
          </form>
          <p className="text-[11px] text-[#76869a]">Selecteer hieronder het product dat exact overeenkomt met de concurrentpagina. {q.length >= 2 ? 'Zoekresultaten voor deze zoekopdracht worden weergegeven.' : 'De eerste 40 producten worden getoond. Zoek op naam, artikelnummer of EAN voor overige producten.'}</p>
        </div>

        <form action={saveCompetitorSourceAction} className="space-y-4 border-t border-[#e4eaf0] px-5 py-5 sm:px-6">
          <input type="hidden" name="competitorId" value={competitorId} />
          <input type="hidden" name="offerId" value={offerId} />
          <label className="block space-y-1.5 text-[12px] font-semibold text-[#3b4b62]">
            <span>Gekoppeld product</span>
            <select name="productId" defaultValue={currentProduct?.id ?? ''} className="toolbar-control w-full" aria-label="Gekoppeld product aanpassen">
              <option value="">Geen product gekoppeld</option>
              {choices.map((product) => {
                const marketActive = product.productMarkets[0]?.isActive
                return <option key={product.id} value={product.id} disabled={marketActive === false && product.id !== currentProduct?.id}>
                  {product.name} · {product.articleNumber}{product.ean ? ` · EAN ${product.ean}` : ''}{marketActive === false ? ' (in deze markt gepauzeerd)' : ''}
                </option>
              })}
            </select>
          </label>
          <p className="text-[11px] leading-5 text-[#6d7e91]">Als dit product nog niet in {country.name} voorkomt, koppelt Prysight het bij het opslaan aan deze markt zonder de Nederlandse verkoopprijs over te nemen. {currentProduct && currentMarket?.isActive === false ? 'Het huidige product is in deze markt gepauzeerd en moet apart geactiveerd worden om opnieuw te vergelijken.' : ''}</p>
          <label className="block space-y-1.5 text-[12px] font-semibold text-[#3b4b62]">
            <span>Product URL van de concurrent</span>
            <input name="offerUrl" type="url" className="toolbar-control w-full" defaultValue={offer.url} required />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1.5 text-[12px] font-semibold text-[#3b4b62]">
              <span>Verpakkingseenheid</span>
              <input name="packagingUnit" defaultValue={offer.packagingUnit ?? 'stuks'} maxLength={40} className="toolbar-control w-full" required />
            </label>
            <label className="space-y-1.5 text-[12px] font-semibold text-[#3b4b62]">
              <span>Aantal per verpakking</span>
              <input name="packagingQty" type="number" min={1} max={100000} defaultValue={offer.packagingQty ?? 1} className="toolbar-control w-full" required />
            </label>
            <label className="space-y-1.5 text-[12px] font-semibold text-[#3b4b62]">
              <span>BTW in de bronprijs</span>
              <select name="vatIncluded" defaultValue={offer.vatIncluded ? 'true' : 'false'} className="toolbar-control w-full">
                <option value="true">Inclusief btw</option>
                <option value="false">Exclusief btw</option>
              </select>
            </label>
          </div>
          <div className="space-y-3 rounded-[11px] border border-[#dbe4ef] bg-[#f7faff] px-4 py-4 text-[11px] leading-5 text-[#53677f]">
            <p className="font-semibold text-[#2e4766]">Controle vóór opslaan</p>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="confirmMatch" value="on" className="mt-1" />
              <span>Ik heb gecontroleerd dat het gekozen product overeenkomt met de concurrentpagina.</span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="confirmReset" value="on" className="mt-1" required />
              <span>Ik begrijp dat bij wijziging van het product, de URL, verpakking of btw de oude prijsmetingen en meldingen van alleen deze bron worden gewist. De concurrent en andere prijsbronnen blijven behouden.</span>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CompetitorSourceDeleteButton competitorId={competitorId} offerId={offerId} url={offer.url} />
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/concurrenten/${competitorId}#prijsbronnen`} className="secondary-action">Annuleren</Link>
              <button type="submit" className="primary-action">Prijsbron opslaan</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}
