import { MatchStatus } from '@/generated/prisma/client'
import { DataTable } from '@/components/DataTable'
import { formatCurrency, formatDate } from '@/lib/format'
import { prisma } from '@/lib/prisma'

export async function ProductCheckHistoryPanel({ companyId, productId, countryId }: { companyId: string; productId: string; countryId?: string }) {
  const checks = await prisma.priceCheck.findMany({
    where: {
      companyId,
      competitorOffer: {
        companyId,
        competitor: countryId ? { countryId } : undefined,
        productMatch: {
          companyId,
          productId,
          matchStatus: MatchStatus.CERTAIN,
        },
      },
    },
    include: { competitorOffer: { include: { competitor: true } } },
    orderBy: { checkedAt: 'desc' },
    take: 40,
  })

  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="text-[14px] font-semibold text-[#0b1f35]">Controlehistorie</h2>
        <p className="mt-1 text-[12px] text-[#6b7b8e]">Laatste 40 prijscontroles voor dit marktprofiel.</p>
      </div>
      <DataTable
        columns={[
          { key: 'tijd', header: 'Controlemoment' },
          { key: 'concurrent', header: 'Concurrent' },
          { key: 'methode', header: 'Methode' },
          { key: 'status', header: 'Status' },
          { key: 'prijs', header: 'Prijs' },
          { key: 'melding', header: 'Melding' },
        ]}
        rows={checks.map((check) => ({
          tijd: formatDate(check.checkedAt),
          concurrent: check.competitorOffer.competitor.name,
          methode: check.checkMethod,
          status: check.isSuccess ? 'Succes' : `Fout ${check.statusCode ?? '—'}`,
          prijs: formatCurrency(check.foundPrice, check.currency),
          melding: check.errorMessage ?? '—',
        }))}
      />
    </section>
  )
}
