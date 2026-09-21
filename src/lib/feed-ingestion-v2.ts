import { FeedFormat, FeedSourceType, FeedSyncStatus, Prisma } from '@/generated/prisma/client'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { assertCompanyCapacity } from '@/lib/company-license'
import { fetchAndParseFeed, type ParsedFeed } from '@/lib/feed-parser'
import { FEED_TARGET_FIELDS, inferHeaderTarget, normalizeHeader } from '@/lib/import-mapping'
import { saveProductOnboardingFields } from '@/lib/product-onboarding-fields'
import { prisma } from '@/lib/prisma'

export type CanonicalFeedProduct = {
  articleNumber?: unknown
  ean?: unknown
  gtin?: unknown
  mpn?: unknown
  brand?: unknown
  model?: unknown
  name?: unknown
  description?: unknown
  productGroup?: unknown
  ownPrice?: unknown
  vatIncluded?: unknown
  costPrice?: unknown
  minimumMarginPct?: unknown
  targetMarginPct?: unknown
  minimumPrice?: unknown
  maximumPrice?: unknown
  pricingMode?: unknown
  pricingCooldownHours?: unknown
  currency?: unknown
  stockStatus?: unknown
  packagingUnit?: unknown
  packagingQty?: unknown
  isActive?: unknown
  sourceUpdatedAt?: unknown
  countryCode?: unknown
  ownUrl?: unknown
  [key: string]: unknown
}

type Mapping = { sourceColumn: string; targetField: string | null; sampleValue: string }
const FEED_KEYS = FEED_TARGET_FIELDS.map((field) => field.key)

export function inferMappings(headers: string[], sample: Record<string, string> = {}): Mapping[] {
  return headers.map((sourceColumn) => ({
    sourceColumn,
    targetField: inferHeaderTarget(sourceColumn, FEED_KEYS) || null,
    sampleValue: sample[sourceColumn] ?? '',
  }))
}

function text(value: unknown) {
  const result = String(value ?? '').trim()
  return result || null
}

