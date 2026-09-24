export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ImportWizard } from '@/components/ImportWizard'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { requirePermission } from '@/lib/authz'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function ImportPage() {
  const actor = await requirePermission('imports.run')
  const result = await safeDatabaseQuery(() => prisma.importTask.findMany({
    where: { companyId: actor.companyId },
    include: { user: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  }), [])
  const tasks = result.data
  const successful = tasks.filter((task) => String(task.status).toUpperCase().includes('COMPLET') || String(task.status).toUpperCase().includes('SUCCESS')).length
  const withErrors = tasks.filter((task) => task.errorRows > 0).length

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="ps-panel overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div><p className="eyebrow">Databeheer</p><h1 className="mt-2">Importeren</h1><p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#66778a]">Voeg producten en concurrentiedata toe zonder technische omwegen. Kies een bestand, laat Prysight de kolommen herkennen, controleer de preview en importeer pas daarna.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/import/bulk" className="primary-action">Bulk productfeed</Link><Link href="/feeds" className="secondary-action">Doorlopende feed</Link><Link href="/producten" className="secondary-action">Producten bekijken</Link></div>
        </div>
        <div className="grid border-t border-[#e8edf3] sm:grid-cols-4">
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-semibold text-[#6f7b91]">Ondersteund</p><p className="mt-1 text-[21px] font-semibold text-[#17233a]">CSV en XLSX</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-semibold text-[#6f7b91]">Kolommen</p><p className="mt-1 text-[21px] font-semibold text-[#3d73d4]">Auto mapping</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-semibold text-[#6f7b91]">Recent geslaagd</p><p className="mt-1 text-[21px] font-semibold text-[#21835d]">{formatNumber(successful)}</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-semibold text-[#6f7b91]">Met fouten</p><p className={`mt-1 text-[22px] font-semibold ${withErrors ? 'text-[#b6414d]' : 'text-[#20814d]'}`}>{formatNumber(withErrors)}</p></div>
        </div>
      </section>

      {result.available ? <ImportWizard /> : null}

      <section className="grid gap-3 md:grid-cols-3" aria-label="Import routes">
        <Link href="/import/bulk" className="premium-decision-card p-4 transition hover:-translate-y-0.5"><p className="text-[10px] font-semibold text-[#8290a1]">Eenmalig of groot bestand</p><h2 className="mt-2 text-[14px] font-semibold text-[#25364b]">Bulk productfeed</h2><p className="mt-1.5 text-[11px] leading-5 text-[#748296]">Importeer een complete catalogus met automatische mapping en controle vóór verwerking.</p><p className="mt-3 text-[10px] font-semibold text-[#3d73d4]">Open bulkimport →</p></Link>
        <div className="premium-decision-card p-4"><p className="text-[10px] font-semibold text-[#8290a1]">Automatische herkenning</p><h2 className="mt-2 text-[14px] font-semibold text-[#25364b]">Velden laten koppelen</h2><p className="mt-1.5 text-[11px] leading-5 text-[#748296]">EAN, GTIN, prijs, voorraad en andere velden worden waar mogelijk automatisch herkend, zonder handmatige tussenstappen.</p></div>
        <Link href="/feeds" className="premium-decision-card p-4 transition hover:-translate-y-0.5"><p className="text-[10px] font-semibold text-[#8290a1]">Terugkerende bron</p><h2 className="mt-2 text-[14px] font-semibold text-[#25364b]">Doorlopende feed</h2><p className="mt-1.5 text-[11px] leading-5 text-[#748296]">Gebruik een feed wanneer dezelfde productbron periodiek moet synchroniseren.</p><p className="mt-3 text-[10px] font-semibold text-[#3d73d4]">Feeds beheren →</p></Link>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1"><div><h2 className="text-[15px] font-semibold text-[#25364b]">Recente importtaken</h2><p className="mt-1 text-[10px] font-semibold text-[#748296]">Controleer snel wat is verwerkt en waar nog fouten zitten.</p></div><span className="ps-chip ps-chip-blue">Laatste {tasks.length}</span></div>
        <DataTable columns={[{ key: 'bestand', header: 'Bestand' },{ key: 'formaat', header: 'Formaat' },{ key: 'status', header: 'Status' },{ key: 'regels', header: 'Verwerkt / totaal' },{ key: 'fouten', header: 'Fouten' },{ key: 'gebruiker', header: 'Gebruiker' },{ key: 'aangemaakt', header: 'Aangemaakt' }]} rows={tasks.map((task) => ({ bestand: task.filename, formaat: task.format, status: task.status, regels: `${formatNumber(task.processedRows)} / ${formatNumber(task.totalRows)}`, fouten: task.errorRows > 0 ? <span className="ps-chip ps-chip-red">{formatNumber(task.errorRows)}</span> : <span className="ps-chip ps-chip-green">0</span>, gebruiker: task.user.name, aangemaakt: formatDate(task.createdAt) }))} />
      </section>
    </div>
  )
}
