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

      <section className="strong-panel overflow-hidden">
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div><p className="eyebrow">Databeheer</p><h1 className="mt-2">Importeren</h1><p className="mt-2 max-w-3xl text-[12px] font-medium leading-6 text-[#66778a]">Voeg producten en concurrentiedata toe zonder technische omwegen. Kies een bestand, laat Prysight de kolommen herkennen, controleer de preview en importeer pas daarna.</p></div>
          <div className="flex flex-wrap gap-2"><Link href="/feeds" className="ps-button-orange">Doorlopende feed</Link><Link href="/producten" className="secondary-action">Producten bekijken</Link></div>
        </div>
        <div className="grid sm:grid-cols-4">
          <div className="px-5 py-4 sm:px-6"><p className="text-[10px] font-black text-[#6f7b91]">Ondersteund</p><p className="mt-1 text-[22px] font-black text-[#26394f]">CSV en XLSX</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black text-[#6f7b91]">Kolommen</p><p className="mt-1 text-[22px] font-black text-[#2f7edb]">Auto mapping</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black text-[#6f7b91]">Recent geslaagd</p><p className="mt-1 text-[22px] font-black text-[#20814d]">{formatNumber(successful)}</p></div>
          <div className="px-5 py-4"><p className="text-[10px] font-black text-[#6f7b91]">Met fouten</p><p className={`mt-1 text-[22px] font-black ${withErrors ? 'text-[#b6414d]' : 'text-[#20814d]'}`}>{formatNumber(withErrors)}</p></div>
        </div>
      </section>

      {result.available ? <ImportWizard /> : null}

      <section className="grid gap-3 md:grid-cols-3">
        <div className="ps-panel p-4"><div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#e8f2ff] text-[11px] font-black text-[#2f7edb]">1</div><h2 className="mt-3 text-[14px] font-black text-[#2c4058]">Eenmalige import</h2><p className="mt-1.5 text-[10px] font-semibold leading-5 text-[#748296]">Ideaal voor nieuwe catalogi, correcties en grote productupdates.</p></div>
        <div className="ps-panel p-4"><div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#eaf8f0] text-[11px] font-black text-[#20814d]">2</div><h2 className="mt-3 text-[14px] font-black text-[#2c4058]">Automatische herkenning</h2><p className="mt-1.5 text-[10px] font-semibold leading-5 text-[#748296]">EAN, GTIN, prijzen, marge, voorraad en concurrentvelden worden waar mogelijk zelf gekoppeld.</p></div>
        <Link href="/feeds" className="ps-panel p-4"><div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#fff4df] text-[11px] font-black text-[#a36816]">3</div><h2 className="mt-3 text-[14px] font-black text-[#2c4058]">Liever automatisch?</h2><p className="mt-1.5 text-[10px] font-semibold leading-5 text-[#748296]">Koppel een feed wanneer dezelfde bron regelmatig moet synchroniseren.</p><p className="mt-3 text-[10px] font-black text-[#2f7edb]">Feeds beheren →</p></Link>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1"><div><h2 className="text-[15px] font-black text-[#26394f]">Recente importtaken</h2><p className="mt-1 text-[10px] font-semibold text-[#748296]">Controleer snel wat is verwerkt en waar nog fouten zitten.</p></div><span className="ps-chip ps-chip-blue">Laatste {tasks.length}</span></div>
        <DataTable columns={[{ key: 'bestand', header: 'Bestand' },{ key: 'formaat', header: 'Formaat' },{ key: 'status', header: 'Status' },{ key: 'regels', header: 'Verwerkt / totaal' },{ key: 'fouten', header: 'Fouten' },{ key: 'gebruiker', header: 'Gebruiker' },{ key: 'aangemaakt', header: 'Aangemaakt' }]} rows={tasks.map((task) => ({ bestand: task.filename, formaat: task.format, status: task.status, regels: `${formatNumber(task.processedRows)} / ${formatNumber(task.totalRows)}`, fouten: task.errorRows > 0 ? <span className="ps-chip ps-chip-red">{formatNumber(task.errorRows)}</span> : <span className="ps-chip ps-chip-green">0</span>, gebruiker: task.user.name, aangemaakt: formatDate(task.createdAt) }))} />
      </section>
    </div>
  )
}
