import { randomUUID } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requireLicensedCountry } from '@/lib/company-countries'
import {
  convertPriceTaxMode,
  getMagentoPricingConfig,
  pricesEqual,
  readMagentoBasePrice,
  writeMagentoBasePrice,
} from '@/lib/magento-pricing'
import { prisma } from '@/lib/prisma'
import { getPersistedPricingRules, getProductPricingGuardrails, resolvePricingRule } from '@/lib/pricing-rules'

export type PriceChangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLYING' | 'APPLIED' | 'FAILED' | 'ROLLED_BACK'

type RequestRow = {
  id: string
  company_id: string
  product_id: string
  country_id: string | null
  pricing_rule_id: string | null
  external_sku_snapshot: string
  currency: string
  current_price: Prisma.Decimal
  recommended_price: Prisma.Decimal
  approved_price: Prisma.Decimal | null
  cost_price: Prisma.Decimal | null
  margin_before_pct: Prisma.Decimal | null
  margin_after_pct: Prisma.Decimal | null
  status: string
  reason: string | null
  snapshot: Prisma.JsonValue
  requested_by: string | null
  approved_by: string | null
  approved_at: Date | null
  applied_at: Date | null
  rolled_back_at: Date | null
  external_reference: string | null
  previous_external_price: Prisma.Decimal | null
  verified_external_price: Prisma.Decimal | null
  error_message: string | null
  created_at: Date
  updated_at: Date
}

export type PriceChangeListItem = {
  id: string
  productId: string
  articleNumber: string
  productName: string
  countryId: string | null
  countryCode: string | null
  countryName: string | null
  currency: string
  currentPrice: number
  recommendedPrice: number
  approvedPrice: number | null
  status: PriceChangeStatus
  reason: string | null
  requestedByName: string | null
  approvedByName: string | null
  createdAt: Date
  approvedAt: Date | null
  appliedAt: Date | null
  rolledBackAt: Date | null
  errorMessage: string | null
  previousExternalPrice: number | null
  verifiedExternalPrice: number | null
}

type ListRow = RequestRow & {
  article_number: string
  product_name: string
  country_code: string | null
  country_name: string | null
  requested_by_name: string | null
  approved_by_name: string | null
}

function num(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function highest(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  return valid.length ? Math.max(...valid) : null
}

function lowest(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value))
  return valid.length ? Math.min(...valid) : null
}

function grossMarginPct(price: number, costPrice: number | null, vatIncluded: boolean, vatRate: number | null) {
  if (costPrice === null) return null
  const netPrice = vatIncluded && vatRate !== null ? price / (1 + vatRate / 100) : price
  if (netPrice <= 0) return null
  return ((netPrice - costPrice) / netPrice) * 100
}

function marginFloor(costPrice: number | null, minimumMarginPct: number | null, vatIncluded: boolean, vatRate: number | null) {
  if (costPrice === null || minimumMarginPct === null || minimumMarginPct < 0 || minimumMarginPct >= 100) return null
  const net = costPrice / (1 - minimumMarginPct / 100)
  return vatIncluded && vatRate !== null ? net * (1 + vatRate / 100) : net
}

