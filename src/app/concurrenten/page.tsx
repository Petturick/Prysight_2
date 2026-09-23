export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createCompetitorAction } from '@/app/actions/productActions'
import { activateCompanyCountryAction } from '@/app/actions/onboardingActions'
import { CompetitorMarketPicker } from '@/components/CompetitorMarketPicker'
import { DataTable } from '@/components/DataTable'
import { CompetitorRowActions } from '@/components/CompetitorRowActions'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAuthenticatedUser } from '@/lib/authz'
import { deriveCompetitorMetrics } from '@/lib/dashboard'
import { formatDate, formatNumber } from '@/lib/format'
import { profileStep } from '@/lib/performance-profile'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

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

function latestChecksForCompetitor(competitor: { offers: Array<{ priceChecks: LatestCheck[] }> }) {
  return competitor.offers
    .map((offer) => offer.priceChecks[0])
    .filter((check): check is LatestCheck => Boolean(check))
}

function latestAttempt(checks: LatestCheck[]) {
  return checks.map((check) => check.checkedAt).sort((a, b) => b.getTime() - a.getTime())[0] ?? null
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

export default async function ConcurrentenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const user = await requireAuthenticatedUser()
  const canWrite = user.role === 'SUPER_ADMIN' || user.permissions.includes('competitors.write')
  const canManageMarkets = user.role === 'SUPER_ADMIN' || user.permissions.includes('settings.manage')
  const requestedMarket = typeof params.markt === 'string' ? params.markt.trim().toUpperCase() : ''

  const result = await profileStep('/concurrenten', 'overview', () => safeDatabaseQuery(async () => {
    const [companyCountries, availableCountries] = await Promise.all([
      prisma.companyCountry.findMany({
        relationLoadStrategy: 'join',
        where: { companyId: user.companyId, isActive: true, country: { isActive: true } },
        include: { country: true },
        orderBy: { country: { name: 'asc' } },
      }),
      canManageMarkets
        ? prisma.country.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } })
        : Promise.resolve([]),
    ])
    const countries = companyCountries.map((item) => item.country)
    const selectedCountry = countries.find((country) => country.code.toUpperCase() === requestedMarket) ?? null
    const hasInvalidSelection = Boolean(requestedMarket && requestedMarket !== 'ALLE' && !selectedCountry)
    const competitors = await prisma.competitor.findMany({
      relationLoadStrategy: 'join',
      where: {
        companyId: user.companyId,
        ...(selectedCountry ? { countryId: selectedCountry.id } : {}),
        ...(hasInvalidSelection ? { id: '__no_such_competitor_market__' } : {}),
      },
      include: {
        country: true,
        _count: { select: { offers: true } },
        offers: {
          where: { isActive: true },
          include: {
            productMatch: { include: { product: true } },
            priceChecks: { orderBy: { checkedAt: 'desc' }, take: 20 },
            priceHistory: { orderBy: { recordedAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: [{ country: { name: 'asc' } }, { name: 'asc' }],
    })
    return { competitors, countries, availableCountries, selectedCountryId: selectedCountry?.id ?? null, hasInvalidSelection }
  }, { competitors: [], countries: [], availableCountries: [], selectedCountryId: null, hasInvalidSelection: false }), { companyId: user.companyId }, 300)

  const { competitors, countries, availableCountries, selectedCountryId, hasInvalidSelection } = result.data
  const selectedMarket = countries.find((country) => country.id === selectedCountryId) ?? null
  const inactiveMarkets = availableCountries.filter((country) => !countries.some((activeCountry) => activeCountry.id === country.id))

  const added = params.toegevoegd === '1'
  const marketAdded = params.marktoegevoegd === '1'
  const overview = competitors.map((competitor) => {
    const metrics = deriveCompetitorMetrics(competitor)
    const latestChecks = latestChecksForCompetitor(competitor)
    const failedChecks = latestChecks.filter((check) => !check.isSuccess)
    const latestFailedCheck = [...failedChecks].sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())[0] ?? null
    return {
      competitor,
      metrics,
      latestChecks,
      failedChecks,
      lastAttempt: latestAttempt(latestChecks),
      latestFailureReason: latestFailedCheck ? friendlyFailureReason(latestFailedCheck.errorMessage) : null,
    }
  })

  const linkedProducts = overview.filter((item) => item.competitor.isActive).reduce((sum, item) => sum + item.metrics.linkedProducts, 0)
  const validPrices = overview.filter((item) => item.competitor.isActive).reduce((sum, item) => sum + item.metrics.validPrices, 0)
  const failedSources = overview.filter((item) => item.competitor.isActive).reduce((sum, item) => sum + item.failedChecks.length, 0)
  const competitorsWithCurrentFailures = overview.filter((item) => item.competitor.isActive && item.failedChecks.length > 0).length

  return (
    <div className="space-y-4">
      {!result.available && <DatabaseNotice />}
      {added ? <div className="rounded-[12px] bg-[#eaf8f0] px-4 py-3 text-[12px] font-semibold text-[#176a42]">Concurrent toegevoegd in de geselecteerde markt. Koppel nu één of meer product URLs.</div> : null}
      {marketAdded ? <div className="rounded-[12px] bg-[#eaf8f0] px-4 py-3 text-[12px] font-semibold text-[#176a42]">{selectedMarket?.name ?? 'De markt'} is geactiveerd. Je kunt nu concurrenten voor deze markt toevoegen.</div> : null}
      {hasInvalidSelection ? <p role="alert" className="rounded-[12px] bg-[#fff3f4] px-4 py-3 text-[12px] text-[#913140]">Deze markt is niet actief voor je organisatie. Kies een actieve markt of voeg er één toe.</p> : null}

      <section className="ps-panel flex flex-wrap items-end justify-between gap-3 px-5 py-4 sm:px-6" aria-label="Markt selecteren en toevoegen">
        <div className="flex flex-wrap items-end gap-3">
          <CompetitorMarketPicker countries={countries} selected={selectedMarket?.code ?? 'alle'} />
          <div className="flex flex-col gap-1 pb-1 text-[11px] text-[#718197]">
            <span>{selectedMarket ? `Je bekijkt concurrenten in ${selectedMarket.name}.` : 'Je bekijkt de concurrenten van alle actieve markten.'}</span>
            {selectedMarket ? <Link href={`/producten?land=${encodeURIComponent(selectedMarket.id)}`} className="font-semibold text-[#356ccd]">Producten in {selectedMarket.name} bekijken</Link> : null}
          </div>
        </div>
        {canManageMarkets ? (
          <details className="group w-full max-w-[360px] rounded-[10px] border border-[#dbe4ef] bg-white p-3">
            <summary className="cursor-pointer text-[12px] font-semibold text-[#2f6edb]">+ Markt toevoegen</summary>
            {inactiveMarkets.length ? (
              <form action={activateCompanyCountryAction} className="mt-3 space-y-3">
                <input type="hidden" name="returnTo" value="concurrenten" />
                <label className="block space-y-1 text-[11px] font-medium text-[#4b5870]">
                  <span>Land activeren voor je organisatie</span>
                  <select name="countryId" className="toolbar-control w-full" defaultValue="" required>
                    <option value="" disabled>Kies een land</option>
                    {inactiveMarkets.map((country) => <option key={country.id} value={country.id}>{country.name} ({country.code})</option>)}
                  </select>
                </label>
                <p className="text-[10px] leading-4 text-[#748296]">Activatie is afhankelijk van het aantal toegestane markten in je licentie.</p>
                <button className="primary-action w-full" type="submit">Markt activeren</button>
              </form>
            ) : <p className="mt-2 text-[11px] text-[#718197]">Alle beschikbare markten zijn al geactiveerd.</p>}
            <Link href="/instellingen/markten" className="mt-3 inline-block text-[11px] font-semibold text-[#356ccd]">Markten en licentie bekijken</Link>
          </details>
        ) : (
          <p className="text-[11px] text-[#718197]">Nieuwe markten worden geactiveerd door een beheerder met instellingenrechten.</p>
        )}
      </section>

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1>Concurrenten</h1>
            <p className="mt-1 text-[12px] text-[#6f7d90]">Voeg concurrenten toe, controleer prijzen en beheer je productkoppelingen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite ? <Link href="/import" className="secondary-action">URLs importeren</Link> : null}
            <Link href="/productmatches" className="primary-action">Matches controleren</Link>
          </div>
        </div>
        <div className="grid border-t border-[#e7edf3] sm:grid-cols-2 xl:grid-cols-4">
          <div className="px-5 py-3.5 sm:px-6"><p className="text-[11px] font-medium text-[#7a8798]">Actieve concurrenten</p><p className="mt-1 text-[22px] font-semibold text-[#1e2d3f]">{formatNumber(competitors.filter((competitor) => competitor.isActive).length)}</p></div>
          <div className="px-5 py-3.5"><p className="text-[11px] font-medium text-[#7a8798]">Gekoppelde producten</p><p className="mt-1 text-[22px] font-semibold text-[#1e2d3f]">{formatNumber(linkedProducts)}</p></div>
          <div className="px-5 py-3.5"><p className="text-[11px] font-medium text-[#7a8798]">Geldige prijzen</p><p className="mt-1 text-[22px] font-semibold text-[#1e2d3f]">{formatNumber(validPrices)}</p></div>
          <div className="px-5 py-3.5"><p className="text-[11px] font-medium text-[#7a8798]">Aandacht nodig</p><p className={`mt-1 text-[22px] font-semibold ${failedSources ? 'text-[#b6414d]' : 'text-[#20814d]'}`}>{formatNumber(failedSources)}</p></div>
        </div>
      </section>

      {competitorsWithCurrentFailures > 0 ? (
        <div className="flex flex-col gap-2 rounded-[12px] border border-[#efc8cd] bg-[#fff3f4] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[12px] font-semibold text-[#913140]">{formatNumber(failedSources)} prijsbron{failedSources === 1 ? '' : 'nen'} vragen aandacht bij {formatNumber(competitorsWithCurrentFailures)} concurrent{competitorsWithCurrentFailures === 1 ? '' : 'en'}.</p>
            <p className="mt-0.5 text-[11px] text-[#81525a]">Dit gaat alleen over de laatste controle per bron, niet over oude fouten.</p>
          </div>
          <span className="text-[11px] font-medium text-[#81525a]">Open de concurrent voor de oorzaak</span>
        </div>
      ) : null}

      {canWrite ? (
        <details className="ps-panel group overflow-hidden" open={competitors.length === 0 && countries.length > 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div><h2 className="text-[14px] font-semibold text-[#23364d]">Concurrent toevoegen</h2><p className="mt-1 text-[11px] text-[#7a8798]">Naam, website, land en controlefrequentie. De gekozen markt wordt automatisch ingevuld.</p></div>
            <span className="secondary-action min-h-0 px-3 py-2 text-[11px] group-open:hidden">Openen</span>
            <span className="hidden text-[11px] font-semibold text-[#69798a] group-open:inline">Sluiten</span>
          </summary>
          <form action={createCompetitorAction} className="grid gap-3 border-t border-[#e7edf3] p-5 sm:grid-cols-2 lg:grid-cols-5">
            <fieldset disabled={!result.available || countries.length === 0} className="contents disabled:opacity-50">
              <label className="space-y-1.5 text-[11px] font-medium text-[#4b5870]"><span>Naam</span><input name="name" placeholder="Bijvoorbeeld Kruizinga" className="toolbar-control w-full" required /></label>
              <label className="space-y-1.5 text-[11px] font-medium text-[#4b5870] lg:col-span-2"><span>Website</span><input name="website" type="url" placeholder="https://www.concurrent.nl" className="toolbar-control w-full" required /></label>
              <label className="space-y-1.5 text-[11px] font-medium text-[#4b5870]"><span>Land</span><select name="countryId" className="toolbar-control w-full" defaultValue={selectedCountryId ?? (countries.length === 1 ? countries[0].id : '')} required><option value="" disabled>Kies land</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
              <label className="space-y-1.5 text-[11px] font-medium text-[#4b5870]"><span>Frequentie</span><select name="checkFrequencyHours" className="toolbar-control w-full" defaultValue="24"><option value="6">Iedere 6 uur</option><option value="12">Iedere 12 uur</option><option value="24">Dagelijks</option><option value="48">Iedere 2 dagen</option><option value="168">Wekelijks</option><option value="876000">Handmatig</option></select></label>
              <div className="flex justify-end sm:col-span-2 lg:col-span-5"><button className="primary-action">Toevoegen</button></div>
            </fieldset>
          </form>
        </details>
      ) : null}

      {selectedMarket && competitors.length === 0 ? (
        <p className="rounded-[10px] border border-[#dce6f3] bg-[#f5f9ff] px-4 py-3 text-[11px] leading-5 text-[#526984]">
          In {selectedMarket.name} staan nog geen concurrenten. Voeg hieronder een concurrent toe en koppel daarna product URL’s of een productfeed voor deze markt. Producten en prijzen uit andere landen worden niet automatisch overgenomen.
        </p>
      ) : null}

      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-[15px] font-semibold text-[#21364d]">{selectedMarket ? `Concurrenten in ${selectedMarket.name}` : 'Concurrenten'}</h2>
          <span className="text-[11px] text-[#748296]">{formatNumber(competitors.length)} concurrenten</span>
        </div>
        <DataTable
          emptyText={hasInvalidSelection ? 'Kies eerst een actieve markt.' : selectedMarket ? `Nog geen concurrenten in ${selectedMarket.name}. Voeg hierboven een concurrent toe.` : 'Nog geen concurrenten toegevoegd. Kies een markt en voeg je eerste concurrent toe.'}
          columns={[
            { key: 'naam', header: 'Concurrent' },
            { key: 'markt', header: 'Markt' },
            { key: 'producten', header: 'Producten' },
            { key: 'prijzen', header: 'Prijzen' },
            { key: 'status', header: 'Status' },
            { key: 'laatsteControle', header: 'Laatste controle' },
            { key: 'planning', header: 'Planning' },
            { key: 'actie', header: 'Beheer' },
          ]}
          rows={overview.map(({ competitor, metrics, latestChecks, failedChecks, lastAttempt, latestFailureReason }) => {
            const status = !competitor.isActive
              ? <span className="ps-chip">Gepauzeerd</span>
              : failedChecks.length > 0
              ? <div><span className="ps-chip ps-chip-red">{failedChecks.length} mislukt</span>{latestFailureReason ? <p className="mt-1 max-w-[230px] text-[10px] text-[#8d4652]">{latestFailureReason}</p> : null}</div>
              : latestChecks.length === 0 && metrics.linkedProducts > 0
                ? <span className="ps-chip ps-chip-amber">Nog niet gemeten</span>
                : metrics.linkedProducts === 0
                  ? <span className="ps-chip">Geen producten</span>
                  : <span className="ps-chip ps-chip-green">Actueel</span>

            return {
              naam: <Link href={`/concurrenten/${competitor.id}`} className="font-semibold text-[#2f6edb]">{competitor.name}</Link>,
              markt: competitor.country.name,
              producten: formatNumber(metrics.linkedProducts),
              prijzen: formatNumber(metrics.validPrices),
              status,
              laatsteControle: lastAttempt ? formatDate(lastAttempt) : 'Nog niet gecontroleerd',
              planning: frequencyLabel(competitor.checkFrequencyHours),
              actie: <CompetitorRowActions id={competitor.id} name={competitor.name} isActive={competitor.isActive} offerCount={competitor._count.offers} canWrite={canWrite} />,
            }
          })}
        />
      </section>
    </div>
  )
}
