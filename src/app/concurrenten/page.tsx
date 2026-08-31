export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { MANUAL_CHECK_FREQUENCY_HOURS, updateCompetitorFrequencyAction } from '@/app/actions/productActions'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { deriveCompetitorMetrics, getCompetitorsOverview } from '@/lib/dashboard'
import { formatDate, formatNumber } from '@/lib/format'
import { safeDatabaseQuery } from '@/lib/safe-database'

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

export default async function ConcurrentenPage() {
  const result = await safeDatabaseQuery(() => getCompetitorsOverview(), [])
  const competitors = result.data

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <section className="strong-panel px-5 py-5 sm:px-6">
        <p className="eyebrow">Prijsmonitoring</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">Concurrenten en frequentie</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Bepaal per concurrent hoe vaak Prysight automatisch prijzen opnieuw controleert. Handmatig controleren op productniveau blijft altijd mogelijk.</p>
          </div>
          <div className="rounded-xl border border-[#dbe3f4] bg-[var(--blue-soft)] px-4 py-3 text-[10px] leading-5 text-[#51617d]">
            <strong className="block text-[11px] text-[#35405a]">Automatisch plus handmatig</strong>
            Een handmatige controle overschrijft de planning niet. De volgende automatische controle blijft gebaseerd op de gekozen frequentie.
          </div>
        </div>
      </section>

      <DataTable
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
            instellen: (
              <form action={updateCompetitorFrequencyAction} className="flex min-w-[230px] items-center gap-2">
                <input type="hidden" name="competitorId" value={competitor.id} />
                <select name="checkFrequencyHours" defaultValue={String(competitor.checkFrequencyHours)} className="toolbar-control min-w-[145px] py-2 text-[10px]">
                  <option value="876000">Handmatig</option>
                  <option value="6">Iedere 6 uur</option>
                  <option value="12">Iedere 12 uur</option>
                  <option value="24">Dagelijks</option>
                  <option value="48">Iedere 2 dagen</option>
                  <option value="168">Wekelijks</option>
                </select>
                <button className="secondary-action min-h-0 px-3 py-2 text-[10px]">Opslaan</button>
              </form>
            ),
          }
        })}
      />

      <div className="rounded-[14px] border border-[var(--border)] bg-white px-4 py-4 text-[10px] leading-5 text-[#7d8698]">
        <strong className="text-[#4f5869]">Handmatig betekent:</strong> Prysight plant praktisch geen automatische controle voor die concurrent. Open een gekoppeld product en kies <strong>Prijzen nu controleren</strong> wanneer je zelf een nieuwe meting wilt uitvoeren.
      </div>
    </div>
  )
}