async function pricingContext(companyId: string, productId: string, countryId: string | null) {
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId, isActive: true },
    select: {
      id: true,
      articleNumber: true,
      name: true,
      productGroupId: true,
      ownPrice: true,
      currency: true,
      vatIncluded: true,
      productMarkets: countryId ? {
        where: { companyId, countryId, isActive: true },
        select: { countryId: true, ownPrice: true, vatIncluded: true, currency: true },
      } : false,
      matches: {
        where: { companyId, matchStatus: 'CERTAIN' },
        select: { competitorOffer: { select: { isActive: true, normalizedPrice: true, stockStatus: true, competitor: { select: { countryId: true } } } } },
      },
    },
  })
  if (!product) throw new Error('Product niet gevonden binnen deze organisatie.')

  const country = countryId ? await requireLicensedCountry(companyId, countryId) : null
  const market = countryId && Array.isArray(product.productMarkets) ? product.productMarkets[0] : null
  const marketVatIncluded = market?.vatIncluded ?? product.vatIncluded
  const currentPrice = num(market?.ownPrice) ?? num(product.ownPrice)
  if (currentPrice === null || currentPrice <= 0) throw new Error('Eigen verkoopprijs ontbreekt voor deze markt.')
  const currency = market?.currency ?? product.currency
  const guardrails = (await getProductPricingGuardrails(companyId, [productId])).get(productId) ?? null
  const rules = await getPersistedPricingRules(companyId)
  const rule = resolvePricingRule(rules, { productId, productGroupId: product.productGroupId, countryId })
  const costPrice = guardrails?.costPrice ?? null
  const minimumMarginPct = highest([guardrails?.minimumMarginPct, rule?.minimumMarginPct])
  const floorFromMargin = marginFloor(costPrice, minimumMarginPct, marketVatIncluded, country ? Number(country.vatRate) : null)
  const minimumAllowedPrice = highest([guardrails?.minimumPrice, rule?.minimumPrice, floorFromMargin])
  const maximumAllowedPrice = lowest([guardrails?.maximumPrice, rule?.maximumPrice])

  const competitorPrices = product.matches
    .map((match) => match.competitorOffer)
    .filter((offer) => offer.isActive && offer.normalizedPrice !== null)
    .filter((offer) => !countryId || offer.competitor.countryId === countryId)
    .map((offer) => num(offer.normalizedPrice))
    .filter((value): value is number => value !== null && value > 0)
    .sort((a, b) => a - b)
  const median = competitorPrices.length
    ? competitorPrices.length % 2 === 0
      ? (competitorPrices[competitorPrices.length / 2 - 1] + competitorPrices[competitorPrices.length / 2]) / 2
      : competitorPrices[Math.floor(competitorPrices.length / 2)]
    : null

  return {
    product: { ...product, vatIncluded: marketVatIncluded },
    country,
    currentPrice,
    currency,
    costPrice,
    minimumMarginPct,
    minimumAllowedPrice,
    maximumAllowedPrice,
    marginBeforePct: grossMarginPct(currentPrice, costPrice, marketVatIncluded, country ? Number(country.vatRate) : null),
    rule,
    competitorCount: competitorPrices.length,
    marketLowest: competitorPrices[0] ?? null,
    marketMedian: median,
  }
}

function assertPriceWithinGuardrails(targetPrice: number, context: Awaited<ReturnType<typeof pricingContext>>) {
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) throw new Error('Voorgestelde prijs moet hoger zijn dan 0.')
  if (context.minimumAllowedPrice !== null && targetPrice + 0.001 < context.minimumAllowedPrice) {
    throw new Error(`Prijs is lager dan de commerciële ondergrens van € ${context.minimumAllowedPrice.toFixed(2)}.`)
  }
  if (context.maximumAllowedPrice !== null && targetPrice - 0.001 > context.maximumAllowedPrice) {
    throw new Error(`Prijs is hoger dan de commerciële bovengrens van € ${context.maximumAllowedPrice.toFixed(2)}.`)
  }
  const margin = grossMarginPct(targetPrice, context.costPrice, context.product.vatIncluded, context.country ? Number(context.country.vatRate) : null)
  if (context.minimumMarginPct !== null && margin !== null && margin + 0.001 < context.minimumMarginPct) {
    throw new Error(`Prijs zou de minimale brutomarge van ${context.minimumMarginPct.toFixed(1)}% doorbreken.`)
  }
  return margin
}

async function findRequest(companyId: string, id: string) {
  const rows = await prisma.$queryRaw<RequestRow[]>(Prisma.sql`
    select * from price_change_requests where id = ${id} and company_id = ${companyId} limit 1
  `)
  return rows[0] ?? null
}

