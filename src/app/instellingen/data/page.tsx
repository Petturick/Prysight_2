export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { requireSuperAdmin } from '@/lib/authz'
import { formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'

export default async function DataBeheerPage() {
  const actor = await requireSuperAdmin()
  const [products, feeds, activeFeeds, inactiveFeeds] = await Promise.all([
    prisma.product.count({ where: { companyId: actor.companyId, isActive: true } }),
    prisma.feedSource.count({ where: { companyId: actor.companyId } }),
    prisma.feedSource.count({ where: { companyId: actor.companyId, isActive: true } }),
    prisma.feedSource.count({ where: { companyId: actor.companyId, isActive: false } }),
  ])

  return (
    <div className="space-y-5">
      <section className="strong-panel px-5 py-5 sm:px-6">
        <p className="eyebrow">Super Admin</p>
        <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#172033]">Data beheer</h2>
        <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">
          Centrale beheerplek voor productdata en feeds. Hier zie je direct waar je bulkselecties, deselectie en verwijderacties uitvoert.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8699]">Productdata</p>
              <p className="mt-2 text-[28px] font-semibold text-[#172033]">{formatNumber(products)}</p>
              <p className="mt-2 text-[11px] leading-5 text-[#697386]">
                In Producten kun je een pagina selecteren, alle resultaten selecteren, alles deselecteren en de volledige selectie verwijderen.
              </p>
            </div>
          </div>
          <Link href="/producten" className="primary-action mt-4 inline-flex">Producten beheren</Link>
        </div>

        <div className="surface-card p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a8699]">Feeds</p>
            <p className="mt-2 text-[28px] font-semibold text-[#172033]">{formatNumber(feeds)}</p>
            <p className="mt-1 text-[10px] text-[#7a8699]">{formatNumber(activeFeeds)} actief, {formatNumber(inactiveFeeds)} inactief</p>
            <p className="mt-2 text-[11px] leading-5 text-[#697386]">
              In Feedbeheer kun je meerdere feeds selecteren, activeren, deactiveren, deselecteren, synchroniseren, bewerken en verwijderen.
            </p>
          </div>
          <Link href="/instellingen/feedbeheer" className="primary-action mt-4 inline-flex">Feedbeheer openen</Link>
        </div>
      </section>

      <section className="rounded-[12px] border border-[#ead6a8] bg-[#fff9eb] px-4 py-3 text-[10px] leading-5 text-[#7d5a1d]">
        Feed verwijderen verwijdert bewust niet automatisch de eerder geïmporteerde producten. Producten verwijder je apart via Producten, zodat een feedwissel nooit onbedoeld je productdatabase wist.
      </section>
    </div>
  )
}
