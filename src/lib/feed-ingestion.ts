import { FeedFormat, FeedSourceType, FeedSyncStatus, Prisma } from '@/generated/prisma/client'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { assertCompanyCapacity } from '@/lib/company-license'
import { fetchAndParseFeed, type ParsedFeed } from '@/lib/feed-parser'
import { prisma } from '@/lib/prisma'

export type CanonicalFeedProduct = {
  articleNumber?: unknown
  ean?: unknown
  gtin?: unknown
  name?: unknown
  description?: unknown
  productGroup?: unknown
  ownPrice?: unknown
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

const FIELD_ALIASES: Record<string, string[]> = {
  articleNumber: [
    'articlenumber', 'article_number', 'artikelnummer', 'artikel_nummer', 'artikel', 'sku', 'sku_code', 'skucode', 'productsku', 'product_sku',
    'itemnumber', 'item_number', 'itemno', 'productcode', 'product_code', 'productid', 'product_id', 'merchantproductid', 'merchant_product_id',
  ],
  ean: ['ean', 'ean13', 'ean_code', 'eancode', 'barcode', 'barcode13'],
  gtin: ['gtin', 'gtin13', 'gtin14', 'globaltraditemnumber'],
  name: ['name', 'productname', 'product_name', 'producttitle', 'product_title', 'title', 'naam', 'productnaam'],
  description: ['description', 'productdescription', 'product_description', 'omschrijving', 'productomschrijving'],
  productGroup: ['productgroup', 'product_group', 'productgroep', 'category', 'category1', 'category_1', 'categorie', 'hoofdcategorie', 'maincategory'],
  ownPrice: ['ownprice', 'own_price', 'price', 'specialprice', 'special_price', 'salesprice', 'sales_price', 'sellingprice', 'verkoopprijs', 'prijs', 'brutoprijs'],
  currency: ['currency', 'currencycode', 'currency_code', 'valuta', 'curr'],
  stockStatus: ['stockstatus', 'stock_status', 'availability', 'availabilitystatus', 'voorraadstatus', 'voorraad', 'stock', 'inventory'],
  packagingUnit: ['packagingunit', 'packaging_unit', 'unit', 'eenheid', 'verpakkingseenheid', 'salesunit', 'sales_unit'],
  packagingQty: ['packagingqty', 'packaging_qty', 'quantityperpack', 'quantity_per_pack', 'packqty', 'aantalperverpakking', 'packsize', 'pack_size'],
  isActive: ['isactive', 'is_active', 'active', 'enabled', 'status', 'published'],
  sourceUpdatedAt: ['updatedat', 'updated_at', 'lastmodified', 'last_modified', 'modifiedat', 'modified_at', 'laatstgewijzigd', 'laatsteupdate'],
  countryCode: ['country', 'countrycode', 'country_code', 'land', 'landcode', 'land_code', 'market', 'markt', 'storeview', 'store_view'],
  ownUrl: ['url', 'producturl', 'product_url', 'productlink', 'product_link', 'deeplink', 'deep_link', 'engelsurl', 'engels_url', 'webshopurl', 'webshop_url'],
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function inferTargetField(header: string) {
  const normalized = normalizeKey(header)
  for (const [target, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((alias) => normalizeKey(alias) === normalized)) return target
  }
  for (const [target, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((alias) => {
      const candidate = normalizeKey(alias)
      return candidate.length >= 5 && (normalized.startsWith(candidate) || normalized.endsWith(candidate))
    })) return target
  }
  return null
}

export function inferMappings(headers: string[], sample: Record<string, string> = {}): Mapping[] {
  return headers.map((sourceColumn) => ({
    sourceColumn,
    targetField: inferTargetField(sourceColumn),
    sampleValue: sample[sourceColumn] ?? '',
  }))
}

function stringValue(value: unknown) {
  if (value === null || value === undefined) return null
  const result = String(value).trim()
  return result ? result : null
}

function decimalValue(value: unknown) {
  const text = stringValue(value)
  if (!text) return null
  const cleaned = text.replace(/[^0-9,.-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? new Prisma.Decimal(parsed) : null
}

function integerValue(value: unknown, fallback = 1) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

function booleanValue(value: unknown, fallback = true) {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['0', 'false', 'nee', 'no', 'inactive', 'disabled'].includes(normalized)) return false
  if (['1', 'true', 'ja', 'yes', 'active', 'enabled'].includes(normalized)) return true
  return fallback
}

function mapRow(row: Record<string, string>, mappings: Mapping[]): CanonicalFeedProduct {
  const mapped: CanonicalFeedProduct = {}
  for (const mapping of mappings) {
    if (!mapping.targetField) continue
    const value = row[mapping.sourceColumn]
    if (value === undefined || value === '') continue
    const current = mapped[mapping.targetField]
    if (mapping.targetField === 'ownPrice' && current && normalizeKey(mapping.sourceColumn) === 'price') continue
    if (mapping.targetField === 'name' && current) continue
    mapped[mapping.targetField] = value
  }
  if (!stringValue(mapped.name) && stringValue(mapped.description)) mapped.name = mapped.description
  return mapped
}

async function saveMappings(companyId: string, feedSourceId: string, mappings: Mapping[]) {
  await prisma.feedColumnMapping.deleteMany({ where: { companyId, feedSourceId } })
  for (const [position, mapping] of mappings.entries()) {
    await prisma.feedColumnMapping.create({
      data: {
        companyId,
        feedSourceId,
        sourceColumn: mapping.sourceColumn,
        targetField: mapping.targetField,
        dataType: 'text',
        sampleValue: mapping.sampleValue.slice(0, 500),
        position,
      },
    })
  }
}

async function resolveLicensedCountry(companyId: string, rawCode: unknown) {
  const rawCountryCode = stringValue(rawCode)
  if (!rawCountryCode) return null
  const country = await prisma.country.findUnique({ where: { code: rawCountryCode.trim().toUpperCase() } })
  if (!country) return null
  const companyCountry = await prisma.companyCountry.findUnique({
    where: { companyId_countryId: { companyId, countryId: country.id } },
  })
  return companyCountry?.isActive ? country : null
}

async function syncProductMarket(
  companyId: string,
  productId: string,
  mapped: CanonicalFeedProduct,
  ownPrice: Prisma.Decimal | null,
  currency: string,
) {
  const country = await resolveLicensedCountry(companyId, mapped.countryCode)
  if (!country) return

  const ownUrl = stringValue(mapped.ownUrl)
  const stockStatus = stringValue(mapped.stockStatus)
  const active = booleanValue(mapped.isActive, true)

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

async function importOneProduct(
  companyId: string,
  feedSourceId: string,
  rowIndex: number,
  raw: Record<string, unknown>,
  mapped: CanonicalFeedProduct,
) {
  const articleNumber = stringValue(mapped.articleNumber)
  const name = stringValue(mapped.name)
  if (!articleNumber || !name) throw new Error('Artikelnummer/SKU en productnaam zijn verplicht.')

  const groupName = stringValue(mapped.productGroup) ?? 'Onbekend'
  const group = await prisma.productGroup.upsert({
    where: { companyId_name: { companyId, name: groupName } },
    update: { isActive: true },
    create: { companyId, name: groupName, description: 'Automatisch aangemaakt vanuit productfeed.' },
  })

  const ownPrice = decimalValue(mapped.ownPrice)
  const existing = await prisma.product.findUnique({ where: { companyId_articleNumber: { companyId, articleNumber } } })
  const product = await prisma.product.upsert({
    where: { companyId_articleNumber: { companyId, articleNumber } },
    update: {
      name,
      ean: stringValue(mapped.ean) ?? undefined,
      gtin: stringValue(mapped.gtin) ?? stringValue(mapped.ean) ?? undefined,
      productGroupId: group.id,
      ...(ownPrice ? { ownPrice } : {}),
      currency: stringValue(mapped.currency) ?? undefined,
      stockStatus: stringValue(mapped.stockStatus) ?? undefined,
      packagingUnit: stringValue(mapped.packagingUnit) ?? undefined,
      packagingQty: integerValue(mapped.packagingQty),
      isActive: booleanValue(mapped.isActive, true),
    },
    create: {
      companyId,
      articleNumber,
      name,
      ean: stringValue(mapped.ean),
      gtin: stringValue(mapped.gtin) ?? stringValue(mapped.ean),
      productGroupId: group.id,
      ownPrice: ownPrice ?? undefined,
      currency: stringValue(mapped.currency) ?? 'EUR',
      stockStatus: stringValue(mapped.stockStatus) ?? 'Onbekend',
      packagingUnit: stringValue(mapped.packagingUnit) ?? 'stuks',
      packagingQty: integerValue(mapped.packagingQty),
      isActive: booleanValue(mapped.isActive, true),
    },
  })

  if (ownPrice && (!existing?.ownPrice || !existing.ownPrice.eq(ownPrice))) {
    await prisma.ownPriceHistory.create({
      data: { companyId, productId: product.id, recordedAt: new Date(), price: ownPrice, currency: product.currency },
    })
  }

  await syncProductMarket(companyId, product.id, mapped, ownPrice, stringValue(mapped.currency) ?? product.currency)

  const sourceUpdatedAt = stringValue(mapped.sourceUpdatedAt)
  const parsedSourceDate = sourceUpdatedAt && !Number.isNaN(Date.parse(sourceUpdatedAt)) ? new Date(sourceUpdatedAt) : null
  await prisma.productFeedLink.upsert({
    where: { companyId_feedSourceId_externalKey: { companyId, feedSourceId, externalKey: articleNumber } },
    update: { productId: product.id, sourceUpdatedAt: parsedSourceDate, lastSeenAt: new Date() },
    create: { companyId, feedSourceId, productId: product.id, externalKey: articleNumber, sourceUpdatedAt: parsedSourceDate, lastSeenAt: new Date() },
  })

  await prisma.feedItem.create({
    data: {
      companyId,
      feedSourceId,
      externalKey: articleNumber,
      rowIndex,
      rawData: raw as Prisma.InputJsonValue,
      mappedData: mapped as Prisma.InputJsonValue,
      status: 'IMPORTED',
      importedProductId: product.id,
    },
  })

  return product
}

async function processCanonicalRows(
  companyId: string,
  feedSourceId: string,
  rows: Array<{ raw: Record<string, unknown>; mapped: CanonicalFeedProduct }>,
) {
  const articleNumbers = [...new Set(
    rows
      .map((item) => stringValue(item.mapped.articleNumber))
      .filter((value): value is string => Boolean(value)),
  )]
  const existing = articleNumbers.length
    ? await prisma.product.findMany({ where: { companyId, articleNumber: { in: articleNumbers } }, select: { articleNumber: true } })
    : []
  const newSkuCount = articleNumbers.length - new Set(existing.map((product) => product.articleNumber)).size
  if (newSkuCount > 0) await assertCompanyCapacity(companyId, 'skus', newSkuCount)

  await prisma.feedItem.deleteMany({ where: { companyId, feedSourceId } })
  let imported = 0
  let errors = 0
  const errorMessages: string[] = []

  for (const [index, item] of rows.entries()) {
    try {
      await importOneProduct(companyId, feedSourceId, index + 1, item.raw, item.mapped)
      imported += 1
    } catch (error) {
      errors += 1
      const message = error instanceof Error ? error.message : 'Onbekende importfout'
      if (errorMessages.length < 20) errorMessages.push(`Rij ${index + 1}: ${message}`)
      await prisma.feedItem.create({
        data: {
          companyId,
          feedSourceId,
          externalKey: stringValue(item.mapped.articleNumber),
          rowIndex: index + 1,
          rawData: item.raw as Prisma.InputJsonValue,
          mappedData: item.mapped as Prisma.InputJsonValue,
          status: 'ERROR',
          errorMessage: message,
        },
      })
    }
  }

  return { imported, errors, errorMessages }
}

async function startRun(companyId: string, feedSourceId: string) {
  await prisma.feedSource.update({
    where: { id: feedSourceId },
    data: { lastRunStatus: FeedSyncStatus.RUNNING, syncError: null },
  })
  return prisma.feedSyncRun.create({ data: { companyId, feedSourceId, status: FeedSyncStatus.RUNNING } })
}

async function completeRun(
  feedSourceId: string,
  runId: string,
  result: { itemCount: number; errors: number; warnings?: number; message?: string },
) {
  const now = new Date()
  await prisma.feedSource.update({
    where: { id: feedSourceId },
    data: {
      lastRunAt: now,
      lastRunStatus: FeedSyncStatus.COMPLETED,
      lastItemCount: result.itemCount,
      lastErrorCount: result.errors,
      lastWarningCount: result.warnings ?? 0,
      syncError: null,
    },
  })
  await prisma.feedSyncRun.update({
    where: { id: runId },
    data: {
      status: FeedSyncStatus.COMPLETED,
      completedAt: now,
      itemCount: result.itemCount,
      errorCount: result.errors,
      warningCount: result.warnings ?? 0,
      message: result.message,
    },
  })
}

async function failRun(feedSourceId: string, runId: string, error: unknown) {
  const message = error instanceof Error ? error.message : 'Onbekende synchronisatiefout'
  const now = new Date()
  await prisma.feedSource.update({
    where: { id: feedSourceId },
    data: { lastRunAt: now, lastRunStatus: FeedSyncStatus.FAILED, syncError: message },
  })
  await prisma.feedSyncRun.update({
    where: { id: runId },
    data: { status: FeedSyncStatus.FAILED, completedAt: now, message },
  })
  return message
}

function parsedRows(parsed: ParsedFeed, mappings: Mapping[]) {
  return parsed.rows.map((row) => ({
    raw: row as Record<string, unknown>,
    mapped: mapRow(row, mappings),
  }))
}

export async function syncFeedSource(feedSourceId: string) {
  const source = await prisma.feedSource.findUnique({ where: { id: feedSourceId } })
  if (!source) throw new Error('Feedbron niet gevonden.')
  if (!source.url) throw new Error('Deze feedbron heeft geen URL.')

  const run = await startRun(source.companyId, feedSourceId)
  try {
    const parsed = await fetchAndParseFeed(source.url)
    const mappings = inferMappings(parsed.headers, parsed.rows[0] ?? {})
    await saveMappings(source.companyId, feedSourceId, mappings)
    const rows = parsedRows(parsed, mappings).map((item) => ({
      raw: item.raw,
      mapped: {
        ...item.mapped,
        countryCode: item.mapped.countryCode ?? (source.countryCode !== 'GLOBAL' ? source.countryCode : undefined),
      } as CanonicalFeedProduct,
    }))
    const processed = await processCanonicalRows(source.companyId, feedSourceId, rows)
    await prisma.feedSource.update({ where: { id: feedSourceId }, data: { format: parsed.format as FeedFormat, isActive: true } })
    await completeRun(feedSourceId, run.id, {
      itemCount: parsed.rows.length,
      errors: processed.errors,
      message: `${processed.imported} producten bijgewerkt.`,
    })
    return { rows: parsed.rows.length, columns: parsed.headers.length, format: parsed.format, ...processed }
  } catch (error) {
    const message = await failRun(feedSourceId, run.id, error)
    throw new Error(message)
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
    update: {
      name: input.sourceName,
      sourceType: input.sourceType ?? FeedSourceType.API,
      countryCode: input.countryCode ?? 'GLOBAL',
      isActive: true,
      config: input.config,
    },
    create: {
      companyId,
      sourceKey: input.sourceKey,
      name: input.sourceName,
      sourceType: input.sourceType ?? FeedSourceType.API,
      format: FeedFormat.API,
      countryCode: input.countryCode ?? 'GLOBAL',
      isActive: true,
      config: input.config,
    },
  })

  const run = await startRun(companyId, source.id)
  try {
    const normalizedProducts: CanonicalFeedProduct[] = input.products.map((product) => ({
      ...product,
      countryCode: product.countryCode ?? (input.countryCode && input.countryCode !== 'GLOBAL' ? input.countryCode : undefined),
    }))
    const headers = [...new Set(normalizedProducts.flatMap((item) => Object.keys(item)))]
    await saveMappings(
      companyId,
      source.id,
      headers.map((sourceColumn) => ({
        sourceColumn,
        targetField: sourceColumn,
        sampleValue: stringValue(normalizedProducts[0]?.[sourceColumn]) ?? '',
      })),
    )
    const processed = await processCanonicalRows(
      companyId,
      source.id,
      normalizedProducts.map((product) => ({ raw: { ...product }, mapped: product })),
    )
    await completeRun(source.id, run.id, {
      itemCount: normalizedProducts.length,
      errors: processed.errors,
      message: `${processed.imported} producten via API bijgewerkt.`,
    })
    return { feedSourceId: source.id, rows: normalizedProducts.length, ...processed }
  } catch (error) {
    const message = await failRun(source.id, run.id, error)
    throw new Error(message)
  }
}