export async function createPriceChangeRequest(input: {
  companyId: string
  userId: string
  productId: string
  countryId: string | null
  recommendedPrice: number
  reason?: string | null
}) {
  const context = await pricingContext(input.companyId, input.productId, input.countryId)
  const recommendedPrice = Math.round(input.recommendedPrice * 100) / 100
  const marginAfterPct = assertPriceWithinGuardrails(recommendedPrice, context)
  const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    select id from price_change_requests
    where company_id = ${input.companyId} and product_id = ${input.productId}
      and coalesce(country_id, '') = coalesce(${input.countryId}, '')
      and status in ('PENDING','APPROVED','APPLYING')
    limit 1
  `)
  if (existing[0]) throw new Error('Voor dit product en deze markt staat al een open prijswijziging klaar.')

  const id = `pcr_${randomUUID().replace(/-/g, '')}`
  const autoApprove = context.rule?.requireApproval === false && process.env.PRYSIGHT_AUTO_APPROVE_PRICE_CHANGES === 'true'
  const status: PriceChangeStatus = autoApprove ? 'APPROVED' : 'PENDING'
  const now = new Date()
  const snapshot = {
    productName: context.product.name,
    articleNumber: context.product.articleNumber,
    countryCode: context.country?.code ?? null,
    countryName: context.country?.name ?? null,
    pricingRuleName: context.rule?.name ?? null,
    minimumAllowedPrice: context.minimumAllowedPrice,
    maximumAllowedPrice: context.maximumAllowedPrice,
    minimumMarginPct: context.minimumMarginPct,
    competitorCount: context.competitorCount,
    marketLowest: context.marketLowest,
    marketMedian: context.marketMedian,
  }

  await prisma.$executeRaw(Prisma.sql`
    insert into price_change_requests (
      id, company_id, product_id, country_id, pricing_rule_id, external_sku_snapshot, currency,
      current_price, recommended_price, approved_price, cost_price, margin_before_pct, margin_after_pct,
      status, reason, snapshot, requested_by, approved_by, approved_at, created_at, updated_at
    ) values (
      ${id}, ${input.companyId}, ${input.productId}, ${input.countryId}, ${context.rule?.id ?? null},
      ${context.product.articleNumber}, ${context.currency}, ${context.currentPrice}, ${recommendedPrice},
      ${autoApprove ? recommendedPrice : null}, ${context.costPrice}, ${context.marginBeforePct}, ${marginAfterPct},
      ${status}, ${input.reason?.trim() || null}, ${JSON.stringify(snapshot)}::jsonb, ${input.userId},
      ${autoApprove ? input.userId : null}, ${autoApprove ? now : null}, now(), now()
    )
  `)
  await createAuditLog({ companyId: input.companyId, userId: input.userId, action: 'PRICE_CHANGE_REQUEST_CREATED', entityType: 'PriceChangeRequest', entityId: id, newValue: { productId: input.productId, countryId: input.countryId, currentPrice: context.currentPrice, recommendedPrice, status, pricingRuleId: context.rule?.id ?? null } })
  return id
}

export async function approvePriceChangeRequest(input: { companyId: string; userId: string; requestId: string; approvedPrice?: number | null }) {
  const request = await findRequest(input.companyId, input.requestId)
  if (!request) throw new Error('Prijswijziging niet gevonden.')
  if (request.status !== 'PENDING') throw new Error('Alleen een open aanvraag kan worden goedgekeurd.')
  const target = Math.round((input.approvedPrice ?? num(request.recommended_price) ?? 0) * 100) / 100
  const context = await pricingContext(input.companyId, request.product_id, request.country_id)
  const marginAfter = assertPriceWithinGuardrails(target, context)
  const updated = await prisma.$executeRaw(Prisma.sql`
    update price_change_requests
    set approved_price = ${target}, margin_after_pct = ${marginAfter}, status = 'APPROVED', approved_by = ${input.userId}, approved_at = now(), error_message = null, updated_at = now()
    where id = ${input.requestId} and company_id = ${input.companyId} and status = 'PENDING'
  `)
  if (updated !== 1) throw new Error('De aanvraag is intussen gewijzigd. Vernieuw de pagina.')
  await createAuditLog({ companyId: input.companyId, userId: input.userId, action: 'PRICE_CHANGE_APPROVED', entityType: 'PriceChangeRequest', entityId: input.requestId, newValue: { approvedPrice: target, marginAfterPct: marginAfter } })
}

export async function rejectPriceChangeRequest(input: { companyId: string; userId: string; requestId: string; reason?: string | null }) {
  const updated = await prisma.$executeRaw(Prisma.sql`
    update price_change_requests
    set status = 'REJECTED', reason = coalesce(${input.reason?.trim() || null}, reason), approved_by = ${input.userId}, approved_at = now(), updated_at = now()
    where id = ${input.requestId} and company_id = ${input.companyId} and status = 'PENDING'
  `)
  if (updated !== 1) throw new Error('Alleen een open aanvraag kan worden afgewezen.')
  await createAuditLog({ companyId: input.companyId, userId: input.userId, action: 'PRICE_CHANGE_REJECTED', entityType: 'PriceChangeRequest', entityId: input.requestId, newValue: { reason: input.reason?.trim() || null } })
}

async function syncLocalPrice(request: RequestRow, product: { vatIncluded: boolean }, vatRate: number | null, magentoPrice: number, magentoIncludesTax: boolean) {
  const localPrice = convertPriceTaxMode(magentoPrice, magentoIncludesTax, product.vatIncluded, vatRate)
  if (request.country_id) {
    await prisma.productMarket.upsert({
      where: { companyId_productId_countryId: { companyId: request.company_id, productId: request.product_id, countryId: request.country_id } },
      update: { ownPrice: new Prisma.Decimal(localPrice), vatIncluded: product.vatIncluded, currency: request.currency, isActive: true },
      create: { companyId: request.company_id, productId: request.product_id, countryId: request.country_id, ownPrice: new Prisma.Decimal(localPrice), vatIncluded: product.vatIncluded, currency: request.currency, isActive: true },
    })
  } else {
    await prisma.product.updateMany({ where: { companyId: request.company_id, id: request.product_id }, data: { ownPrice: new Prisma.Decimal(localPrice) } })
  }
  await prisma.ownPriceHistory.create({ data: { companyId: request.company_id, productId: request.product_id, countryId: request.country_id, recordedAt: new Date(), price: new Prisma.Decimal(localPrice), currency: request.currency } })
  return localPrice
}

async function markRequestApplied(input: {
  request: RequestRow
  userId: string
  targetPrice: number
  previousExternal: number
  verifiedExternal: number
  storeId: number
  context: Awaited<ReturnType<typeof pricingContext>>
}) {
  const vatRate = input.context.country ? Number(input.context.country.vatRate) : null
  const magentoConfig = await getMagentoPricingConfig(input.request.company_id)
  if (!magentoConfig) throw new Error('Magento writeback is niet geconfigureerd voor deze organisatie.')
  const verifiedLocalPrice = await syncLocalPrice(input.request, input.context.product, vatRate, input.verifiedExternal, magentoConfig.pricesIncludeTax)
  const updated = await prisma.$executeRaw(Prisma.sql`
    update price_change_requests
    set status = 'APPLIED', applied_at = now(), previous_external_price = ${input.previousExternal}, verified_external_price = ${input.verifiedExternal},
        external_reference = ${`magento:${input.storeId}:${input.request.external_sku_snapshot}`}, error_message = null, updated_at = now()
    where id = ${input.request.id} and company_id = ${input.request.company_id} and status = 'APPLYING'
  `)
  if (updated !== 1) throw new Error('De prijswijziging kon na Magento-verificatie niet als toegepast worden vastgelegd.')
  await createAuditLog({ companyId: input.request.company_id, userId: input.userId, action: 'PRICE_CHANGE_APPLIED', entityType: 'PriceChangeRequest', entityId: input.request.id, newValue: { sku: input.request.external_sku_snapshot, previousExternalPrice: input.previousExternal, targetPrice: input.targetPrice, verifiedLocalPrice, verifiedExternalPrice: input.verifiedExternal } })
  return verifiedLocalPrice
}

async function compensateExternalWrite(request: RequestRow, previousExternal: number, expectedWrittenPrice: number, product: { vatIncluded: boolean }, vatRate: number | null) {
  try {
    const current = await readMagentoBasePrice(request.external_sku_snapshot, request.company_id)
    if (pricesEqual(current.price, previousExternal)) return 'already_restored' as const
    if (!pricesEqual(current.price, expectedWrittenPrice)) return 'external_changed' as const
    const restored = await writeMagentoBasePrice(request.external_sku_snapshot, previousExternal, request.company_id)
    if (!pricesEqual(restored.price, previousExternal)) return 'restore_unverified' as const
    try { await syncLocalPrice(request, product, vatRate, restored.price, restored.pricesIncludeTax) } catch { /* externe rollback is leidend, lokale status blijft FAILED voor herstel */ }
    return 'restored' as const
  } catch {
    return 'unknown' as const
  }
}

export async function applyApprovedPriceChange(input: { companyId: string; userId: string; requestId: string }) {
  const config = await getMagentoPricingConfig(input.companyId)
  if (!config) throw new Error('Magento writeback is nog niet volledig geconfigureerd.')
  const request = await findRequest(input.companyId, input.requestId)
  if (!request) throw new Error('Prijswijziging niet gevonden.')
  if (request.status !== 'APPROVED' && request.status !== 'FAILED') throw new Error('Alleen een goedgekeurde of opnieuw te proberen wijziging kan worden gepubliceerd.')
  const originalStatus = request.status
  const target = num(request.approved_price) ?? num(request.recommended_price)
  if (target === null) throw new Error('Goedgekeurde prijs ontbreekt.')
  const context = await pricingContext(input.companyId, request.product_id, request.country_id)
  assertPriceWithinGuardrails(target, context)
  if (request.currency.toUpperCase() !== config.currency) throw new Error('Valuta van de prijsaanvraag komt niet overeen met de geconfigureerde Magento valuta.')

  const claimed = await prisma.$executeRaw(Prisma.sql`
    update price_change_requests set status = 'APPLYING', error_message = null, updated_at = now()
    where id = ${input.requestId} and company_id = ${input.companyId} and status in ('APPROVED','FAILED')
  `)
  if (claimed !== 1) throw new Error('Prijswijziging wordt al verwerkt of is intussen gewijzigd.')

  let previousExternal = num(request.previous_external_price)
  let targetForMagento: number | null = null
  let writeAttempted = false
  try {
    const before = await readMagentoBasePrice(request.external_sku_snapshot, input.companyId)
    const vatRate = context.country ? Number(context.country.vatRate) : null
    const expectedCurrent = num(request.current_price) ?? context.currentPrice
    targetForMagento = convertPriceTaxMode(target, context.product.vatIncluded, before.pricesIncludeTax, vatRate)
    const currentAsPrysight = convertPriceTaxMode(before.price, before.pricesIncludeTax, context.product.vatIncluded, vatRate)

    if (originalStatus === 'FAILED' && pricesEqual(before.price, targetForMagento)) {
      const recoverablePrevious = previousExternal ?? convertPriceTaxMode(expectedCurrent, context.product.vatIncluded, before.pricesIncludeTax, vatRate)
      await markRequestApplied({ request, userId: input.userId, targetPrice: target, previousExternal: recoverablePrevious, verifiedExternal: before.price, storeId: before.storeId, context })
      return
    }

    if (!pricesEqual(currentAsPrysight, expectedCurrent)) {
      throw new Error(`Magento prijs is intussen gewijzigd naar ${currentAsPrysight.toFixed(2)}. Maak een nieuw prijsadvies voordat u publiceert.`)
    }
    previousExternal = before.price
    writeAttempted = true
    const after = await writeMagentoBasePrice(request.external_sku_snapshot, targetForMagento, input.companyId)
    if (!pricesEqual(after.price, targetForMagento)) throw new Error('Magento bevestigde de nieuwe prijs niet.')

    try {
      await markRequestApplied({ request, userId: input.userId, targetPrice: target, previousExternal, verifiedExternal: after.price, storeId: after.storeId, context })
      return
    } catch (localError) {
      const compensation = await compensateExternalWrite(request, previousExternal, targetForMagento, context.product, vatRate)
      const localMessage = localError instanceof Error ? localError.message : 'Lokale synchronisatie mislukt.'
      throw new Error(`${localMessage} Externe compensatie: ${compensation}.`)
    }
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Onbekende fout bij Magento writeback.'
    if (writeAttempted && previousExternal !== null && targetForMagento !== null && !message.includes('Externe compensatie:')) {
      const vatRate = context.country ? Number(context.country.vatRate) : null
      const compensation = await compensateExternalWrite(request, previousExternal, targetForMagento, context.product, vatRate)
      message = `${message} Externe compensatie: ${compensation}.`
    }
    await prisma.$executeRaw(Prisma.sql`
      update price_change_requests set status = 'FAILED', previous_external_price = coalesce(previous_external_price, ${previousExternal}), error_message = ${message}, updated_at = now()
      where id = ${input.requestId} and company_id = ${input.companyId} and status = 'APPLYING'
    `)
    await createAuditLog({ companyId: input.companyId, userId: input.userId, action: 'PRICE_CHANGE_FAILED', entityType: 'PriceChangeRequest', entityId: input.requestId, newValue: { error: message, previousExternalPrice: previousExternal } })
    throw new Error(message)
  }
}

export async function rollbackAppliedPriceChange(input: { companyId: string; userId: string; requestId: string }) {
  const config = await getMagentoPricingConfig(input.companyId)
  if (!config) throw new Error('Magento writeback is nog niet volledig geconfigureerd.')
  const request = await findRequest(input.companyId, input.requestId)
  if (!request) throw new Error('Prijswijziging niet gevonden.')
  if (request.status !== 'APPLIED') throw new Error('Alleen een gepubliceerde wijziging kan worden teruggedraaid.')
  if (request.currency.toUpperCase() !== config.currency) throw new Error('Valuta van de prijsaanvraag komt niet overeen met de geconfigureerde Magento valuta.')
  const previousExternal = num(request.previous_external_price)
  const verifiedExternal = num(request.verified_external_price)
  if (previousExternal === null || verifiedExternal === null) throw new Error('Rollback gegevens ontbreken voor deze wijziging.')
  const context = await pricingContext(input.companyId, request.product_id, request.country_id)
  const current = await readMagentoBasePrice(request.external_sku_snapshot, input.companyId)
  if (!pricesEqual(current.price, verifiedExternal)) throw new Error('Magento prijs is na publicatie opnieuw gewijzigd. Automatische rollback is geblokkeerd om een externe wijziging niet te overschrijven.')
  const restored = await writeMagentoBasePrice(request.external_sku_snapshot, previousExternal, input.companyId)
  if (!pricesEqual(restored.price, previousExternal)) throw new Error('Rollback kon niet door Magento worden bevestigd.')
  const vatRate = context.country ? Number(context.country.vatRate) : null
  const restoredLocalPrice = await syncLocalPrice(request, context.product, vatRate, restored.price, restored.pricesIncludeTax)
  const updated = await prisma.$executeRaw(Prisma.sql`
    update price_change_requests set status = 'ROLLED_BACK', rolled_back_at = now(), verified_external_price = ${restored.price}, error_message = null, updated_at = now()
    where id = ${input.requestId} and company_id = ${input.companyId} and status = 'APPLIED'
  `)
  if (updated !== 1) throw new Error('Rollback is extern uitgevoerd maar kon lokaal niet als afgerond worden vastgelegd. Handmatige controle vereist.')
  await createAuditLog({ companyId: input.companyId, userId: input.userId, action: 'PRICE_CHANGE_ROLLED_BACK', entityType: 'PriceChangeRequest', entityId: input.requestId, newValue: { restoredExternalPrice: restored.price, restoredLocalPrice } })
}

export async function listPriceChangeRequests(companyId: string, limit = 100): Promise<PriceChangeListItem[]> {
  const rows = await prisma.$queryRaw<ListRow[]>(Prisma.sql`
    select r.*, p.article_number, p.name as product_name, c.code as country_code, c.name as country_name,
           requested.name as requested_by_name, approved.name as approved_by_name
    from price_change_requests r
    join products p on p.id = r.product_id and p.company_id = r.company_id
    left join countries c on c.id = r.country_id
    left join users requested on requested.id = r.requested_by
    left join users approved on approved.id = r.approved_by
    where r.company_id = ${companyId}
    order by case r.status when 'PENDING' then 0 when 'APPROVED' then 1 when 'FAILED' then 2 when 'APPLYING' then 3 else 4 end, r.created_at desc
    limit ${Math.min(Math.max(limit, 1), 500)}
  `)
  return rows.map((row) => ({
    id: row.id,
    productId: row.product_id,
    articleNumber: row.article_number,
    productName: row.product_name,
    countryId: row.country_id,
    countryCode: row.country_code,
    countryName: row.country_name,
    currency: row.currency,
    currentPrice: Number(row.current_price),
    recommendedPrice: Number(row.recommended_price),
    approvedPrice: num(row.approved_price),
    status: row.status as PriceChangeStatus,
    reason: row.reason,
    requestedByName: row.requested_by_name,
    approvedByName: row.approved_by_name,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    appliedAt: row.applied_at,
    rolledBackAt: row.rolled_back_at,
    errorMessage: row.error_message,
    previousExternalPrice: num(row.previous_external_price),
    verifiedExternalPrice: num(row.verified_external_price),
  }))
}
