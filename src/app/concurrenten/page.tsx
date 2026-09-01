export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { createCompetitorAction, updateCompetitorFrequencyAction } from '@/app/actions/productActions'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requireAuthenticatedUser } from '@/lib/authz'
import { deriveCompetitorMetrics } from '@/lib/dashboard'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

const MANUAL_CHECK_FREQUENCY_HOURS = 876000

function frequencyLabel(hours: number) {
  if (hours >= MANUAL_CHECK_FREQUENCY_HOURS) return 'Handmatig'
  if (hours === 6) return 'Iedere 6 uur'
  if (hours === 12) return 'Iedere 12 uur'
  if (hours === 24) return 'Dagelijks'
  if (hours === 48) return 'Iedere 2 dagen'
  if (hours === 168) return 'Wekelijks'
  return `Iedere ${hours} uur`
}

function nextCheckAt(lastCheckedAt: Date | null, frequencyHours: number) {
  if (frequencyHours >= MANUAL_CHECK_FREQUENCY_HOURS) return null
  if (!lastCheckedAt) return new Date()
  return new Date(lastCheckedAt.getTime() + frequencyHours * 60 * 60 * 1000)
}

export default async function ConcurrentenPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const user = await requireAuthenticatedUser()
  const canWrite = user.role !== 'READONLY' && user.membershipRole !== 'READONLY'
  const result = await safeDatabaseQuery(async () => {
    const [competitors, companyCountries] = await Promise.all([
      prisma.competitor.findMany({
        where: { companyId: user.companyId, isActive: true },
        include: {
          country: true,
          offers: {
            where: { isActive: true },
            include: {
              productMatch: { include: { product: true } },
              priceChecks: { orderBy: { checkedAt: 'desc' }, take: 20 },
              priceHistory: { orderBy: { recordedAt: 'desc' }, take: 2 },
            },
          },
        },
        orderBy: [{ country: { name: 'asc' } }, { name: 'asc' }],
      }),
      prisma.companyCountry.findMany({
        where: { companyId: user.companyId, isActive: true, country: { isActive: true } },
        include: { country: true },
        orderBy: { country: { name: 'asc' } },
      }),
    ])
    return { competitors, countries: companyCountries.map((item) => item.country) }
  }, { competitors: [], countries: [] })
  const { competitors, countries } = result.data
  const added = params.toegevoegd === '1'

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}
      {added ? <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[11px] font-medium text-emerald-800">Concurrent is opgeslagen en staat klaar om product URLs te koppelen.</div> : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Prijsmonitoring</p>
            <h1 className="mt-2 text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">Concurrenten en frequentie</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Voeg concurrenten toe per markt, bepaal de controlefrequentie en koppel product URLs voor automatische prijscontroles.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite ? <Link href="/import" className="secondary-action">Concurrent URLs bulk importeren</Link> : null}
            <Link href="/productmatches" className="secondary-action">Matches controleren</Link>
          </div>
        </div>
        <div className="grid border-t border-[var(--border)] sm:grid-cols-3">
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Concurrenten</p><p className="mt-1 text-[23px] font-semibold tracking-[-0.03em] text-[#202536]">{formatNumber(competitors.length)}</p></div>
          <div className="border-y border-[var(--border)] px-5 py-4 sm:border-x sm:border-y-0 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Markten</p><p className="mt-1 text-[23px] font-semibold tracking-[-0.03em] text-[#202536]">{formatNumber(new Set(competitors.map((competitor) => competitor.country.id)).size)}</p></div>
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8a93a5]">Gekoppelde producten</p><p className="mt-1 text-[23px] font-semibold tracking-[-0.03em] text-[#202536]">{formatNumber(competitors.reduce((sum, competitor) => sum + deriveCompetitorMetrics(competitor).linkedProducts, 0))}</p></div>
        </div>
      </section>

      {canWrite ? <details className="strong-panel group overflow-hidden" open={competitors.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 sm:px-6">
          <div><h2 className="text-[14px] font-semibold text-[#252a37]">Concurrent toevoegen</h2><p className="mt-1 text-[10px] text-[#8a93a5]">Naam, website, land en standaard controlefrequentie vastleggen.</p></div>
          <span className="rounded-lg bg-[var(--blue-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--blue)] group-open:hidden">Open formulier</span>
          <span className="hidden rounded-lg bg-[#f1f3f6] px-3 py-2 text-[11px] font-semibold text-[#697386] group-open:inline-flex">Sluiten</span>
        </summary>
        <form action={createCompetitorAction} className="grid gap-3 border-t border-[var(--border)] p-5 sm:grid-cols-2 lg:grid-cols-5 sm:p-6">
          <fieldset disabled={!result.available || countries.length === 0} className="contents disabled:opacity-50">
            <label className="space-y-1.5 text-[11px] font-semibold text-[#697386]"><span>Naam</span><input name="name" placeholder="Bijvoorbeeld Kruizinga" className="toolbar-control w-full" required /></label>
            <label className="space-y-1.5 text-[11px] font-semibold text-[#697386] lg:col-span-2"><span>Website</span><input name="website" type="url" placeholder="https://www.concurrent.nl" className="toolbar-control w-full" required /></label>
            <label className="space-y-1.5 text-[11px] font-semibold text-[#697386]"><span>Land</span><select name="countryId" className="toolbar-control w-full" defaultValue="" required><option value="" disabled>Kies land</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
            <label className="space-y-1.5 text-[11px] font-semibold text-[#697386]"><span>Controlefrequentie</span><select name="checkFrequencyHours" className="toolbar-control w-full" defaultValue="24"><option value="6">Iedere 6 uur</option><option value="12">Iedere 12 uur</option><option value="24">Dagelijks</option><option value="48">Iedere 2 dagen</option><option value="168">Wekelijks</option><option value="876000">Handmatig</option></select></label>
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center lg:col-span-5"><p className="flex-1 text-[10px] leading-5 text-[#8a93a5]">Na opslaan kom je terug op deze pagina met een bevestiging. Daarna kun je losse product URLs koppelen of via Bulk import meerdere URLs tegelijk toevoegen.</p><button className="primary-action">Concurrent opslaan</button></div>
          </fieldset>
        </form>
      </details> : <div className="rounded-[14px] border border-[var(--border)] bg-white px-4 py-3 text-[11px] text-[#697386]">Je account heeft leesrechten. Bekijken en analyseren kan wel, wijzigingen opslaan niet.</div>}

      <section className="strong-panel px-4 py-4 text-[10px] leading-5 text-[#51617d]">
        <strong className="block text-[11px] text-[#35405a]">Automatisch plus handmatig</strong>
        Een handmatige controle overschrijft de planning niet, de volgende automatische controle blijft gebaseerd op de gekozen frequentie.
      </section>

      <DataTable
        emptyText="Nog geen concurrenten toegevoegd. Gebruik Concurrent toevoegen om de eerste website vast te leggen."
        columns={[
          { key: 'naam', header: 'Naam' },
          { key: 'markt', header: 'Markt' },
          { key: 'producten', header: 'Producten' },
          { key: 'prijzen', header: 'Geldige prijzen' },
          { key: 'frequentie', header: 'Controlefrequentie' },
          { key: 'laatsteControle', header: 'Laatste controle' },
          { key: 'volgendeControle', header: 'Volgende controle' },
          { key: 'fouten', header: '% mislukt' },
          { key: 'instellen', header: 'Frequentie instellen' },
        ]}
        rows={competitors.map((competitor) => {
          const metrics = deriveCompetitorMetrics(competitor)
          const nextCheck = nextCheckAt(metrics.lastChecked, competitor.checkFrequencyHours)
          return {
            naam: <Link href={`/concurrenten/${competitor.id}`} className="font-medium text-sky-700">{competitor.name}</Link>,
            markt: competitor.country.name,
            producten: formatNumber(metrics.linkedProducts),
            prijzen: formatNumber(metrics.validPrices),
            frequentie: <span className="inline-flex rounded-full bg-[#f1f3f6] px-2.5 py-1 text-[10px] font-semibold text-[#596476]">{frequencyLabel(competitor.checkFrequencyHours)}</span>,
            laatsteControle: formatDate(metrics.lastChecked),
            volgendeControle: competitor.checkFrequencyHours >= MANUAL_CHECK_FREQUENCY_HOURS ? 'Alleen handmatig' : metrics.lastChecked ? formatDate(nextCheck) : 'Bij eerstvolgende scheduler run',
            fouten: metrics.failedRate === null ? '—' : `${formatNumber(metrics.failedRate, 1)}%`,
            instellen: canWrite ? (
              <form action={updateCompetitorFrequencyAction} className="flex min-w-[230px] items-center gap-2">
                <input type="hidden" name="competitorId" value={competitor.id} />
                <select name="checkFrequencyHours" defaultValue={String(competitor.checkFrequencyHours)} className="toolbar-control min-w-[145px] py-2 text-[10px]">
                  <option value="876000">Handmatig</option><option value="6">Iedere 6 uur</option><option value="12">Iedere 12 uur</option><option value="24">Dagelijks</option><option value="48">Iedere 2 dagen</option><option value="168">Wekelijks</option>
                </select>
                <button className="secondary-action min-h-0 px-3 py-2 text-[10px]">Opslaan</button>
              </form>
            ) : <span className="text-[10px] text-[#8a93a5]">Alleen lezen</span>,
          }
        })}
      />

      <div className="rounded-[14px] border border-[var(--border)] bg-white px-4 py-4 text-[10px] leading-5 text-[#7d8698]">
        <strong className="text-[#4f5869]">Handmatig betekent:</strong> Prysight plant praktisch geen automatische controle voor die concurrent, open een gekoppeld product en kies <strong>Prijzen nu controleren</strong> wanneer je zelf een nieuwe meting wilt uitvoeren.
      </div>
    </div>
  )
}
