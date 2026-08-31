'use server'

import { ImportFormat, ImportStatus, MatchStatus, Prisma } from '@/generated/prisma/client'
import { createAuditLog, getSystemUser } from '@/lib/audit'
import { matchProducts } from '@/lib/product-matching'
import { normalizePrice } from '@/lib/price-normalization'
import { prisma } from '@/lib/prisma'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { assertCompanyCapacity } from '@/lib/company-license'
import { importPayloadSchema } from '@/lib/validators'
import { revalidatePath } from 'next/cache'

function toDecimal(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value).replace(',', '.')
  const numeric = Number(normalized)
  if (Number.isNaN(numeric)) return null
  return new Prisma.Decimal(numeric)
}

export async function processImportRowsAction(payload: unknown) {
  const parsed = importPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      message: 'Import afgekeurd door validatie.',
      warnings: [],
      errors: parsed.error.issues.map((issue) => issue.message),
    }
  }

  const systemUser = await getSystemUser()
  const warnings: string[] = []
  const errors: string[] = []
  const task = await prisma.importTask.create({
    data: {
      companyId: DEFAULT_COMPANY_ID,
      filename: parsed.data.filename,
      format: parsed.data.format as ImportFormat,
      status: ImportStatus.PROCESSING,
      totalRows: parsed.data.rows.length,
      processedRows: 0,
      errorRows: 0,
      importedBy: systemUser.id,
    },
  })

  const requestedArticleNumbers = [...new Set(parsed.data.rows.map((row, index) => row.articleNumber || `IMP-${task.id.slice(-6)}-${index + 1}`))]
  const existingProducts = await prisma.product.findMany({
    where: { companyId: DEFAULT_COMPANY_ID, articleNumber: { in: requestedArticleNumbers } },
    select: { articleNumber: true },
  })
  const newSkuCount = requestedArticleNumbers.length - new Set(existingProducts.map((product) => product.articleNumber)).size
  if (newSkuCount > 0) await assertCompanyCapacity(DEFAULT_COMPANY_ID, 'skus', newSkuCount)

  let processedRows = 0

  for (const [index, row] of parsed.data.rows.entries()) {
    try {
      const countryCode = (row.country || 'NL').toUpperCase()
      const country = await prisma.country.findUnique({ where: { code: countryCode } })
      if (!country) {
        warnings.push(`Rij ${index + 1}: land ${countryCode} bestaat niet en is overgeslagen.`)
        continue
      }
      const licensedCountry = await prisma.companyCountry.findUnique({
        where: { companyId_countryId: { companyId: DEFAULT_COMPANY_ID, countryId: country.id } },
      })
      if (!licensedCountry?.isActive) {
        warnings.push(`Rij ${index + 1}: land ${countryCode} valt niet binnen de actieve company licentie.`)
        continue
      }

      const productGroupName = row.productGroup || 'Onbekend'
      const productGroup = await prisma.productGroup.upsert({
        where: { companyId_name: { companyId: DEFAULT_COMPANY_ID, name: productGroupName } },
        update: {},
        create: { companyId: DEFAULT_COMPANY_ID, name: productGroupName, description: `Automatisch aangemaakt via import ${parsed.data.filename}` },
      })

      const articleNumber = row.articleNumber || `IMP-${task.id.slice(-6)}-${index + 1}`
      const ownPrice = toDecimal(row.ownPrice)
      const packagingQty = Number(row.packagingQty || 1) || 1
      const currency = row.currency || country.currency || 'EUR'

      const product = await prisma.product.upsert({
        where: { companyId_articleNumber: { companyId: DEFAULT_COMPANY_ID, articleNumber } },
        update: {
          ean: row.ean || undefined,
          name: row.productName || articleNumber,
          productGroupId: productGroup.id,
          ownPrice: ownPrice ?? undefined,
          packagingUnit: row.packagingUnit || undefined,
          packagingQty,
          stockStatus: row.ownStock || undefined,
          currency,
        },
        create: {
          companyId: DEFAULT_COMPANY_ID,
          articleNumber,
          ean: row.ean || null,
          gtin: row.ean || null,
          name: row.productName || articleNumber,
          productGroupId: productGroup.id,
          ownPrice,
          vatIncluded: true,
          packagingUnit: row.packagingUnit || 'stuks',
          packagingQty,
          stockStatus: row.ownStock || 'Onbekend',
          currency,
        },
      })

      if (ownPrice) {
        await prisma.ownPriceHistory.create({
          data: {
            companyId: DEFAULT_COMPANY_ID,
            productId: product.id,
            recordedAt: row.lastChecked ? new Date(row.lastChecked) : new Date(),
            price: ownPrice,
            currency,
          },
        })
      }

      const competitorName = row.competitorName || row.webshop
      if (!competitorName) {
        warnings.push(`Rij ${index + 1}: geen concurrentnaam aanwezig.`)
        processedRows += 1
        continue
      }

      const competitorWhere = { companyId_name_countryId: { companyId: DEFAULT_COMPANY_ID, name: competitorName, countryId: country.id } }
      const existingCompetitor = await prisma.competitor.findUnique({ where: competitorWhere })
      if (!existingCompetitor) await assertCompanyCapacity(DEFAULT_COMPANY_ID, 'competitors')
      const competitor = await prisma.competitor.upsert({
        where: competitorWhere,
        update: { website: row.competitorUrl || row.engelsUrl || 'https://voorbeeld.nl' },
        create: {
          companyId: DEFAULT_COMPANY_ID,
          name: competitorName,
          website: row.competitorUrl || row.engelsUrl || 'https://voorbeeld.nl',
          countryId: country.id,
        },
      })

      const rawPrice = toDecimal(row.competitorPrice)
      const normalized = rawPrice
        ? normalizePrice(rawPrice, true, country.vatRate, currency, row.packagingUnit || 'stuks', packagingQty, true, 'EUR').amount
        : null
      const offerUrl = row.competitorUrl || row.engelsUrl || `${competitor.website.replace(/\/$/, '')}/product/${articleNumber}`

      const offer = await prisma.competitorOffer.create({
        data: {
          companyId: DEFAULT_COMPANY_ID,
          competitorId: competitor.id,
          url: offerUrl,
          rawPrice,
          normalizedPrice: normalized,
          currency,
          vatIncluded: true,
          packagingUnit: row.packagingUnit || 'stuks',
          packagingQty,
          stockStatus: row.competitorStock || 'Onbekend',
          lastCheckedAt: row.lastChecked ? new Date(row.lastChecked) : new Date(),
        },
      })

      const matchResult = matchProducts(
        {
          articleNumber: product.articleNumber,
          ean: product.ean,
          gtin: product.gtin,
          name: product.name,
          packagingUnit: product.packagingUnit,
          packagingQty: product.packagingQty,
        },
        {
          sku: row.articleNumber,
          ean: row.ean,
          gtin: row.ean,
          productTitle: row.productName,
          packagingUnit: row.packagingUnit,
          packagingQty,
          url: offer.url,
        },
      )

      await prisma.productMatch.create({
        data: {
          companyId: DEFAULT_COMPANY_ID,
          productId: product.id,
          competitorOfferId: offer.id,
          confidenceScore: matchResult.score,
          matchStatus: matchResult.status as MatchStatus,
          matchEvidence: matchResult.evidence as Prisma.InputJsonValue,
          approvedBy: matchResult.status === 'CERTAIN' ? systemUser.id : null,
          approvedAt: matchResult.status === 'CERTAIN' ? new Date() : null,
        },
      })

      if (rawPrice) {
        await prisma.priceHistory.create({
          data: {
            companyId: DEFAULT_COMPANY_ID,
            competitorOfferId: offer.id,
            recordedAt: row.lastChecked ? new Date(row.lastChecked) : new Date(),
            price: rawPrice,
            normalizedPrice: normalized,
            currency,
            stockStatus: row.competitorStock || 'Onbekend',
            source: 'Importwizard',
          },
        })
      }

      await prisma.priceCheck.create({
        data: {
          companyId: DEFAULT_COMPANY_ID,
          competitorOfferId: offer.id,
          checkedAt: row.lastChecked ? new Date(row.lastChecked) : new Date(),
          foundPrice: rawPrice,
          currency,
          stockStatus: row.competitorStock || 'Onbekend',
          productTitle: row.productName || product.name,
          packagingUnit: row.packagingUnit || 'stuks',
          checkMethod: 'IMPORT',
          statusCode: 200,
          sourceUrl: offer.url,
          isSuccess: Boolean(rawPrice),
          errorMessage: rawPrice ? null : 'Prijs ontbrak in importbron',
        },
      })

      processedRows += 1
    } catch (error) {
      errors.push(`Rij ${index + 1}: ${error instanceof Error ? error.message : 'onbekende fout'}`)
    }
  }

  await prisma.importTask.update({
    where: { id: task.id },
    data: {
      status: errors.length > 0 ? ImportStatus.FAILED : ImportStatus.DONE,
      processedRows,
      errorRows: errors.length,
      errors,
      warnings,
    },
  })

  await createAuditLog({
    userId: systemUser.id,
    action: 'IMPORT_CONFIRM',
    entityType: 'ImportTask',
    entityId: task.id,
    newValue: { filename: task.filename, totalRows: parsed.data.rows.length, processedRows },
  })

  revalidatePath('/import')
  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/concurrenten')

  return {
    message: `Import verwerkt: ${processedRows} van ${parsed.data.rows.length} regels voltooid.`,
    warnings,
    errors,
  }
}
