import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import type { PricingStrategy } from '@/lib/pricing-engine'

export type PriceRoundingMode = 'CENT' | 'WHOLE' | 'END_95' | 'END_99'

export type ProductPricingGuardrail = {
  productId: string
  costPrice: number | null
  minimumMarginPct: number | null
  minimumPrice: number | null
  maximumPrice: number | null
  targetMarginPct: number | null
  priceRoundingMode: PriceRoundingMode
}

export type PersistedPricingRule = {
  id: string
  companyId: string
  name: string
  countryId: string | null
  productGroupId: string | null
  productId: string | null
  strategy: PricingStrategy
  adjustmentPct: number
  maxChangePct: number
  minimumSignalPct: number
  onlyInStock: boolean
  minimumCompetitors: number
  minimumMarginPct: number | null
  minimumPrice: number | null
  maximumPrice: number | null
  roundingMode: PriceRoundingMode
  requireApproval: boolean
  priority: number
}

type GuardrailRow = {
  product_id: string
  cost_price: Prisma.Decimal | null
  minimum_margin_pct: Prisma.Decimal | null
  minimum_price: Prisma.Decimal | null
  maximum_price: Prisma.Decimal | null
  target_margin_pct: Prisma.Decimal | null
  price_rounding_mode: string
}

type RuleRow = {
  id: string
  company_id: string
  name: string
  country_id: string | null
  product_group_id: string | null
  product_id: string | null
  strategy: string
  adjustment_pct: Prisma.Decimal
  max_change_pct: Prisma.Decimal
  minimum_signal_pct: Prisma.Decimal
  only_in_stock: boolean
  minimum_competitors: number
  minimum_margin_pct: Prisma.Decimal | null
  minimum_price: Prisma.Decimal | null
  maximum_price: Prisma.Decimal | null
  rounding_mode: string
  require_approval: boolean
  priority: number
}

function numberOrNull(value: Prisma.Decimal | null) {
  return value === null ? null : Number(value)
}

function roundingMode(value: string | null | undefined): PriceRoundingMode {
  return value === 'WHOLE' || value === 'END_95' || value === 'END_99' ? value : 'CENT'
}

function pricingStrategy(value: string): PricingStrategy {
  if (value === 'LOWEST_MATCH' || value === 'LOWEST_MINUS' || value === 'SECOND_LOWEST' || value === 'MARKET_AVERAGE') return value
  return 'MARKET_MEDIAN'
}

export async function getProductPricingGuardrails(companyId: string, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, ProductPricingGuardrail>()
  const rows = await prisma.$queryRaw<GuardrailRow[]>(Prisma.sql`
    select product_id, cost_price, minimum_margin_pct, minimum_price, maximum_price, target_margin_pct, price_rounding_mode
    from (
      select id as product_id, cost_price, minimum_margin_pct, minimum_price, maximum_price, target_margin_pct, price_rounding_mode
      from products
      where company_id = ${companyId} and id in (${Prisma.join(productIds)})
    ) product_guardrails
  `)
  return new Map(rows.map((row) => [row.product_id, {
    productId: row.product_id,
    costPrice: numberOrNull(row.cost_price),
    minimumMarginPct: numberOrNull(row.minimum_margin_pct),
    minimumPrice: numberOrNull(row.minimum_price),
    maximumPrice: numberOrNull(row.maximum_price),
    targetMarginPct: numberOrNull(row.target_margin_pct),
    priceRoundingMode: roundingMode(row.price_rounding_mode),
  }]))
}

export async function getPersistedPricingRules(companyId: string): Promise<PersistedPricingRule[]> {
  const rows = await prisma.$queryRaw<RuleRow[]>(Prisma.sql`
    select id, company_id, name, country_id, product_group_id, product_id, strategy,
           adjustment_pct, max_change_pct, minimum_signal_pct, only_in_stock,
           minimum_competitors, minimum_margin_pct, minimum_price, maximum_price,
           rounding_mode, require_approval, priority
    from pricing_rules
    where company_id = ${companyId} and is_active = true
    order by priority desc, created_at asc
  `)
  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    countryId: row.country_id,
    productGroupId: row.product_group_id,
    productId: row.product_id,
    strategy: pricingStrategy(row.strategy),
    adjustmentPct: Number(row.adjustment_pct),
    maxChangePct: Number(row.max_change_pct),
    minimumSignalPct: Number(row.minimum_signal_pct),
    onlyInStock: row.only_in_stock,
    minimumCompetitors: row.minimum_competitors,
    minimumMarginPct: numberOrNull(row.minimum_margin_pct),
    minimumPrice: numberOrNull(row.minimum_price),
    maximumPrice: numberOrNull(row.maximum_price),
    roundingMode: roundingMode(row.rounding_mode),
    requireApproval: row.require_approval,
    priority: row.priority,
  }))
}

export function resolvePricingRule(rules: PersistedPricingRule[], scope: { productId: string; productGroupId: string; countryId: string | null }) {
  return rules
    .filter((rule) => (!rule.productId || rule.productId === scope.productId)
      && (!rule.productGroupId || rule.productGroupId === scope.productGroupId)
      && (!rule.countryId || rule.countryId === scope.countryId))
    .map((rule) => ({
      rule,
      specificity: (rule.productId ? 4 : 0) + (rule.productGroupId ? 2 : 0) + (rule.countryId ? 1 : 0),
    }))
    .sort((left, right) => right.specificity - left.specificity || right.rule.priority - left.rule.priority)[0]?.rule ?? null
}
