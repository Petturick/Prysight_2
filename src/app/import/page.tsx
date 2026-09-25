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

  return (
    <div className="space-y-4">
      {!result.available && <DatabaseNotice />}

      <section className="grid gap-2 sm:grid-cols-2">
        <Link href="/import/bulk" className="premium-decision-card flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <h2 className="text-[13px] font-semibold text-[#25364b]">Bestand importeren</h2>
            <p className="mt-1 text-[11px] text-[#7a8798]">CSV of Excel</p>
          </div>
          <span className="text-[#98a2b3]">›</span>
        </Link>
        <Link href="/feeds" className="premium-decision-card flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <h2 className="text-[13px] font-semibold text-[#25364b]">Doorlopende feed</h2>
            <p className="mt-1 text-[11px] text-[#7a8798]">Automatisch synchroniseren</p>
          </div>
          <span className="text-[#98a2b3]">›</span>
        </Link>
      </section>

      {result.available ? <ImportWizard /> : null}

      <details className="ps-panel overflow-hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <h2 className="text-[14px] font-semibold text-[#25364b]">Recente imports</h2>
          <span className="text-[11px] font-medium text-[#7a8798]">{formatNumber(tasks.length)}</span>
        </summary>
        <div className="border-t border-[#edf0f3]">
          <DataTable
            columns={[
              { key: 'bestand', header: 'Bestand' },
              { key: 'status', header: 'Status' },
              { key: 'regels', header: 'Verwerkt' },
              { key: 'fouten', header: 'Fouten' },
              { key: 'aangemaakt', header: 'Aangemaakt' },
            ]}
            rows={tasks.map((task) => ({
              bestand: task.filename,
              status: task.status,
              regels: `${formatNumber(task.processedRows)} / ${formatNumber(task.totalRows)}`,
              fouten: task.errorRows > 0 ? <span className="ps-chip ps-chip-red">{formatNumber(task.errorRows)}</span> : <span className="ps-chip ps-chip-green">0</span>,
              aangemaakt: formatDate(task.createdAt),
            }))}
          />
        </div>
      </details>
    </div>
  )
}
