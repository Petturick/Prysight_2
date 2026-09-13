'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { prisma } from '@/lib/prisma'
import type { PriceRoundingMode } from '@/lib/pricing-rules'
import type { PricingStrategy } from '@/lib/pricing-engine'

function optionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = Number(raw.replace(',', '.'))
  if (!Number.isFinite(parsed)) throw new Error('Vul een geldig getal in.')
  return parsed
}

function requiredNumber(value: FormDataEntryValue | null, fallback: number) {
  return optionalNumber(value) ?? fallback
}

function optionalId(value: FormDataEntryValue | null) {
  const parsed = String(value ?? '').trim()
  return parsed || null
}

function strategy(value: FormDataEntryValue | null): PricingStrategy {
  const parsed = String(value ?? '')
  if (parsed === 'LOWEST_MATCH' || parsed === 'LOWEST_MINUS' || parsed === 'SECOND_LOWEST' || parsed === 'MARKET_AVERAGE') return parsed
  return 'MARKET_MEDIAN'
}

function rounding(value: FormDataEntryValue | null): PriceRoundingMode {
  const parsed = String(value ?? '')
  if (parsed === 'WHOLE' || parsed === 'END_95' || parsed === 'END_99') return parsed
  return 'CENT'
}

function validatePriceBounds(minimumPrice: number | null, maximumPrice: number | null) {
  if (minimumPrice !== null && minimumPrice < 0) throw new Error('Minimumprijs kan niet negatief zijn.')
  if (maximumPrice !== null && maximumPrice < 0) throw new Error('Maximumprijs kan niet negatief zijn.')
  if (minimumPrice !== null && maximumPrice !== null && minimumPrice > maximumPrice) throw new Error('Minimumprijs kan niet hoger zijn dan maximumprijs.')
}

function validateMargin(value: number | null) {
  if (value !== null && (value < 0 || value >= 100)) throw new Error('Marge moet tussen 0 en 100 procent liggen.')
}

export async function saveProductGuardrailAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const productId = String(formData.get('productId') ?? '').trim()
  if (!productId) throw new Error('Product ontbreekt.')
  const product = await prisma.product.findFirst({ where: { id: productId, companyId: actor.companyId }, select: { id: true, articleNumber: true } })
  if (!product) throw new Error('Product niet gevonden binnen deze organisatie.')

  const costPrice = optionalNumber(formData.get('costPrice'))
  const minimumMarginPct = optionalNumber(formData.get('minimumMarginPct'))
  const minimumPrice = optionalNumber(formData.get('minimumPrice'))
  const maximumPrice = optionalNumber(formData.get('maximumPrice'))
  const targetMarginPct = optionalNumber(formData.get('targetMarginPct'))
  const priceRoundingMode = rounding(formData.get('priceRoundingMode'))

  if (costPrice !== null && costPrice < 0) throw new Error('Kostprijs kan niet negatief zijn.')
  validateMargin(minimumMarginPct)
  validateMargin(targetMarginPct)
  validatePriceBounds(minimumPrice, maximumPrice)

  await prisma.$executeRaw(Prisma.sql`
    update products
    set cost_price = ${costPrice},
        minimum_margin_pct = ${minimumMarginPct},
        minimum_price = ${minimumPrice},
        maximum_price = ${maximumPrice},
        target_margin_pct = ${targetMarginPct},
        price_rounding_mode = ${priceRoundingMode},
        updated_at = now()
    where id = ${productId} and company_id = ${actor.companyId}
  `)

  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'PRODUCT_PRICING_GUARDRAILS_UPDATED',
    entityType: 'Product',
    entityId: productId,
    newValue: { articleNumber: product.articleNumber, costPrice, minimumMarginPct, minimumPrice, maximumPrice, targetMarginPct, priceRoundingMode },
  })
  revalidatePath('/prijsstrategie')
  revalidatePath('/prijsregels')
  revalidatePath(`/producten/${productId}`)
}

