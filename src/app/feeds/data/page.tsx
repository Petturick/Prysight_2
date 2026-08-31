export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { FeedTabs } from '@/components/FeedTabs'
import { formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

function readParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value }

export default async function FeedDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const requestedId = readParam(params.source)
  const result = await safeDatabaseQuery(async () => {
    const sources = await prisma.feedSource.findMany({ orderBy: { name: 'asc' } })
    const selectedId = requestedId && sources.some((source) => source.id === requestedId) ? requestedId : sources[0]?.id
    const source = selectedId ? await prisma.feedSource.findUnique({ where: { id: selectedId }, include: { columns: { orderBy: { position: 'asc' } }, items: { orderBy: { rowIndex: 'asc' }, take: 100 } } }) : null
    return { sources, source }
  }, { sources: [], source: null })
  const source = result.data.source
  return <div className="space-y-5">{!result.available && <DatabaseNotice />}<section className="surface-card overflow-hidden"><div className="px-5 py-5 sm:px-6"><p className="eyebrow">Feeds</p><h1 className="mt-2 text-[28px] font-semibold tracking-[-0.035em] text-[#161a26]">Feeddata opbouwen</h1><p className="mt-2 text-[12px] leading-6 text-[#697386]">Bekijk herkende bronkolommen, de automatische veldmapping en de productregels die naar Producten zijn verwerkt.</p></div><FeedTabs /></section><section className="surface-card p-4"><div className="flex flex-wrap items-center gap-2">{result.data.sources.map((item) => <Link key={item.id} href={`/feeds/data?source=${item.id}`} className={`rounded-lg border px-3 py-2 text-[10px] font-medium ${source?.id === item.id ? 'border-[#cfe0ff] bg-[var(--blue-soft)] text-[var(--blue)]' : 'border-[var(--border)] text-[#697386]'}`}>{item.name}</Link>)}</div></section>{!source ? <section className="surface-card p-8 text-center text-[11px] text-[#98a2b3]">Nog geen feeddata beschikbaar.</section> : <><section className="surface-card p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-[13px] font-semibold text-[#252a37]">Kolommen en mapping</h2><p className="mt-1 text-[11px] text-[#8790a2]">{formatNumber(source.columns.length)} bronkolommen herkend.</p></div><Link href="/producten" className="text-[11px] font-semibold text-[var(--blue)]">Bekijk geïmporteerde producten</Link></div><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{source.columns.map((column) => <div key={column.id} className="rounded-xl border border-[var(--border)] bg-[#fbfcfe] p-3"><p className="truncate text-[10px] font-semibold text-[#303647]">{column.sourceColumn}</p><p className="mt-1 text-[10px] text-[var(--blue)]">→ {column.targetField ?? 'niet gekoppeld'}</p><p className="mt-2 truncate text-[9px] text-[#98a2b3]">Voorbeeld: {column.sampleValue || '—'}</p></div>)}</div></section><section className="surface-card overflow-hidden"><div className="border-b border-[var(--border)] px-5 py-4"><h2 className="text-[13px] font-semibold text-[#252a37]">Feedregels</h2><p className="mt-1 text-[11px] text-[#8790a2]">De eerste 100 regels. Fouten blijven zichtbaar en overschrijven geen geldige productdata.</p></div><div className="overflow-x-auto"><table className="min-w-full text-left text-[10px]"><thead className="bg-[#fbfcfe] text-[#7d8698]"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Externe sleutel</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Melding</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{source.items.map((item) => <tr key={item.id}><td className="px-4 py-3">{item.rowIndex}</td><td className="px-4 py-3 font-medium text-[#303647]">{item.externalKey ?? '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 font-semibold ${item.status === 'IMPORTED' ? 'bg-[var(--green-soft)] text-[var(--green)]' : 'bg-[var(--accent-soft)] text-[#b4233d]'}`}>{item.status}</span></td><td className="px-4 py-3">{item.importedProductId ? <Link href={`/producten/${item.importedProductId}`} className="text-[var(--blue)]">Open product</Link> : '—'}</td><td className="px-4 py-3 text-[#8790a2]">{item.errorMessage ?? '—'}</td></tr>)}</tbody></table></div></section></>}</div>
}
