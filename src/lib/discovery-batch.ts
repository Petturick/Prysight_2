import { MatchStatus, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { discoverProductCandidates } from '@/lib/smart-discovery'
import { buildProductSettingsResolver, getCompanyProductSettings, markProductDiscovery } from '@/lib/product-settings'
import { runDuePriceChecks } from '@/lib/price-monitoring'

type ProductExtra = { id: string; mpn: string | null }

export async function runDiscoveryBatch(companyId: string, limit = 8) {
  const [settings, products, extras, defaultMarket] = await Promise.all([
    getCompanyProductSettings(companyId),
    prisma.product.findMany({
      where: { companyId, isActive: true },
      select: {
        id: true, productGroupId: true, ean: true, gtin: true,
        productMarkets: { where: { companyId, isActive: true }, select: { countryId: true }, take: 1 },
        matches: { where: { companyId, matchStatus: MatchStatus.CERTAIN }, select: { id: true }, take: 2 },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    }),
    prisma.$queryRaw<ProductExtra[]>(Prisma.sql`select id, mpn from products where company_id = ${companyId} and is_active = true`),
    prisma.companyCountry.findFirst({ where: { companyId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { countryId: true } }),
  ])
  const resolve = buildProductSettingsResolver(settings)
  const mpnMap = new Map(extras.map((item) => [item.id, item.mpn]))
  const retryAfterMs = 7 * 24 * 60 * 60 * 1000
  const due = products.filter((product) => {
    if (product.matches.length >= 2 || !(product.ean || product.gtin || mpnMap.get(product.id))) return false
    const last = resolve(product.id, product.productGroupId).lastDiscoveryAt
    return !last || Date.now() - last.getTime() >= retryAfterMs
  }).slice(0, Math.min(Math.max(limit, 1), 20))

  let created = 0
  let checked = 0
  let failed = 0
  for (const product of due) {
    const countryId = product.productMarkets[0]?.countryId ?? defaultMarket?.countryId
    if (!countryId) continue
    try {
      const discovery = await discoverProductCandidates({ companyId, productId: product.id, countryId })
      created += discovery.created
      if (discovery.created > 0) {
        const measurement = await runDuePriceChecks({ companyId, productId: product.id, force: true, limit: 6 })
        checked += measurement.successful
      }
    } catch (error) {
      failed += 1
      console.error('Discovery batch failed for product', product.id, error)
    } finally {
      await markProductDiscovery(companyId, product.id)
    }
  }
  return { products: due.length, created, checked, failed }
}
