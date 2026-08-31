export const dynamic = 'force-dynamic'

import { DatabaseNotice } from '@/components/DatabaseNotice'
import { FeedTabs } from '@/components/FeedTabs'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function FeedDiagnosePage() {
  const result = await safeDatabaseQuery(async () => {
    const [sources, runs] = await Promise.all([prisma.feedSource.findMany({ orderBy: { name: 'asc' } }), prisma.feedSyncRun.findMany({ include: { feedSource: true }, orderBy: { startedAt: 'desc' }, take: 30 })])
    return { sources, runs }
  }, { sources: [], runs: [] })
  const healthy = result.data.sources.filter((source) => source.isActive && source.lastRunStatus !== 'FAILED').length
  const failed = result.data.sources.filter((source) => source.lastRunStatus === 'FAILED').length
  return <div className="space-y-5">{!result.available && <DatabaseNotice />}<section className="surface-card overflow-hidden"><div className="px-5 py-5 sm:px-6"><p className="eyebrow">Feeds</p><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#161a26]">Feeddiagnose</h1><p className="mt-2 text-[12px] leading-6 text-[#697386]">Controleer brongezondheid, mislukte synchronisaties en de kwaliteit van de laatste feedruns.</p></div><FeedTabs /></section><section className="grid gap-3 sm:grid-cols-3"><div className="surface-card p-4"><p className="text-[10px] text-[#8790a2]">Bronnen</p><p className="mt-2 text-2xl font-semibold text-[#252a37]">{formatNumber(result.data.sources.length)}</p></div><div className="surface-card p-4"><p className="text-[10px] text-[#8790a2]">Gezond</p><p className="mt-2 text-2xl font-semibold text-[var(--green)]">{formatNumber(healthy)}</p></div><div className="surface-card p-4"><p className="text-[10px] text-[#8790a2]">Met fout</p><p className="mt-2 text-2xl font-semibold text-[#b4233d]">{formatNumber(failed)}</p></div></section><section className="surface-card overflow-hidden"><div className="overflow-x-auto"><table className="min-w-full text-left text-[10px]"><thead className="border-b border-[var(--border)] bg-[#fbfcfe] text-[#7d8698]"><tr><th className="px-4 py-3">Bron</th><th className="px-4 py-3">Gestart</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Regels</th><th className="px-4 py-3">Fouten</th><th className="px-4 py-3">Melding</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{result.data.runs.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-[#98a2b3]">Nog geen synchronisatieruns.</td></tr> : result.data.runs.map((run) => <tr key={run.id}><td className="px-4 py-3 font-semibold text-[#303647]">{run.feedSource.name}</td><td className="px-4 py-3">{formatDate(run.startedAt)}</td><td className="px-4 py-3">{run.status}</td><td className="px-4 py-3">{formatNumber(run.itemCount)}</td><td className="px-4 py-3">{formatNumber(run.errorCount)}</td><td className="max-w-[420px] truncate px-4 py-3 text-[#8790a2]">{run.message ?? '—'}</td></tr>)}</tbody></table></div></section></div>
}
