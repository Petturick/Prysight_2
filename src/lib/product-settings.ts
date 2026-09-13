import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

export type ProductPricingMode = 'INHERIT' | 'MONITOR' | 'ADVISE' | 'APPROVE' | 'AUTOMATIC'
export type EffectivePricingMode = Exclude<ProductPricingMode, 'INHERIT'>

export type ProductSetting = {
  id: string
  productId: string | null
  productGroupId: string | null
  mode: ProductPricingMode
  cooldownHours: number
  lastDiscoveryAt: Date | null
  lastAutoPriceAt: Date | null
}

type SettingRow = {
  id: string
  product_id: string | null
  product_group_id: string | null
  mode: string
  cooldown_hours: number
  last_discovery_at: Date | null
  last_auto_price_at: Date | null
}

export function normalizePricingMode(value: unknown, fallback: ProductPricingMode = 'INHERIT'): ProductPricingMode {
  const normalized = String(value ?? '').trim().toUpperCase()
  return ['INHERIT', 'MONITOR', 'ADVISE', 'APPROVE', 'AUTOMATIC'].includes(normalized) ? normalized as ProductPricingMode : fallback
}

export function normalizeCooldownHours(value: unknown, fallback = 24) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(720, Math.max(1, Math.round(parsed))) : fallback
}

export async function getCompanyProductSettings(companyId: string): Promise<ProductSetting[]> {
  const rows = await prisma.$queryRaw<SettingRow[]>(Prisma.sql`
    select id, product_id, product_group_id, mode, cooldown_hours, last_discovery_at, last_auto_price_at
    from product_settings where company_id = ${companyId} and is_active = true
  `)
  return rows.map((row) => ({ id: row.id, productId: row.product_id, productGroupId: row.product_group_id, mode: normalizePricingMode(row.mode, 'ADVISE'), cooldownHours: normalizeCooldownHours(row.cooldown_hours), lastDiscoveryAt: row.last_discovery_at, lastAutoPriceAt: row.last_auto_price_at }))
}

export function buildProductSettingsResolver(settings: ProductSetting[]) {
  const byProduct = new Map(settings.filter((item) => item.productId).map((item) => [item.productId!, item]))
  const byGroup = new Map(settings.filter((item) => item.productGroupId).map((item) => [item.productGroupId!, item]))
  return (productId: string, productGroupId: string) => {
    const product = byProduct.get(productId) ?? null
    const group = byGroup.get(productGroupId) ?? null
    const mode: EffectivePricingMode = product && product.mode !== 'INHERIT' ? product.mode : group && group.mode !== 'INHERIT' ? group.mode as EffectivePricingMode : 'ADVISE'
    return { mode, cooldownHours: product?.cooldownHours ?? group?.cooldownHours ?? 24, lastDiscoveryAt: product?.lastDiscoveryAt ?? null, lastAutoPriceAt: product?.lastAutoPriceAt ?? null }
  }
}

export async function markProductDiscovery(companyId: string, productId: string, at = new Date()) {
  await prisma.$executeRaw(Prisma.sql`update product_settings set last_discovery_at = ${at}, updated_at = now() where company_id = ${companyId} and product_id = ${productId} and product_group_id is null`)
}

export async function markProductPriceRun(companyId: string, productId: string, at = new Date()) {
  await prisma.$executeRaw(Prisma.sql`update product_settings set last_auto_price_at = ${at}, updated_at = now() where company_id = ${companyId} and product_id = ${productId} and product_group_id is null`)
}
