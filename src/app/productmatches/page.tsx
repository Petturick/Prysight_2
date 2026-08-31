export const dynamic = 'force-dynamic'
import { approveMatchAction, rejectMatchAction, setReviewMatchAction } from '@/app/actions/matchActions'
import { DataTable } from '@/components/DataTable'
import { DatabaseNotice } from '@/components/DatabaseNotice'
import { formatDate, formatNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { safeDatabaseQuery } from '@/lib/safe-database'

export default async function ProductmatchesPage() {
  const result = await safeDatabaseQuery(() => prisma.productMatch.findMany({
    where: { confidenceScore: { gte: 80, lte: 94 } },
    include: {
      product: true,
      competitorOffer: { include: { competitor: true } },
    },
    orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
  }), [])
  const matches = result.data

  return (
    <div className="space-y-6">
      {!result.available && <DatabaseNotice />}
      <div>
        <h1 className="text-3xl font-semibold">Productmatches</h1>
        <p className="mt-2 text-sm text-slate-600">Matches met een score van 80-94 vereisen manuele controle voordat ze als geldig worden ingezet.</p>
      </div>
      <DataTable
        columns={[
          { key: 'product', header: 'Product' },
          { key: 'concurrent', header: 'Concurrent' },
          { key: 'score', header: 'Confidence' },
          { key: 'status', header: 'Status' },
          { key: 'bewijs', header: 'Bewijs' },
          { key: 'aangemaakt', header: 'Aangemaakt' },
          { key: 'acties', header: 'Acties' },
        ]}
        rows={matches.map((match) => ({
          product: match.product.name,
          concurrent: match.competitorOffer.competitor.name,
          score: `${formatNumber(match.confidenceScore)} / 100`,
          status: match.matchStatus,
          bewijs: <pre className="max-w-md whitespace-pre-wrap text-xs text-slate-600">{JSON.stringify(match.matchEvidence, null, 2)}</pre>,
          aangemaakt: formatDate(match.createdAt),
          acties: (
            <div className="flex flex-wrap gap-2">
              <form action={approveMatchAction.bind(null, match.id)}><button className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white">Goedkeuren</button></form>
              <form action={setReviewMatchAction.bind(null, match.id)}><button className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white">Bewaren als review</button></form>
              <form action={rejectMatchAction.bind(null, match.id)}><button className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white">Afwijzen</button></form>
            </div>
          ),
        }))}
      />
    </div>
  )
}
