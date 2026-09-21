import { inferImportMapping, normalizeHeader } from '@/lib/import-mapping'
import type { ParsedImportResult } from '@/lib/import-parser'

export type BulkProductRow = {
  articleNumber: string
  productName: string
  ean: string
  mpn: string
  brand: string
  productGroup: string
  productTags: string
  ownPrice: string
  vatIncluded: string
  ownUrl: string
  costPrice: string
  country: string
  currency: string
  packagingUnit: string
  packagingQty: string
  marketMin: string
  marketMax: string
  marketAverage: string
  marketPosition: string
  marketIndex: string
  matchCount: string
}

export type DetectedCompetitor = {
  name: string
  domain: string
  country: 'NL' | 'BE'
}

export type BulkProductRecognition = {
  profile: 'prisync-horizontal' | 'generic-product-feed'
  rows: BulkProductRow[]
  detectedCompetitors: DetectedCompetitor[]
  recognizedFields: string[]
  ignoredFields: string[]
}

function normalizeNumber(value: string | undefined) {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const normalized = raw.replace(/\s/g, '').replace(',', '.')
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? String(numeric) : ''
}

function normalizeVatIncluded(value: string | undefined, priceHeader = '') {
  const raw = (value ?? '').trim().toLowerCase()
  const header = priceHeader.trim().toLowerCase()
  const combined = `${raw} ${header}`
  if (/\b(?:false|0|nee|no|excl|exclusive|excluding|ex\.?\s*(?:vat|btw)|zzgl)\b/i.test(combined)) return 'false'
  if (/\b(?:true|1|ja|yes|incl|inclusive|including|inkl)\b/i.test(combined)) return 'true'
  return ''
}

function validBarcode(value: string | undefined) {
  const digits = (value ?? '').replace(/\D/g, '')
  return [8, 12, 13, 14].includes(digits.length) ? digits : ''
}

function headerByAliases(headers: string[], aliases: string[]) {
  const normalizedAliases = new Set(aliases.map(normalizeHeader))
  return headers.find((header) => normalizedAliases.has(normalizeHeader(header))) ?? ''
}

function value(row: Record<string, string>, header: string) {
  return header ? row[header] ?? '' : ''
}

function hostnameFromLabel(label: string) {
  const clean = label.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '')
  return clean.toLowerCase()
}

