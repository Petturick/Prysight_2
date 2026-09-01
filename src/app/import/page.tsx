export const dynamic = 'force-dynamic'
import Link from 'next/link'
import { ImportWizard } from '@/components/ImportWizard'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function ImportPage() {
  const result = await safeDatabaseQuery(() => prisma.importTask.findMany({
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  }), [])
  const tasks = result.data

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="eyebrow">Databeheer</p>
            <h1 className="mt-2 text-[29px] font-semibold tracking-[-0.035em] text-[#161a26]">Bulk import</h1>
            <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Importeer producten, eigen prijzen, concurrenten en concurrent URLs via CSV of Excel, controleer de automatische kolomkoppeling en bevestig pas na een preview.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/producten" className="secondary-action">Naar producten</Link>
            <Link href="/concurrenten" className="secondary-action">Naar concurrenten</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="strong-panel p-4">
          <p className="eyebrow">Productbron</p>
          <h2 className="mt-2 text-[14px] font-semibold text-[#252a37]">Producten en eigen prijzen</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">Gebruik artikelnummer, EAN, productnaam, productgroep, markt, eigen prijs en voorraad.</p>
        </div>
        <div className="strong-panel p-4">
          <p className="eyebrow">Concurrentbron</p>
          <h2 className="mt-2 text-[14px] font-semibold text-[#252a37]">Concurrent URLs en prijzen</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">Koppel concurrentnaam, product URL, actuele prijs en voorraad in bulk aan bestaande producten.</p>
        </div>
        <Link href="/feeds" className="strong-panel p-4 transition hover:-translate-y-0.5 hover:shadow-md">
          <p className="eyebrow">Doorlopend</p>
          <h2 className="mt-2 text-[14px] font-semibold text-[#252a37]">Feed in plaats van bestand</h2>
          <p className="mt-1 text-[10px] leading-5 text-[#8a93a5]">Voor terugkerende productdata kun je een feed koppelen en automatisch laten synchroniseren.</p>
          <p className="mt-3 text-[11px] font-semibold text-[var(--blue)]">Feeds beheren</p>
        </Link>
      </section>

      {result.available ? <ImportWizard /> : null}

      <div className="space-y-3">
        <div>
          <h2 className="text-[14px] font-semibold text-[#252a37]">Recente importtaken</h2>
          <p className="mt-1 text-[10px] text-[#8a93a5]">Controleer welke bestanden zijn verwerkt en of regels fouten hebben opgeleverd.</p>
        </div>
        <DataTable
          columns={[
            { key: 'bestand', header: 'Bestand' },
            { key: 'formaat', header: 'Formaat' },
            { key: 'status', header: 'Status' },
            { key: 'regels', header: 'Verwerkt / totaal' },
            { key: 'fouten', header: 'Fouten' },
            { key: 'gebruiker', header: 'Gebruiker' },
            { key: 'aangemaakt', header: 'Aangemaakt' },
          ]}
          rows={tasks.map((task) => ({
            bestand: task.filename,
            formaat: task.format,
            status: task.status,
            regels: `${formatNumber(task.processedRows)} / ${formatNumber(task.totalRows)}`,
            fouten: formatNumber(task.errorRows),
            gebruiker: task.user.name,
            aangemaakt: formatDate(task.createdAt),
          }))}
        />
      </div>
    </div>
  )
}
