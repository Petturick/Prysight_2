import { Prisma } from '@/generated/prisma/client'
import { normalizeCooldownHours, normalizePricingMode } from '@/lib/product-settings'
import { prisma } from '@/lib/prisma'

export type ProductOnboardingFields = {
  mpn?: unknown
  brand?: unknown
  model?: unknown
  costPrice?: unknown
  minimumMarginPct?: unknown
  targetMarginPct?: unknown
  minimumPrice?: unknown
  maximumPrice?: unknown
  pricingMode?: unknown
  pricingCooldownHours?: unknown
}

function text(value: unknown) { const result = String(value ?? '').trim(); return result || null }
function number(value: unknown) { const raw=text(value); if(!raw)return null; const parsed=Number(raw.replace(',','.')); return Number.isFinite(parsed)?parsed:null }
function margin(value: unknown) { const parsed=number(value); return parsed === null ? null : Math.min(99.99, Math.max(0, parsed)) }
function price(value: unknown) { const parsed=number(value); return parsed === null ? null : Math.max(0, parsed) }

export async function saveProductOnboardingFields(companyId: string, productId: string, fields: ProductOnboardingFields) {
  const mpn=text(fields.mpn), brand=text(fields.brand), model=text(fields.model)
  const costPrice=price(fields.costPrice), minimumMarginPct=margin(fields.minimumMarginPct), targetMarginPct=margin(fields.targetMarginPct)
  const minimumPrice=price(fields.minimumPrice), maximumPrice=price(fields.maximumPrice)
  if (minimumPrice !== null && maximumPrice !== null && minimumPrice > maximumPrice) throw new Error('Minimumprijs kan niet hoger zijn dan maximumprijs.')

  const hasProductFields = mpn !== null || brand !== null || model !== null || costPrice !== null || minimumMarginPct !== null || targetMarginPct !== null || minimumPrice !== null || maximumPrice !== null
  if (hasProductFields) {
    await prisma.$executeRaw(Prisma.sql`
      update products set
        mpn = coalesce(${mpn}, mpn), brand = coalesce(${brand}, brand), model = coalesce(${model}, model),
        cost_price = coalesce(${costPrice}, cost_price), minimum_margin_pct = coalesce(${minimumMarginPct}, minimum_margin_pct),
        target_margin_pct = coalesce(${targetMarginPct}, target_margin_pct), minimum_price = coalesce(${minimumPrice}, minimum_price),
        maximum_price = coalesce(${maximumPrice}, maximum_price), updated_at = now()
      where id = ${productId} and company_id = ${companyId}
    `)
  }

  await prisma.$executeRaw(Prisma.sql`
    insert into product_settings (id, company_id, product_id, mode, cooldown_hours, is_active)
    select ${`pst_${productId}`}, ${companyId}, ${productId}, 'INHERIT', 24, true
    where not exists (select 1 from product_settings where company_id = ${companyId} and product_id = ${productId} and product_group_id is null)
  `)

  const rawMode=text(fields.pricingMode)
  const rawCooldown=text(fields.pricingCooldownHours)
  if (rawMode || rawCooldown) {
    const mode=normalizePricingMode(rawMode, 'INHERIT')
    const cooldown=normalizeCooldownHours(fields.pricingCooldownHours, 24)
    await prisma.$executeRaw(Prisma.sql`
      update product_settings set mode=${mode}, cooldown_hours=${cooldown}, updated_at=now()
      where company_id=${companyId} and product_id=${productId} and product_group_id is null
    `)
  }
}