function displayName(domain: string) {
  const base = domain.replace(/^www\./, '').split('.')[0] || domain
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function detectCompetitors(headers: string[]) {
  const seen = new Set<string>()
  const competitors: DetectedCompetitor[] = []
  for (const header of headers) {
    const match = header.match(/^(.+?)\s*-\s*(?:price|prijs)$/i)
    if (!match) continue
    const domain = hostnameFromLabel(match[1])
    if (!domain || seen.has(domain)) continue
    seen.add(domain)
    competitors.push({ name: displayName(domain), domain, country: domain.endsWith('.be') ? 'BE' : 'NL' })
  }
  return competitors
}

export function recognizeBulkProductFeed(parsed: ParsedImportResult): BulkProductRecognition {
  const headers = parsed.headers
  const inferred = inferImportMapping(headers)
  const productCodeHeader = headerByAliases(headers, ['Product Code', 'SKU', 'Artikelnummer', 'Productcode']) || inferred.articleNumber
  const productNameHeader = headerByAliases(headers, ['Product Name', 'Productnaam', 'Title', 'Naam']) || inferred.productName
  const barcodeHeader = headerByAliases(headers, ['Barcode', 'EAN', 'GTIN']) || inferred.ean || inferred.gtin
  const brandHeader = headerByAliases(headers, ['Brand', 'Merk']) || inferred.brand
  const categoryHeader = headerByAliases(headers, ['Category', 'Categorie', 'Product Group', 'Productgroep']) || inferred.productGroup
  const tagsHeader = headerByAliases(headers, ['Product Tags', 'Tags'])
  const ownPriceHeader = headerByAliases(headers, ['My Price', 'Eigen prijs', 'Own Price', 'Verkoopprijs']) || inferred.ownPrice
  const vatIncludedHeader = inferred.vatIncluded
  const ownUrlHeader = inferred.engelsUrl
  const costPriceHeader = headerByAliases(headers, ['My Product Cost', 'Product Cost', 'Cost Price', 'Kostprijs', 'Inkoopprijs']) || inferred.costPrice
  const marketMinHeader = headerByAliases(headers, ['Minimum Price', 'Minimum marktprijs'])
  const marketMaxHeader = headerByAliases(headers, ['Maximum Price', 'Maximum marktprijs'])
  const marketAverageHeader = headerByAliases(headers, ['Average Price', 'Gemiddelde prijs'])
  const marketPositionHeader = headerByAliases(headers, ['My Position', 'Positie'])
  const marketIndexHeader = headerByAliases(headers, ['My Index', 'Index'])
  const matchCountHeader = headerByAliases(headers, ['Number of Matches', 'Matches', 'Aantal matches'])
  const countryHeader = inferred.country
  const currencyHeader = inferred.currency
  const packagingUnitHeader = inferred.packagingUnit
  const packagingQtyHeader = inferred.packagingQty

  if (!productCodeHeader || !productNameHeader) {
    throw new Error('Artikelnummer en productnaam konden niet automatisch worden herkend.')
  }

  const rows = parsed.rows.flatMap((row) => {
    const articleNumber = value(row, productCodeHeader).trim()
    const productName = value(row, productNameHeader).trim()
    if (!articleNumber || !productName) return []
    const ean = validBarcode(value(row, barcodeHeader))
    return [{
      articleNumber,
      productName,
      ean,
      mpn: articleNumber,
      brand: value(row, brandHeader).trim(),
      productGroup: value(row, categoryHeader).trim() || 'Onbekend',
      productTags: value(row, tagsHeader).trim(),
      ownPrice: normalizeNumber(value(row, ownPriceHeader)),
      vatIncluded: normalizeVatIncluded(value(row, vatIncludedHeader), ownPriceHeader),
      ownUrl: value(row, ownUrlHeader).trim(),
      costPrice: normalizeNumber(value(row, costPriceHeader)),
      country: value(row, countryHeader).trim().toUpperCase() || 'NL',
      currency: value(row, currencyHeader).trim().toUpperCase() || 'EUR',
      packagingUnit: value(row, packagingUnitHeader).trim() || 'stuks',
      packagingQty: normalizeNumber(value(row, packagingQtyHeader)) || '1',
      marketMin: normalizeNumber(value(row, marketMinHeader)),
      marketMax: normalizeNumber(value(row, marketMaxHeader)),
      marketAverage: normalizeNumber(value(row, marketAverageHeader)),
      marketPosition: value(row, marketPositionHeader).trim(),
      marketIndex: normalizeNumber(value(row, marketIndexHeader)),
      matchCount: normalizeNumber(value(row, matchCountHeader)),
    } satisfies BulkProductRow]
  })

  const recognizedHeaders = new Set([
    productCodeHeader, productNameHeader, barcodeHeader, brandHeader, categoryHeader, tagsHeader, ownPriceHeader,
    vatIncludedHeader, ownUrlHeader, costPriceHeader, marketMinHeader, marketMaxHeader, marketAverageHeader, marketPositionHeader, marketIndexHeader,
    matchCountHeader, countryHeader, currencyHeader, packagingUnitHeader, packagingQtyHeader,
  ].filter(Boolean))

  const competitorColumns = new Set(headers.filter((header) => /\s-\s(?:price|prijs)$/i.test(header)))
  const profile = headers.some((header) => normalizeHeader(header) === normalizeHeader('My Price')) && competitorColumns.size >= 2
    ? 'prisync-horizontal'
    : 'generic-product-feed'

  return {
    profile,
    rows,
    detectedCompetitors: detectCompetitors(headers),
    recognizedFields: [...recognizedHeaders],
    ignoredFields: headers.filter((header) => !recognizedHeaders.has(header) && !competitorColumns.has(header)),
  }
}
