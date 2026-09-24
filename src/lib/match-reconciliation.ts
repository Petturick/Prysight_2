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
    // A title and packaging comparison can increase confidence, but it is not
    // strong enough to silently approve a B2B product match. PriceCheck does
    // not persist the extracted EAN/SKU today, so automatic CERTAIN would hide
    // identity uncertainty from the user. Keep the match in REVIEW until a
    // hard identifier or an explicit user approval is available.
    if (result.status === 'UNRELIABLE' || result.score < match.confidenceScore) continue
    await prisma.productMatch.update({
      where: { id: match.id },
      data: {
        confidenceScore: Math.min(result.score, 94),
        matchStatus: MatchStatus.REVIEW,
        approvedBy: null,
        approvedAt: null,
        matchEvidence: {
          source: 'measured-page-reconciliation',
          verifiedTitle: check.productTitle,
          score: result.score,
          evidence: result.evidence,
          reason: 'Prijsbron en producttitel zijn gecontroleerd, maar een harde EAN/SKU-identiteit of handmatige bevestiging blijft vereist.',
        } as Prisma.InputJsonValue,
      },
    })
  }
  return { reviewed: matches.length, promoted }
}
