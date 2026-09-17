export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { createCompetitorAction } from '@/app/actions/productActions'
import { DataTable } from '@/components/DataTable'
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
  const canWrite = user.role !== 'READONLY' && user.membershipRole !== 'READONLY'

  const result = await profileStep('/concurrenten', 'overview', () => safeDatabaseQuery(async () => {
    const [competitors, companyCountries] = await Promise.all([
      prisma.competitor.findMany({
        relationLoadStrategy: 'join',
        where: { companyId: user.companyId, isActive: true },
        include: {
          country: true,
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
      }),
      prisma.companyCountry.findMany({
        relationLoadStrategy: 'join',
        where: { companyId: user.companyId, isActive: true, country: { isActive: true } },
        include: { country: true },
        orderBy: { country: { name: 'asc' } },
      }),
    ])
    return { competitors, countries: companyCountries.map((item) => item.country) }
  }, { competitors: [], countries: [] }), { companyId: user.companyId }, 300)

  const { competitors, countries } = result.data
  const added = params.toegevoegd === '1'
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

  const linkedProducts = overview.reduce((sum, item) => sum + item.metrics.linkedProducts, 0)
  const validPrices = overview.reduce((sum, item) => sum + item.metrics.validPrices, 0)
  const failedSources = overview.reduce((sum, item) => sum + item.failedChecks.length, 0)
  const competitorsWithCurrentFailures = overview.filter((item) => item.failedChecks.length > 0).length

  return (
    <div className="space-y-4">
      {!result.available && <DatabaseNotice />}
      {added ? <div className="rounded-[12px] bg-[#eaf8f0] px-4 py-3 text-[12px] font-semibold text-[#176a42]">Concurrent toegevoegd. Koppel nu één of meer product URLs.</div> : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1>Markt</h1>
            <p className="mt-1 text-[12px] text-[#6f7d90]">Concurrenten, prijsbronnen en meetstatus.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite ? <Link href="/import" className="secondary-action">URLs importeren</Link> : null}
            <Link href="/productmatches" className="primary-action">Matches controleren</Link>
          </div>
        </div>
        <div className="grid border-t border-[#e7edf3] sm:grid-cols-2 xl:grid-cols-4">
          <div className="px-5 py-3.5 sm:px-6"><p className="text-[11px] font-medium text-[#7a8798]">Concurrenten</p><p className="mt-1 text-[22px] font-semibold text-[#1e2d3f]">{formatNumber(competitors.length)}</p></div>
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
        <details className="ps-panel group overflow-hidden" open={competitors.length === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
            <div><h2 className="text-[14px] font-semibold text-[#23364d]">Concurrent toevoegen</h2><p className="mt-1 text-[11px] text-[#7a8798]">Naam, website, markt en controlefrequentie.</p></div>
            <span className="secondary-action min-h-0 px-3 py-2 text-[11px] group-open:hidden">Openen</span>
            <span className="hidden text-[11px] font-semibold text-[#69798a] group-open:inline">Sluiten</span>
          </summary>
          <form action={createCompetitorAction} className="grid gap-3 border-t border-[#e7edf3] p-5 sm:grid-cols-2 lg:grid-cols-5">
            <fieldset disabled={!result.available || countries.length === 0} className="contents disabled:opacity-50">
              <label className="space-y-1.5 text-[11px] font-medium text-[#4b5870]"><span>Naam</span><input name="name" placeholder="Bijvoorbeeld Kruizinga" className="toolbar-control w-full" required /></label>
              <label className="space-y-1.5 text-[11px] font-medium text-[#4b5870] lg:col-span-2"><span>Website</span><input name="website" type="url" placeholder="https://www.concurrent.nl" className="toolbar-control w-full" required /></label>
              <label className="space-y-1.5 text-[11px] font-medium text-[#4b5870]"><span>Land</span><select name="countryId" className="toolbar-control w-full" defaultValue="" required><option value="" disabled>Kies land</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
              <label className="space-y-1.5 text-[11px] font-medium text-[#4b5870]"><span>Frequentie</span><select name="checkFrequencyHours" className="toolbar-control w-full" defaultValue="24"><option value="6">Iedere 6 uur</option><option value="12">Iedere 12 uur</option><option value="24">Dagelijks</option><option value="48">Iedere 2 dagen</option><option value="168">Wekelijks</option><option value="876000">Handmatig</option></select></label>
              <div className="flex justify-end sm:col-span-2 lg:col-span-5"><button className="primary-action">Toevoegen</button></div>
            </fieldset>
          </form>
        </details>
      ) : null}

      <section className="space-y-2.5">
        <div className="px-1"><h2 className="text-[15px] font-semibold text-[#21364d]">Concurrenten</h2></div>
        <DataTable
          emptyText="Nog geen concurrenten toegevoegd."
          columns={[
            { key: 'naam', header: 'Concurrent' },
            { key: 'markt', header: 'Markt' },
            { key: 'producten', header: 'Producten' },
            { key: 'prijzen', header: 'Prijzen' },
            { key: 'status', header: 'Status' },
            { key: 'laatsteControle', header: 'Laatste controle' },
            { key: 'planning', header: 'Planning' },
            { key: 'actie', header: '' },
          ]}
          rows={overview.map(({ competitor, metrics, latestChecks, failedChecks, lastAttempt, latestFailureReason }) => {
            const status = failedChecks.length > 0
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
              actie: <Link href={`/concurrenten/${competitor.id}`} className="secondary-action min-h-0 px-3 py-2 text-[10px]">Bekijken</Link>,
            }
          })}
        />
      </section>
    </div>
  )
}
