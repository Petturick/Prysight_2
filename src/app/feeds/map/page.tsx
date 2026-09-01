export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { FeedMappingEditor } from '@/components/FeedMappingEditor'
import { FeedSourceActions } from '@/components/FeedSourceActions'
import { FeedTabs } from '@/components/FeedTabs'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function FeedMapPage({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const params = await searchParams
  const result = await safeDatabaseQuery(
    () => prisma.feedSource.findMany({
      include: {
        runs: { orderBy: { startedAt: 'desc' }, take: 1 },
        columns: { where: { isActive: true }, orderBy: { position: 'asc' } },
      },
      orderBy: { name: 'asc' },
    }),
    [],
  )
  const selected = result.data.find((source) => source.id === params.source) ?? result.data[0] ?? null

  return (
    <div className="space-y-5">
      {!result.available && <DatabaseNotice />}

      <section className="surface-card overflow-hidden">
        <div className="px-5 py-5 sm:px-6">
          <p className="eyebrow">Feeds</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#161a26]">Feed map</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#697386]">Beheer bronfeeds en koppel bronkolommen aan de vaste Prysight velden. Kolommen worden na een feedrun automatisch herkend en kunnen hier gecontroleerd en aangepast worden.</p>
        </div>
        <FeedTabs />
      </section>

      <section className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[11px]">
            <thead className="border-b border-[var(--border)] bg-[#fbfcfe] text-[#7d8698]">
              <tr><th className="px-4 py-3 font-medium">Bron</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Land</th><th className="px-4 py-3 font-medium">Laatste run</th><th className="px-4 py-3 font-medium">Regels</th><th className="px-4 py-3 font-medium">Mapping</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Acties</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {result.data.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-[#98a2b3]">Nog geen feedbronnen. Voeg eerst een feed toe onder Feedbeheer.</td></tr>
              ) : result.data.map((source) => {
                const mappedColumns = source.columns.filter((column) => Boolean(column.targetField)).length
                return (
                  <tr key={source.id} className={`text-[#4f586a] ${selected?.id === source.id ? 'bg-[#fbfcff]' : ''}`}>
                    <td className="px-4 py-3"><Link href={`/feeds/data?source=${source.id}`} className="font-semibold text-[#303647] hover:text-[var(--blue)]">{source.name}</Link><p className="mt-1 max-w-[320px] truncate text-[10px] text-[#98a2b3]">{source.url ?? source.sourceKey}</p></td>
                    <td className="px-4 py-3">{source.sourceType}<br/><span className="text-[10px] text-[#98a2b3]">{source.format ?? '—'}</span></td>
                    <td className="px-4 py-3">{source.countryCode}</td>
                    <td className="px-4 py-3">{formatDate(source.lastRunAt)}</td>
                    <td className="px-4 py-3">{formatNumber(source.lastItemCount)}<br/><span className="text-[10px] text-[#b26b2b]">{formatNumber(source.lastErrorCount)} fouten</span></td>
                    <td className="px-4 py-3"><Link href={`/feeds/map?source=${source.id}`} className="font-semibold text-[var(--blue)] hover:underline">{mappedColumns}/{source.columns.length} gekoppeld</Link></td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${source.lastRunStatus === 'FAILED' ? 'bg-[var(--accent-soft)] text-[#b4233d]' : source.isActive ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-[#f2f4f7] text-[#7d8698]'}`}>{source.isActive ? source.lastRunStatus : 'GEPAUZEERD'}</span></td>
                    <td className="px-4 py-3"><FeedSourceActions id={source.id} isActive={source.isActive} canSync={source.sourceType === 'URL'} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        selected.columns.length > 0 ? (
          <FeedMappingEditor sourceId={selected.id} sourceName={selected.name} columns={selected.columns} />
        ) : (
          <section className="surface-card px-5 py-8 text-center text-[12px] text-[#697386]">
            Voor deze feed zijn nog geen bronkolommen beschikbaar. Voer eerst een synchronisatie uit, daarna kan Prysight de kolommen automatisch herkennen.
          </section>
        )
      ) : null}
    </div>
  )
}