export async function savePricingRuleAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const existingId = optionalId(formData.get('ruleId'))
  const name = String(formData.get('name') ?? '').trim()
  if (!name) throw new Error('Geef de prijsregel een naam.')

  const countryId = optionalId(formData.get('countryId'))
  const productGroupId = optionalId(formData.get('productGroupId'))
  const productId = optionalId(formData.get('productId'))
  if (countryId) await requireLicensedCountry(actor.companyId, countryId)
  if (productGroupId) {
    const group = await prisma.productGroup.findFirst({ where: { id: productGroupId, companyId: actor.companyId }, select: { id: true } })
    if (!group) throw new Error('Productgroep hoort niet bij deze organisatie.')
  }
  if (productId) {
    const product = await prisma.product.findFirst({ where: { id: productId, companyId: actor.companyId }, select: { id: true, productGroupId: true } })
    if (!product) throw new Error('Product hoort niet bij deze organisatie.')
    if (productGroupId && product.productGroupId !== productGroupId) throw new Error('Product en productgroep horen niet bij elkaar.')
  }

  const selectedStrategy = strategy(formData.get('strategy'))
  const adjustmentPct = requiredNumber(formData.get('adjustmentPct'), 0)
  const maxChangePct = requiredNumber(formData.get('maxChangePct'), 5)
  const minimumSignalPct = requiredNumber(formData.get('minimumSignalPct'), 1)
  const minimumCompetitors = Math.max(1, Math.floor(requiredNumber(formData.get('minimumCompetitors'), 2)))
  const minimumMarginPct = optionalNumber(formData.get('minimumMarginPct'))
  const minimumPrice = optionalNumber(formData.get('minimumPrice'))
  const maximumPrice = optionalNumber(formData.get('maximumPrice'))
  const roundingMode = rounding(formData.get('roundingMode'))
  const onlyInStock = String(formData.get('onlyInStock') ?? 'true') !== 'false'
  const requireApproval = String(formData.get('requireApproval') ?? 'true') !== 'false'
  const priority = Math.floor(requiredNumber(formData.get('priority'), 0))

  if (maxChangePct < 0 || maxChangePct > 100) throw new Error('Maximale prijswijziging moet tussen 0 en 100 procent liggen.')
  if (minimumSignalPct < 0 || minimumSignalPct > 100) throw new Error('Signaaldrempel moet tussen 0 en 100 procent liggen.')
  validateMargin(minimumMarginPct)
  validatePriceBounds(minimumPrice, maximumPrice)

  const ruleId = existingId ?? `prule_${randomUUID().replace(/-/g, '')}`
  if (existingId) {
    const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`select id from pricing_rules where id = ${existingId} and company_id = ${actor.companyId} limit 1`)
    if (!existing[0]) throw new Error('Prijsregel niet gevonden binnen deze organisatie.')
    await prisma.$executeRaw(Prisma.sql`
      update pricing_rules
      set name = ${name}, country_id = ${countryId}, product_group_id = ${productGroupId}, product_id = ${productId},
          strategy = ${selectedStrategy}, adjustment_pct = ${adjustmentPct}, max_change_pct = ${maxChangePct},
          minimum_signal_pct = ${minimumSignalPct}, only_in_stock = ${onlyInStock}, minimum_competitors = ${minimumCompetitors},
          minimum_margin_pct = ${minimumMarginPct}, minimum_price = ${minimumPrice}, maximum_price = ${maximumPrice},
          rounding_mode = ${roundingMode}, require_approval = ${requireApproval}, priority = ${priority}, updated_at = now()
      where id = ${existingId} and company_id = ${actor.companyId}
    `)
  } else {
    await prisma.$executeRaw(Prisma.sql`
      insert into pricing_rules (
        id, company_id, name, country_id, product_group_id, product_id, strategy, adjustment_pct,
        max_change_pct, minimum_signal_pct, only_in_stock, minimum_competitors, minimum_margin_pct,
        minimum_price, maximum_price, rounding_mode, require_approval, priority, is_active, created_at, updated_at
      ) values (
        ${ruleId}, ${actor.companyId}, ${name}, ${countryId}, ${productGroupId}, ${productId}, ${selectedStrategy}, ${adjustmentPct},
        ${maxChangePct}, ${minimumSignalPct}, ${onlyInStock}, ${minimumCompetitors}, ${minimumMarginPct},
        ${minimumPrice}, ${maximumPrice}, ${roundingMode}, ${requireApproval}, ${priority}, true, now(), now()
      )
    `)
  }

  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: existingId ? 'PRICING_RULE_UPDATED' : 'PRICING_RULE_CREATED',
    entityType: 'PricingRule',
    entityId: ruleId,
    newValue: { name, countryId, productGroupId, productId, strategy: selectedStrategy, adjustmentPct, maxChangePct, minimumSignalPct, onlyInStock, minimumCompetitors, minimumMarginPct, minimumPrice, maximumPrice, roundingMode, requireApproval, priority },
  })
  revalidatePath('/prijsregels')
  revalidatePath('/prijsstrategie')
}

export async function deletePricingRuleAction(ruleId: string) {
  const actor = await requirePermission('pricing.manage')
  const existing = await prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`select id, name from pricing_rules where id = ${ruleId} and company_id = ${actor.companyId} limit 1`)
  if (!existing[0]) throw new Error('Prijsregel niet gevonden binnen deze organisatie.')
  await prisma.$executeRaw(Prisma.sql`delete from pricing_rules where id = ${ruleId} and company_id = ${actor.companyId}`)
  await createAuditLog({ companyId: actor.companyId, userId: actor.id, action: 'PRICING_RULE_DELETED', entityType: 'PricingRule', entityId: ruleId, oldValue: existing[0] })
  revalidatePath('/prijsregels')
  revalidatePath('/prijsstrategie')
}
