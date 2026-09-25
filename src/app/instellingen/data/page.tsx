export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DataPurgeControls } from '@/components/DataPurgeControls'
import { requireSuperAdmin } from '@/lib/authz'
import { formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

export default async function DataBeheerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireSuperAdmin()
  const params = await searchParams
  const [products, competitors, feeds, activeFeeds, inactiveFeeds] = await Promise.all([
    prisma.product.count({ where: { companyId: actor.companyId } }),
    prisma.competitor.count({ where: { companyId: actor.companyId } }),
    prisma.feedSource.count({ where: { companyId: actor.companyId } }),
    prisma.feedSource.count({ where: { companyId: actor.companyId, isActive: true } }),
    prisma.feedSource.count({ where: { companyId: actor.companyId, isActive: false } }),
  ])

  const productsDeleted = Number(readParam(params.productsDeleted) || '')
  const competitorsDeleted = Number(readParam(params.competitorsDeleted) || '')
  const feedsPaused = Number(readParam(params.feedsPaused) || '')
  const deleteError = readParam(params.deleteError)

  const errorMessage = deleteError === 'products_changed'
    ? 'De productselectie is intussen gewijzigd. Vernieuw de pagina en bevestig opnieuw.'
    : deleteError === 'competitors_changed'
      ? 'De lijst met concurrenten is intussen gewijzigd. Vernieuw de pagina en bevestig opnieuw.'
      : deleteError
        ? 'De bevestiging was niet geldig. Er is niets verwijderd.'
        : null

  return (
    <div className="space-y-5">
      {Number.isFinite(productsDeleted) && productsDeleted > 0 ? <p role="status" className="rounded-[10px] bg-[#eaf8f0] px-4 py-3 text-[11px] font-semibold text-[#1f7548]">{productsDeleted.toLocaleString('nl-NL')} producten definitief verwijderd.{feedsPaused > 0 ? ` ${feedsPaused.toLocaleString('nl-NL')} feeds zijn gepauzeerd.` : ''}</p> : null}
      {Number.isFinite(competitorsDeleted) && competitorsDeleted > 0 ? <p role="status" className="rounded-[10px] bg-[#eaf8f0] px-4 py-3 text-[11px] font-semibold text-[#1f7548]">{competitorsDeleted.toLocaleString('nl-NL')} concurrenten definitief verwijderd.</p> : null}
      {errorMessage ? <p role="alert" className="rounded-[10px] bg-[#fff1f2] px-4 py-3 text-[11px] font-semibold text-[#a83f4b]">{errorMessage}</p> : null}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="surface-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8699]">Productdata</p>
              <p className="mt-2 text-[28px] font-semibold text-[#172033]">{formatNumber(products)}</p>
            </div>
          </div>
          <Link href="/producten" className="primary-action mt-4 inline-flex">Producten beheren</Link>
        </div>

        <div className="surface-card p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8699]">Concurrenten</p>
            <p className="mt-2 text-[28px] font-semibold text-[#172033]">{formatNumber(competitors)}</p>
          </div>
          <Link href="/beheer/concurrenten" className="primary-action mt-4 inline-flex">Concurrenten beheren</Link>
        </div>

        <div className="surface-card p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8699]">Feeds</p>
            <p className="mt-2 text-[28px] font-semibold text-[#172033]">{formatNumber(feeds)}</p>
            <p className="mt-1 text-[10px] text-[#7a8699]">{formatNumber(activeFeeds)} actief, {formatNumber(inactiveFeeds)} inactief</p>
          </div>
          <Link href="/instellingen/feedbeheer" className="primary-action mt-4 inline-flex">Feedbeheer openen</Link>
        </div>
      </section>

      <DataPurgeControls productCount={products} competitorCount={competitors} activeFeedCount={activeFeeds} />

      <section className="rounded-[12px] border border-[#ead6a8] bg-[#fff9eb] px-4 py-3 text-[10px] leading-5 text-[#7d5a1d]">
        Feed verwijderen verwijdert bewust niet automatisch de eerder geïmporteerde producten. Producten verwijder je apart via Producten, zodat een feedwissel nooit onbedoeld je productdatabase wist.
      </section>
    </div>
  )
}