function dec(value: unknown) {
  const raw = text(value)
  if (!raw) return null
  const parsed = Number(raw.replace(/[^0-9,.-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : null
}

function qty(value: unknown, fallback = 1) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

function bool(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['0', 'false', 'nee', 'no', 'inactive', 'disabled', 'excl', 'exclusive', 'excluding', 'excl. btw', 'excl btw', 'ex vat'].includes(normalized)) return false
  if (['1', 'true', 'ja', 'yes', 'active', 'enabled', 'incl', 'inclusive', 'including', 'incl. btw', 'incl btw', 'inc vat'].includes(normalized)) return true
  if (/\b(?:excl|exclusive|excluding|ex\.?\s*(?:vat|btw)|zzgl)\b/i.test(normalized)) return false
  if (/\b(?:incl|inclusive|including|inkl)\b/i.test(normalized)) return true
  return fallback
}

function mapRow(row: Record<string, string>, mappings: Mapping[]): CanonicalFeedProduct {
  const mapped: CanonicalFeedProduct = {}
  for (const mapping of mappings) {
    if (!mapping.targetField) continue
    const value = row[mapping.sourceColumn]
    if (value === undefined || value === '') continue
    if (mapping.targetField === 'ownPrice' && mapped.ownPrice && normalizeHeader(mapping.sourceColumn) === 'price') continue
    if (mapping.targetField === 'name' && mapped.name) continue
    mapped[mapping.targetField] = value
  }
  if (!text(mapped.name) && text(mapped.description)) mapped.name = mapped.description
  return mapped
}

async function saveMappings(companyId: string, feedSourceId: string, mappings: Mapping[]) {
  await prisma.feedColumnMapping.deleteMany({ where: { companyId, feedSourceId } })
  if (!mappings.length) return
  await prisma.feedColumnMapping.createMany({
    data: mappings.map((mapping, position) => ({
      companyId,
      feedSourceId,
      sourceColumn: mapping.sourceColumn,
      targetField: mapping.targetField,
      dataType: 'text',
      sampleValue: mapping.sampleValue.slice(0, 500),
      position,
    })),
  })
}

type ProcessRow = { raw: Record<string, unknown>; mapped: CanonicalFeedProduct }

type ProcessContext = {
  productCache: Map<string, Awaited<ReturnType<typeof prisma.product.upsert>>>
  groupCache: Map<string, Awaited<ReturnType<typeof prisma.productGroup.upsert>>>
  marketByCode: Map<string, Awaited<ReturnType<typeof prisma.country.findUnique>> extends infer T ? Exclude<T, null> : never>
  onboardingInitialized: Set<string>
}

async function syncMarket(
  companyId: string,
  productId: string,
  mapped: CanonicalFeedProduct,
  ownPrice: Prisma.Decimal | null,
  currency: string,
  context: ProcessContext,
) {
  const code = text(mapped.countryCode)?.toUpperCase()
  if (!code) return
  const country = context.marketByCode.get(code)
  if (!country) return
  const ownUrl = text(mapped.ownUrl)
  const stockStatus = text(mapped.stockStatus)
  const active = bool(mapped.isActive, true)
  await prisma.productMarket.upsert({
    where: { companyId_productId_countryId: { companyId, productId, countryId: country.id } },
    update: {
      ...(ownPrice ? { ownPrice } : {}),
      currency,
      ...(ownUrl ? { ownUrl } : {}),
      ...(stockStatus ? { stockStatus } : {}),
      isActive: active,
    },
    create: {
      companyId,
      productId,
      countryId: country.id,
      ownPrice: ownPrice ?? undefined,
      currency,
      ownUrl: ownUrl ?? undefined,
      stockStatus: stockStatus ?? 'Onbekend',
      isActive: active,
    },
  })
}

async function importProduct(
  companyId: string,
  feedSourceId: string,
  rowIndex: number,
  raw: Record<string, unknown>,
  mapped: CanonicalFeedProduct,
  context: ProcessContext,
) {
  const articleNumber = text(mapped.articleNumber)
  const name = text(mapped.name)
  if (!articleNumber || !name) throw new Error('Artikelnummer/SKU en productnaam zijn verplicht.')

  const groupName = text(mapped.productGroup) ?? 'Onbekend'
  const group = context.groupCache.get(groupName)
  if (!group) throw new Error(`Productgroep ${groupName} kon niet worden geladen.`)

  const ownPrice = dec(mapped.ownPrice)
  const existing = context.productCache.get(articleNumber) ?? null
  const product = await prisma.product.upsert({
    where: { companyId_articleNumber: { companyId, articleNumber } },
    update: {
      name,
      ean: text(mapped.ean) ?? undefined,
      gtin: text(mapped.gtin) ?? undefined,
      productGroupId: group.id,
      ...(ownPrice ? { ownPrice } : {}),
      vatIncluded: bool(mapped.vatIncluded, existing?.vatIncluded ?? true),
      currency: text(mapped.currency) ?? undefined,
      stockStatus: text(mapped.stockStatus) ?? undefined,
      packagingUnit: text(mapped.packagingUnit) ?? undefined,
      packagingQty: qty(mapped.packagingQty),
      isActive: bool(mapped.isActive, true),
    },
    create: {
      companyId,
      articleNumber,
      name,
      ean: text(mapped.ean),
      gtin: text(mapped.gtin),
      productGroupId: group.id,
      ownPrice: ownPrice ?? undefined,
      vatIncluded: bool(mapped.vatIncluded, true),
      currency: text(mapped.currency) ?? 'EUR',
      stockStatus: text(mapped.stockStatus) ?? 'Onbekend',
      packagingUnit: text(mapped.packagingUnit) ?? 'stuks',
      packagingQty: qty(mapped.packagingQty),
      isActive: bool(mapped.isActive, true),
    },
  })
  context.productCache.set(articleNumber, product)

  const onboardingFieldsPresent = Boolean(
    text(mapped.mpn) || text(mapped.brand) || text(mapped.model) || text(mapped.costPrice) ||
    text(mapped.minimumMarginPct) || text(mapped.targetMarginPct) || text(mapped.minimumPrice) ||
    text(mapped.maximumPrice) || text(mapped.pricingMode) || text(mapped.pricingCooldownHours)
  )
  if (!context.onboardingInitialized.has(product.id) || onboardingFieldsPresent) {
    await saveProductOnboardingFields(companyId, product.id, {
      mpn: mapped.mpn,
      brand: mapped.brand,
      model: mapped.model,
      costPrice: mapped.costPrice,
      minimumMarginPct: mapped.minimumMarginPct,
      targetMarginPct: mapped.targetMarginPct,
      minimumPrice: mapped.minimumPrice,
      maximumPrice: mapped.maximumPrice,
      pricingMode: mapped.pricingMode,
      pricingCooldownHours: mapped.pricingCooldownHours,
    })
    context.onboardingInitialized.add(product.id)
  }

  if (ownPrice && (!existing?.ownPrice || !existing.ownPrice.eq(ownPrice))) {
    await prisma.ownPriceHistory.create({
      data: { companyId, productId: product.id, recordedAt: new Date(), price: ownPrice, currency: product.currency },
    })
  }

  await syncMarket(companyId, product.id, mapped, ownPrice, text(mapped.currency) ?? product.currency, context)

  const sourceUpdatedAt = text(mapped.sourceUpdatedAt)
  const parsedDate = sourceUpdatedAt && !Number.isNaN(Date.parse(sourceUpdatedAt)) ? new Date(sourceUpdatedAt) : null
  await prisma.productFeedLink.upsert({
    where: { companyId_feedSourceId_externalKey: { companyId, feedSourceId, externalKey: articleNumber } },
    update: { productId: product.id, sourceUpdatedAt: parsedDate, lastSeenAt: new Date() },
    create: { companyId, feedSourceId, productId: product.id, externalKey: articleNumber, sourceUpdatedAt: parsedDate, lastSeenAt: new Date() },
  })

  return {
    companyId,
    feedSourceId,
    externalKey: articleNumber,
    rowIndex,
    rawData: raw as Prisma.InputJsonValue,
    mappedData: mapped as Prisma.InputJsonValue,
    status: 'IMPORTED',
    importedProductId: product.id,
  } satisfies Prisma.FeedItemCreateManyInput
}

async function processRows(companyId: string, feedSourceId: string, rows: ProcessRow[]) {
  const articleNumbers = [...new Set(rows.map((row) => text(row.mapped.articleNumber)).filter((value): value is string => Boolean(value)))]
  const groupNames = [...new Set(rows.map((row) => text(row.mapped.productGroup) ?? 'Onbekend') )]
  const countryCodes = [...new Set(rows.map((row) => text(row.mapped.countryCode)?.toUpperCase()).filter((value): value is string => Boolean(value)))]

  const [existingProducts, existingGroups, countries, companyCountries] = await Promise.all([
    articleNumbers.length
      ? prisma.product.findMany({ where: { companyId, articleNumber: { in: articleNumbers } } })
      : Promise.resolve([]),
    groupNames.length
      ? prisma.productGroup.findMany({ where: { companyId, name: { in: groupNames } } })
      : Promise.resolve([]),
    countryCodes.length
      ? prisma.country.findMany({ where: { code: { in: countryCodes } } })
      : Promise.resolve([]),
    prisma.companyCountry.findMany({ where: { companyId, isActive: true }, select: { countryId: true } }),
  ])

  const productCache = new Map(existingProducts.map((product) => [product.articleNumber, product]))
  const newSkuCount = articleNumbers.length - productCache.size
  if (newSkuCount > 0) await assertCompanyCapacity(companyId, 'skus', newSkuCount)

  const groupCache = new Map(existingGroups.map((group) => [group.name, group]))
  for (const groupName of groupNames) {
    if (groupCache.has(groupName)) continue
    const group = await prisma.productGroup.upsert({
      where: { companyId_name: { companyId, name: groupName } },
      update: { isActive: true },
      create: { companyId, name: groupName, description: 'Automatisch aangemaakt vanuit productfeed.' },
    })
    groupCache.set(groupName, group)
  }

  const activeMarketIds = new Set(companyCountries.map((item) => item.countryId))
  const marketByCode = new Map(
    countries.filter((country) => activeMarketIds.has(country.id)).map((country) => [country.code.toUpperCase(), country]),
  )
  const context: ProcessContext = {
    productCache,
    groupCache,
    marketByCode,
    onboardingInitialized: new Set<string>(),
  }

  await prisma.feedItem.deleteMany({ where: { companyId, feedSourceId } })
  const feedItems: Prisma.FeedItemCreateManyInput[] = []
  let imported = 0
  let errors = 0
  const errorMessages: string[] = []

  for (const [index, item] of rows.entries()) {
    try {
      const feedItem = await importProduct(companyId, feedSourceId, index + 1, item.raw, item.mapped, context)
      feedItems.push(feedItem)
      imported += 1
    } catch (error) {
      errors += 1
      const message = error instanceof Error ? error.message : 'Onbekende importfout'
      if (errorMessages.length < 20) errorMessages.push(`Rij ${index + 1}: ${message}`)
      feedItems.push({
        companyId,
        feedSourceId,
        externalKey: text(item.mapped.articleNumber),
        rowIndex: index + 1,
        rawData: item.raw as Prisma.InputJsonValue,
        mappedData: item.mapped as Prisma.InputJsonValue,
        status: 'ERROR',
        errorMessage: message,
      })
    }
  }

  if (feedItems.length) await prisma.feedItem.createMany({ data: feedItems })
  return { imported, errors, errorMessages }
}

async function start(companyId: string, feedSourceId: string) {
  await prisma.feedSource.update({ where: { id: feedSourceId }, data: { lastRunStatus: FeedSyncStatus.RUNNING, syncError: null } })
  return prisma.feedSyncRun.create({ data: { companyId, feedSourceId, status: FeedSyncStatus.RUNNING } })
}

async function complete(feedSourceId: string, runId: string, result: { itemCount: number; errors: number; message?: string }) {
  const now = new Date()
  await Promise.all([
    prisma.feedSource.update({
      where: { id: feedSourceId },
      data: { lastRunAt: now, lastRunStatus: FeedSyncStatus.COMPLETED, lastItemCount: result.itemCount, lastErrorCount: result.errors, lastWarningCount: 0, syncError: null },
    }),
    prisma.feedSyncRun.update({
      where: { id: runId },
      data: { status: FeedSyncStatus.COMPLETED, completedAt: now, itemCount: result.itemCount, errorCount: result.errors, warningCount: 0, message: result.message },
    }),
  ])
}

async function fail(feedSourceId: string, runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Onbekende synchronisatiefout'
  const now = new Date()
  await Promise.all([
    prisma.feedSource.update({ where: { id: feedSourceId }, data: { lastRunAt: now, lastRunStatus: FeedSyncStatus.FAILED, syncError: message } }),
    prisma.feedSyncRun.update({ where: { id: runId }, data: { status: FeedSyncStatus.FAILED, completedAt: now, message } }),
  ])
  return message
}

function parsedRows(parsed: ParsedFeed, mappings: Mapping[]) {
  return parsed.rows.map((row) => ({ raw: row as Record<string, unknown>, mapped: mapRow(row, mappings) }))
}

export async function syncFeedSource(feedSourceId: string) {
  const source = await prisma.feedSource.findUnique({ where: { id: feedSourceId } })
  if (!source) throw new Error('Feedbron niet gevonden.')
  if (!source.url) throw new Error('Deze feedbron heeft geen URL.')
  const run = await start(source.companyId, feedSourceId)
  try {
    const parsed = await fetchAndParseFeed(source.url)
    const mappings = inferMappings(parsed.headers, parsed.rows[0] ?? {})
    await saveMappings(source.companyId, feedSourceId, mappings)
    const rows = parsedRows(parsed, mappings).map((item) => ({
      raw: item.raw,
      mapped: {
        ...item.mapped,
        countryCode: item.mapped.countryCode ?? (source.countryCode !== 'GLOBAL' ? source.countryCode : undefined),
      },
    }))
    const processed = await processRows(source.companyId, feedSourceId, rows)
    await prisma.feedSource.update({ where: { id: feedSourceId }, data: { format: parsed.format as FeedFormat, isActive: true } })
    await complete(feedSourceId, run.id, { itemCount: parsed.rows.length, errors: processed.errors, message: `${processed.imported} producten bijgewerkt.` })
    return { rows: parsed.rows.length, columns: parsed.headers.length, format: parsed.format, ...processed }
  } catch (error) {
    throw new Error(await fail(feedSourceId, run.id, error))
  }
}

export async function ingestCanonicalProducts(input: {
  companyId?: string
  sourceKey: string
  sourceName: string
  sourceType?: FeedSourceType
  countryCode?: string
  products: CanonicalFeedProduct[]
  config?: Prisma.InputJsonValue
}) {
  const companyId = input.companyId ?? DEFAULT_COMPANY_ID
  const source = await prisma.feedSource.upsert({
    where: { companyId_sourceKey: { companyId, sourceKey: input.sourceKey } },
    update: { name: input.sourceName, sourceType: input.sourceType ?? FeedSourceType.API, countryCode: input.countryCode ?? 'GLOBAL', isActive: true, config: input.config },
    create: { companyId, sourceKey: input.sourceKey, name: input.sourceName, sourceType: input.sourceType ?? FeedSourceType.API, format: FeedFormat.API, countryCode: input.countryCode ?? 'GLOBAL', isActive: true, config: input.config },
  })
  const run = await start(companyId, source.id)
  try {
    const products = input.products.map((product) => ({
      ...product,
      countryCode: product.countryCode ?? (input.countryCode && input.countryCode !== 'GLOBAL' ? input.countryCode : undefined),
    }))
    const headers = [...new Set(products.flatMap((product) => Object.keys(product)))]
    await saveMappings(companyId, source.id, headers.map((sourceColumn) => ({
      sourceColumn,
      targetField: sourceColumn,
      sampleValue: text(products[0]?.[sourceColumn]) ?? '',
    })))
    const processed = await processRows(companyId, source.id, products.map((product) => ({ raw: { ...product }, mapped: product })))
    await complete(source.id, run.id, { itemCount: products.length, errors: processed.errors, message: `${processed.imported} producten via API bijgewerkt.` })
    return { feedSourceId: source.id, rows: products.length, ...processed }
  } catch (error) {
    throw new Error(await fail(source.id, run.id, error))
  }
}
