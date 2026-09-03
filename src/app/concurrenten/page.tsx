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
  const metrics = competitors.map((competitor) => ({ competitor, metrics: deriveCompetitorMetrics(competitor) }))
  const linkedProducts = metrics.reduce((sum, item) => sum + item.metrics.linkedProducts, 0)
  const validPrices = metrics.reduce((sum, item) => sum + item.metrics.validPrices, 0)
  const competitorsWithFailures = metrics.filter((item) => (item.metrics.failedRate ?? 0) > 0).length
  const manualCompetitors = competitors.filter((competitor) => competitor.checkFrequencyHours >= MANUAL_CHECK_FREQUENCY_HOURS).length

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}
      {added ? <div className="rounded-[14px] border-2 border-[#0d7a49] bg-[#d9f0e4] px-4 py-3 text-[11px] font-bold text-[#065f38]">Concurrent opgeslagen, koppel nu product URLs zodat monitoring daadwerkelijk kan starten.</div> : null}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Prijsmonitoring</p>
            <h1 className="mt-2">Concurrenten</h1>
            <p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#4b5870]">Beheer concurrenten, meetfrequentie en URL dekking, met technische problemen direct zichtbaar.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canWrite ? <Link href="/import" className="primary-action">URLs bulk importeren</Link> : null}
            <Link href="/productmatches" className="secondary-action">Matches controleren</Link>
          </div>
        </div>
        <div className="grid border-t-2 border-[var(--border-strong)] sm:grid-cols-4">
          <div className="bg-[#111827] px-5 py-4 text-white sm:px-6"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#cbd5e1]">Concurrenten</p><p className="mt-1 text-[27px] font-black">{formatNumber(competitors.length)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Gekoppelde producten</p><p className="mt-1 text-[27px] font-black text-[#111827]">{formatNumber(linkedProducts)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Geldige prijzen</p><p className="mt-1 text-[27px] font-black text-[#0d7a49]">{formatNumber(validPrices)}</p></div>
          <div className="border-t-2 border-[var(--border-strong)] px-5 py-4 sm:border-l-2 sm:border-t-0"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6f7b91]">Met fouten</p><p className={`mt-1 text-[27px] font-black ${competitorsWithFailures ? 'text-[#b4233d]' : 'text-[#0d7a49]'}`}>{formatNumber(competitorsWithFailures)}</p></div>
        </div>
      </section>

      {(competitorsWithFailures > 0 || manualCompetitors > 0) ? <section className="grid gap-3 md:grid-cols-2">
        {competitorsWithFailures > 0 ? <div className="rounded-[14px] border-2 border-[#b4233d] bg-[#f6d7dd] p-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#8e1d32]">Actie vereist</p><h2 className="mt-1 text-[15px] font-black text-[#681426]">{formatNumber(competitorsWithFailures)} concurrenten hebben mislukte controles</h2><p className="mt-1 text-[11px] font-semibold text-[#7a2638]">Open de betreffende concurrent en controleer URL, bereikbaarheid en laatste metingen.</p></div> : null}
        {manualCompetitors > 0 ? <div className="rounded-[14px] border-2 border-[#9a5b00] bg-[#f8e4bd] p-4"><p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#7b4700]">Handmatige planning</p><h2 className="mt-1 text-[15px] font-black text-[#5f3900]">{formatNumber(manualCompetitors)} concurrenten worden niet automatisch gecontroleerd</h2><p className="mt-1 text-[11px] font-semibold text-[#704913]">Gebruik dit alleen bewust, anders ontstaan ongemerkt verouderde prijzen.</p></div> : null}
      </section> : null}

      {canWrite ? <details className="strong-panel group overflow-hidden" open={competitors.length === 0}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 bg-[#edf1f6] px-5 py-4 sm:px-6">
          <div><h2 className="text-[14px] font-black text-[#111827]">Concurrent toevoegen</h2><p className="mt-1 text-[11px] font-semibold text-[#647087]">Leg alleen de basis vast, product URLs koppel je daarna gericht of via bulk import.</p></div>
          <span className="rounded-[8px] bg-[#2457d6] px-3 py-2 text-[10px] font-black text-white group-open:hidden">Open formulier</span>
          <span className="hidden rounded-[8px] bg-[#dfe4ee] px-3 py-2 text-[10px] font-black text-[#334155] group-open:inline-flex">Sluiten</span>
        </summary>
        <form action={createCompetitorAction} className="grid gap-3 border-t-2 border-[var(--border-strong)] p-5 sm:grid-cols-2 lg:grid-cols-5 sm:p-6">
          <fieldset disabled={!result.available || countries.length === 0} className="contents disabled:opacity-50">
            <label className="space-y-1.5 text-[11px] font-bold text-[#4b5870]"><span>Naam</span><input name="name" placeholder="Bijvoorbeeld Kruizinga" className="toolbar-control w-full" required /></label>
            <label className="space-y-1.5 text-[11px] font-bold text-[#4b5870] lg:col-span-2"><span>Website</span><input name="website" type="url" placeholder="https://www.concurrent.nl" className="toolbar-control w-full" required /></label>
            <label className="space-y-1.5 text-[11px] font-bold text-[#4b5870]"><span>Land</span><select name="countryId" className="toolbar-control w-full" defaultValue="" required><option value="" disabled>Kies land</option>{countries.map((country) => <option key={country.id} value={country.id}>{country.name}</option>)}</select></label>
            <label className="space-y-1.5 text-[11px] font-bold text-[#4b5870]"><span>Controlefrequentie</span><select name="checkFrequencyHours" className="toolbar-control w-full" defaultValue="24"><option value="6">Iedere 6 uur</option><option value="12">Iedere 12 uur</option><option value="24">Dagelijks</option><option value="48">Iedere 2 dagen</option><option value="168">Wekelijks</option><option value="876000">Handmatig</option></select></label>
            <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center lg:col-span-5"><p className="flex-1 text-[10px] font-semibold leading-5 text-[#6f7b91]">Na opslaan koppel je product URLs. Zonder URL koppeling kan Prysight geen prijzen meten.</p><button className="primary-action">Concurrent opslaan</button></div>
          </fieldset>
        </form>
      </details> : <div className="rounded-[14px] border-2 border-[var(--border)] bg-white px-4 py-3 text-[11px] font-semibold text-[#647087]">Je account heeft leesrechten, bekijken en analyseren kan wel, wijzigen niet.</div>}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1"><div><h2 className="text-[15px] font-black text-[#111827]">Monitoring per concurrent</h2><p className="mt-1 text-[11px] font-semibold text-[#647087]">Fouten, dekking en planning staan nu naast elkaar zodat je direct ziet waar actie nodig is.</p></div></div>
        <DataTable
          emptyText="Nog geen concurrenten toegevoegd. Voeg eerst een concurrent toe om monitoring op te bouwen."
          columns={[
            { key: 'naam', header: 'Concurrent' }, { key: 'markt', header: 'Markt' }, { key: 'producten', header: 'Producten' }, { key: 'prijzen', header: 'Geldige prijzen' }, { key: 'fouten', header: 'Mislukt' }, { key: 'frequentie', header: 'Frequentie' }, { key: 'laatsteControle', header: 'Laatste controle' }, { key: 'volgendeControle', header: 'Volgende controle' }, { key: 'instellen', header: 'Instellen' },
          ]}
          rows={metrics.map(({ competitor, metrics }) => {
            const nextCheck = nextCheckAt(metrics.lastChecked, competitor.checkFrequencyHours)
            const failureRate = metrics.failedRate ?? 0
            return {
              naam: <Link href={`/concurrenten/${competitor.id}`} className="font-black text-[var(--blue)]">{competitor.name}</Link>,
              markt: competitor.country.name,
              producten: formatNumber(metrics.linkedProducts),
              prijzen: <span className="font-black text-[#0d7a49]">{formatNumber(metrics.validPrices)}</span>,
              fouten: metrics.failedRate === null ? '—' : <span className={`inline-flex rounded-[7px] px-2 py-1 text-[9px] font-black ${failureRate > 0 ? 'bg-[#b4233d] text-white' : 'bg-[#0d7a49] text-white'}`}>{formatNumber(failureRate, 1)}%</span>,
              frequentie: <span className={`inline-flex rounded-[7px] px-2.5 py-1 text-[9px] font-black ${competitor.checkFrequencyHours >= MANUAL_CHECK_FREQUENCY_HOURS ? 'bg-[#f8e4bd] text-[#7b4700]' : 'bg-[#dfe8ff] text-[#1b43a6]'}`}>{frequencyLabel(competitor.checkFrequencyHours)}</span>,
              laatsteControle: formatDate(metrics.lastChecked),
              volgendeControle: competitor.checkFrequencyHours >= MANUAL_CHECK_FREQUENCY_HOURS ? 'Alleen handmatig' : metrics.lastChecked ? formatDate(nextCheck) : 'Eerstvolgende scheduler run',
              instellen: canWrite ? <form action={updateCompetitorFrequencyAction} className="flex min-w-[230px] items-center gap-2"><input type="hidden" name="competitorId" value={competitor.id} /><select name="checkFrequencyHours" defaultValue={String(competitor.checkFrequencyHours)} className="toolbar-control min-w-[145px] py-2 text-[10px]"><option value="876000">Handmatig</option><option value="6">Iedere 6 uur</option><option value="12">Iedere 12 uur</option><option value="24">Dagelijks</option><option value="48">Iedere 2 dagen</option><option value="168">Wekelijks</option></select><button className="secondary-action min-h-0 px-3 py-2 text-[10px]">Opslaan</button></form> : <span className="text-[10px] font-semibold text-[#6f7b91]">Alleen lezen</span>,
            }
          })}
        />
      </section>

      <div className="rounded-[14px] border-2 border-[#94a0b5] bg-[#edf1f6] px-4 py-3 text-[11px] font-semibold leading-5 text-[#4b5870]">Een handmatige controle verandert de ingestelde automatische planning niet, behalve wanneer de concurrent bewust op <strong>Handmatig</strong> staat.</div>
    </div>
  )
}
