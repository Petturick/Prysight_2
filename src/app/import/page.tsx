export const dynamic = 'force-dynamic'
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
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <div>
        <h1 className="text-3xl font-semibold">Import</h1>
        <p className="mt-2 text-sm text-slate-600">Upload Prisync-bestanden, koppel kolommen en verwerk data gecontroleerd in de database.</p>
      </div>
      {result.available ? <ImportWizard /> : null}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Recente importtaken</h2>
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
