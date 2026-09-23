export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { updateCompetitorDetailsAction } from '@/app/actions/productActions'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

export default async function ConcurrentBewerkenPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bestaat?: string }> }) {
  const actor = await requirePermission('competitors.write')
  const { id } = await params
  const query = await searchParams
  const [competitor, memberships] = await Promise.all([
    prisma.competitor.findFirst({
      where: { id, companyId: actor.companyId },
      include: {
        country: true,
        _count: { select: { offers: true, webshops: true, alertRules: true } },
      },
    }),
    prisma.companyCountry.findMany({
      where: { companyId: actor.companyId, isActive: true, country: { isActive: true } },
      include: { country: true },
      orderBy: { country: { name: 'asc' } },
    }),
  ])
  if (!competitor) notFound()
  const hasMarketDependencies = competitor._count.offers > 0 || competitor._count.webshops > 0 || competitor._count.alertRules > 0
  const countries = memberships.map((item) => item.country)
  const marketCanBeChanged = !hasMarketDependencies && countries.some((country) => country.id === competitor.countryId)

  return (
    <div className="mx-auto max-w-[780px] space-y-4">
      {query.bestaat === '1' ? <p role="status" className="rounded-[10px] border border-[#e8d9af] bg-[#fff9e8] px-4 py-3 text-[12px] text-[#755c29]">Deze concurrent bestaat al in de gekozen markt. Wijzig hieronder de bestaande concurrent zonder zijn productgegevens of prijshistorie te verliezen.</p> : null}
      <Link href={`/concurrenten/${competitor.id}`} className="inline-flex text-[12px] font-semibold text-[#356ccd]">← Terug naar concurrent</Link>
      <section className="ps-panel overflow-hidden">
        <div className="border-b border-[#e4eaf0] px-5 py-5 sm:px-6">
          <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-[#22364c]">Concurrent wijzigen</h1>
          <p className="mt-1 text-[12px] text-[#718197]">Pas de concurrentgegevens aan zonder gekoppelde productprijzen te verwijderen.</p>
        </div>
        <form action={updateCompetitorDetailsAction} className="space-y-5 px-5 py-5 sm:px-6">
          <input type="hidden" name="competitorId" value={competitor.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-[12px] font-semibold text-[#3b4b62]">
              <span>Naam</span>
              <input name="name" defaultValue={competitor.name} minLength={2} maxLength={120} className="toolbar-control w-full" required />
            </label>
            <label className="space-y-1.5 text-[12px] font-semibold text-[#3b4b62]">
              <span>Website</span>
              <input name="website" type="url" defaultValue={competitor.website} className="toolbar-control w-full" placeholder="https://www.voorbeeld.fr" required />
            </label>
            <label className="space-y-1.5 text-[12px] font-semibold text-[#3b4b62]">
              <span>Markt</span>
              {marketCanBeChanged ? (
                <select name="countryId" defaultValue={competitor.countryId} className="toolbar-control w-full" required>
                  {countries.map((country) => <option key={country.id} value={country.id}>{country.name} ({country.code})</option>)}
                </select>
              ) : (
                <>
                  <input type="hidden" name="countryId" value={competitor.countryId} />
                  <div className="toolbar-control flex items-center bg-[#f5f7fa] text-[#53647b]">{competitor.country.name} ({competitor.country.code})</div>
                </>
              )}
            </label>
            <label className="space-y-1.5 text-[12px] font-semibold text-[#3b4b62]">
              <span>Prijscontrole</span>
              <select name="checkFrequencyHours" defaultValue={String(competitor.checkFrequencyHours)} className="toolbar-control w-full">
                <option value="6">Iedere 6 uur</option><option value="12">Iedere 12 uur</option><option value="24">Dagelijks</option>
                <option value="48">Iedere 2 dagen</option><option value="168">Wekelijks</option><option value="876000">Handmatig</option>
              </select>
            </label>
          </div>
          <p className="rounded-[10px] bg-[#f4f7fb] px-4 py-3 text-[11px] leading-5 text-[#65768a]">
            {hasMarketDependencies
              ? 'De markt is vastgezet omdat deze concurrent al gekoppelde prijsbronnen of andere gegevens heeft. Voeg dezelfde concurrent in een andere markt opnieuw toe. De bestaande product URL’s en prijshistorie blijven ongewijzigd wanneer je de website aanpast.'
              : 'Je kunt de markt veranderen zolang er geen productprijzen of andere gegevens aan deze concurrent gekoppeld zijn.'}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href={`/concurrenten/${competitor.id}`} className="secondary-action">Annuleren</Link>
            <button type="submit" className="primary-action">Wijzigingen opslaan</button>
          </div>
        </form>
      </section>
    </div>
  )
}
