import { Prisma } from '@/generated/prisma/client'
import { isMagentoPricingConfigured } from '@/lib/magento-pricing'
import { applyApprovedPriceChange } from '@/lib/price-change-workflow'
import { buildProductSettingsResolver, getCompanyProductSettings, markProductPriceRun, type ProductSetting } from '@/lib/product-settings'
import { prisma } from '@/lib/prisma'

const SYSTEM_USER_ID = 'system_pricing'
type ApprovedRow = { id: string; product_id: string; product_group_id: string }

export async function runPricingExecutor(companyId: string, limit = 20, prefetchedSettings?: ProductSetting[]) {
  if (!(await isMagentoPricingConfigured(companyId))) return { ready: false, candidates: 0, applied: 0, skipped: 0 }
  const [settings, requests] = await Promise.all([
    prefetchedSettings ? Promise.resolve(prefetchedSettings) : getCompanyProductSettings(companyId),
    prisma.$queryRaw<ApprovedRow[]>(Prisma.sql`
      select r.id, r.product_id, p.product_group_id
      from price_change_requests r
      join products p on p.id = r.product_id and p.company_id = r.company_id
      where r.company_id = ${companyId} and r.status = 'APPROVED'
      order by r.approved_at asc nulls last, r.created_at asc
      limit ${Math.min(Math.max(limit, 1), 50)}
    `),
  ])
  const resolve = buildProductSettingsResolver(settings)
  const processedProducts = new Set<string>()
  const now = Date.now()
  let applied = 0
  let skipped = 0
  for (const request of requests) {
    if (processedProducts.has(request.product_id)) { skipped += 1; continue }
    const setting = resolve(request.product_id, request.product_group_id)
    if (setting.mode !== 'AUTOMATIC') { skipped += 1; continue }
    const cooldownMs = setting.cooldownHours * 60 * 60 * 1000
    if (setting.lastAutoPriceAt && now - setting.lastAutoPriceAt.getTime() < cooldownMs) { skipped += 1; continue }
    try {
      await applyApprovedPriceChange({ companyId, userId: SYSTEM_USER_ID, requestId: request.id })
      await markProductPriceRun(companyId, request.product_id)
      processedProducts.add(request.product_id)
      applied += 1
    } catch (error) {
      console.error('Automatic price execution failed', request.id, error)
    }
  }
  return { ready: true, candidates: requests.length, applied, skipped }
}
