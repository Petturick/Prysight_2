import { MatchStatus, Prisma } from '@/generated/prisma/client'
import { matchProducts } from '@/lib/product-matching'
import { prisma } from '@/lib/prisma'

export async function reconcileMeasuredMatches(companyId: string, limit = 50) {
  const matches = await prisma.productMatch.findMany({
    where: { companyId, matchStatus: MatchStatus.REVIEW, competitorOffer: { isActive: true } },
    include: {
      product: true,
      competitorOffer: {
        include: { priceChecks: { where: { isSuccess: true }, orderBy: { checkedAt: 'desc' }, take: 1 } },
      },
    },
    orderBy: { confidenceScore: 'desc' },
    take: Math.min(Math.max(limit, 1), 100),
  })

  let promoted = 0
  for (const match of matches) {
    const check = match.competitorOffer.priceChecks[0]
    if (!check?.productTitle) continue
    const result = matchProducts(
      {
        articleNumber: match.product.articleNumber,
        ean: match.product.ean,
        gtin: match.product.gtin,
        name: match.product.name,
        packagingUnit: match.product.packagingUnit,
        packagingQty: match.product.packagingQty,
      },
      {
        productTitle: check.productTitle,
        packagingUnit: match.competitorOffer.packagingUnit,
        packagingQty: match.competitorOffer.packagingQty,
        url: match.competitorOffer.url,
      },
    )
    if (result.status !== 'CERTAIN' || result.score < 95) continue
    await prisma.productMatch.update({
      where: { id: match.id },
      data: {
        confidenceScore: result.score,
        matchStatus: MatchStatus.CERTAIN,
        approvedBy: 'system_pricing',
        approvedAt: new Date(),
        matchEvidence: { source: 'measured-page-reconciliation', verifiedTitle: check.productTitle, score: result.score, evidence: result.evidence } as Prisma.InputJsonValue,
      },
    })
    promoted += 1
  }
  return { reviewed: matches.length, promoted }
}
