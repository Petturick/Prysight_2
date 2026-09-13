import { getPricingRecommendations } from '@/lib/pricing-engine'
import { approvePriceChangeRequest, createPriceChangeRequest } from '@/lib/price-change-workflow'
import { buildProductSettingsResolver, getCompanyProductSettings } from '@/lib/product-settings'
import { prisma } from '@/lib/prisma'

const SYSTEM_USER_ID = 'system_pricing'

export async function runPricingQueue(companyId: string, limit = 100) {
  const [settings, products, pricing] = await Promise.all([
    getCompanyProductSettings(companyId),
    prisma.product.findMany({ where: { companyId, isActive: true }, select: { id: true, productGroupId: true } }),
    getPricingRecommendations(companyId, {}, Math.min(Math.max(limit, 1), 300), true),
  ])
  const resolve = buildProductSettingsResolver(settings)
  const groups = new Map(products.map((product) => [product.id, product.productGroupId]))
  let queued = 0
  let automaticallyApproved = 0
  let skipped = 0

  for (const recommendation of pricing.recommendations) {
    if (!recommendation.recommendedPrice || !['LOWER', 'RAISE'].includes(recommendation.action)) continue
    const groupId = groups.get(recommendation.productId)
    if (!groupId) continue
    const setting = resolve(recommendation.productId, groupId)
    if (setting.mode !== 'APPROVE' && setting.mode !== 'AUTOMATIC') continue
    const cooldownMs = setting.cooldownHours * 60 * 60 * 1000
    if (setting.lastAutoPriceAt && Date.now() - setting.lastAutoPriceAt.getTime() < cooldownMs) { skipped += 1; continue }

    try {
      const requestId = await createPriceChangeRequest({
        companyId,
        userId: SYSTEM_USER_ID,
        productId: recommendation.productId,
        countryId: recommendation.countryId,
        recommendedPrice: recommendation.recommendedPrice,
        reason: `${setting.mode}: ${recommendation.reason}`,
      })
      queued += 1
      if (setting.mode === 'AUTOMATIC' && !recommendation.requiresApproval) {
        await approvePriceChangeRequest({ companyId, userId: SYSTEM_USER_ID, requestId, approvedPrice: recommendation.recommendedPrice })
        automaticallyApproved += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('open prijswijziging')) skipped += 1
      else console.error('Pricing queue failed for product', recommendation.productId, message)
    }
  }

  return { recommendations: pricing.recommendations.length, queued, automaticallyApproved, skipped }
}
