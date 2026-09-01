'use server'

import { ImportFormat, ImportStatus, MatchStatus, Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requireWritableUser } from '@/lib/authz'
import { assertCompanyCapacity } from '@/lib/company-license'
import { matchProducts } from '@/lib/product-matching'
import { normalizePrice } from '@/lib/price-normalization'
import { prisma } from '@/lib/prisma'
import { assertSafeRemoteHttpUrl } from '@/lib/safe-remote-url'
import { importPayloadSchema } from '@/lib/validators'
import { revalidatePath } from 'next/cache'

function toDecimal(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value).replace(',', '.')
  const numeric = Number(normalized)
  if (Number.isNaN(numeric)) return null
  return new Prisma.Decimal(numeric)
}

function validDate(value: string | undefined) {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
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

  const user = await requireWritableUser()
  const companyId = user.companyId
  const mode = parsed.data.mode
  const importsProducts = mode === 'products' || mode === 'combined'
  const importsCompetitors = mode === 'competitors' || mode === 'combined'
  const warnings: string[] = []
  const errors: string[] = []

  const task = await prisma.importTask.create({
    data: {
      companyId,
      filename: parsed.data.filename,
      format: parsed.data.format as ImportFormat,
      status: ImportStatus.PROCESSING,
      totalRows: parsed.data.rows.length,
      processedRows: 0,
      errorRows: 0,
      importedBy: user.id,
    },
  })

  if (importsProducts) {
    const requestedArticleNumbers = [...new Set(parsed.data.rows.map((row, index) => row.articleNumber || `IMP-${task.id.slice(-6)}-${index + 1}`))]
    const existingProducts = await prisma.product.findMany({
      where: { companyId, articleNumber: { in: requestedArticleNumbers } },
      select: { articleNumber: true },
    })
    const newSkuCount = requestedArticleNumbers.length - new Set(existingProducts.map((product) => product.articleNumber)).size
    if (newSkuCount > 0) await assertCompanyCapacity(companyId, 'skus', newSkuCount)
  }

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
        where: { companyId_countryId: { companyId, countryId: country.id } },
      })
      if (!licensedCountry?.isActive) {
        warnings.push(`Rij ${index + 1}: land ${countryCode} is niet actief voor dit bedrijf.`)
        continue
      }

      const articleNumber = row.articleNumber?.trim()
      if (!articleNumber && importsCompetitors) {
        warnings.push(`Rij ${index + 1}: artikelnummer ontbreekt, concurrent URL kan niet worden gekoppeld.`)
        continue
      }

      const currency = row.currency || country.currency || 'EUR'
      const packagingQty = Number(row.packagingQty || 1) || 1
      const recordedAt = validDate(row.lastChecked)

      let product = articleNumber
        ? await prisma.product.findUnique({ where: { companyId_articleNumber: { companyId, articleNumber } } })
        : null

      if (importsProducts) {
        const resolvedArticleNumber = articleNumber || `IMP-${task.id.slice(-6)}-${index + 1}`
        const productGroupName = row.productGroup || 'Onbekend'
        const productGroup = await prisma.productGroup.upsert({
          where: { companyId_name: { companyId, name: productGroupName } },
          update: {},
          create: { companyId, name: productGroupName, description: `Automatisch aangemaakt via import ${parsed.data.filename}` },
        })
        const ownPrice = toDecimal(row.ownPrice)

        product = await prisma.product.upsert({
          where: { companyId_articleNumber: { companyId, articleNumber: resolvedArticleNumber } },
          update: {
            ean: row.ean || undefined,
            name: row.productName || undefined,
            productGroupId: productGroup.id,
            ownPrice: ownPrice ?? undefined,
            packagingUnit: row.packagingUnit || undefined,
            packagingQty,
            stockStatus: row.ownStock || undefined,
            currency,
          },
          create: {
            companyId,
            articleNumber: resolvedArticleNumber,
            ean: row.ean || null,
            gtin: row.ean || null,
            name: row.productName || resolvedArticleNumber,
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
            data: { companyId, productId: product.id, recordedAt, price: ownPrice, currency },
          })
        }
      }

      if (!importsCompetitors) {
        processedRows += 1
        continue
      }

      if (!product) {
        warnings.push(`Rij ${index + 1}: product ${articleNumber} bestaat niet. Importeer het product eerst of gebruik Volledige import.`)
        continue
      }

      const competitorName = (row.competitorName || row.webshop || '').trim()
      if (!competitorName) {
        warnings.push(`Rij ${index + 1}: concurrentnaam ontbreekt.`)
        continue
      }

      if (!row.competitorUrl) {
        warnings.push(`Rij ${index + 1}: concurrent URL ontbreekt.`)
        continue
      }

      const safeOfferUrl = (await assertSafeRemoteHttpUrl(row.competitorUrl)).toString()
      const website = new URL(safeOfferUrl).origin
      const competitorWhere = { companyId_name_countryId: { companyId, name: competitorName, countryId: country.id } }
      const existingCompetitor = await prisma.competitor.findUnique({ where: competitorWhere })
      if (!existingCompetitor) await assertCompanyCapacity(companyId, 'competitors')

      const competitor = await prisma.competitor.upsert({
        where: competitorWhere,
        update: { website, isActive: true },
        create: { companyId, name: competitorName, website, countryId: country.id, isActive: true },
      })

      const rawPrice = toDecimal(row.competitorPrice)
      const normalized = rawPrice
        ? normalizePrice(rawPrice, true, country.vatRate, currency, row.packagingUnit || product.packagingUnit || 'stuks', packagingQty, true, 'EUR').amount
        : null

      const existingOffer = await prisma.competitorOffer.findUnique({
        where: { companyId_competitorId_url: { companyId, competitorId: competitor.id, url: safeOfferUrl } },
        include: { productMatch: true },
      })
      if (existingOffer?.productMatch && existingOffer.productMatch.productId !== product.id) {
        warnings.push(`Rij ${index + 1}: deze concurrent URL is al aan een ander product gekoppeld.`)
        continue
      }

      const offer = existingOffer
        ? await prisma.competitorOffer.update({
            where: { id: existingOffer.id },
            data: {
              rawPrice: rawPrice ?? undefined,
              normalizedPrice: normalized ?? undefined,
              currency,
              packagingUnit: row.packagingUnit || product.packagingUnit || 'stuks',
              packagingQty,
              stockStatus: row.competitorStock || undefined,
              lastCheckedAt: recordedAt,
              isActive: true,
            },
          })
        : await prisma.competitorOffer.create({
            data: {
              companyId,
              competitorId: competitor.id,
              url: safeOfferUrl,
              rawPrice,
              normalizedPrice: normalized,
              currency,
              vatIncluded: true,
              packagingUnit: row.packagingUnit || product.packagingUnit || 'stuks',
              packagingQty,
              stockStatus: row.competitorStock || 'Onbekend',
              lastCheckedAt: recordedAt,
              isActive: true,
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
          sku: articleNumber,
          ean: row.ean,
          gtin: row.ean,
          productTitle: row.productName || product.name,
          packagingUnit: row.packagingUnit,
          packagingQty,
          url: offer.url,
        },
      )

      await prisma.productMatch.upsert({
        where: { competitorOfferId: offer.id },
        update: {
          productId: product.id,
          confidenceScore: matchResult.score,
          matchStatus: matchResult.status as MatchStatus,
          matchEvidence: matchResult.evidence as Prisma.InputJsonValue,
          approvedBy: matchResult.status === 'CERTAIN' ? user.id : null,
          approvedAt: matchResult.status === 'CERTAIN' ? new Date() : null,
        },
        create: {
          companyId,
          productId: product.id,
          competitorOfferId: offer.id,
          confidenceScore: matchResult.score,
          matchStatus: matchResult.status as MatchStatus,
          matchEvidence: matchResult.evidence as Prisma.InputJsonValue,
          approvedBy: matchResult.status === 'CERTAIN' ? user.id : null,
          approvedAt: matchResult.status === 'CERTAIN' ? new Date() : null,
        },
      })

      if (rawPrice) {
        await prisma.priceHistory.create({
          data: {
            companyId,
            competitorOfferId: offer.id,
            recordedAt,
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
          companyId,
          competitorOfferId: offer.id,
          checkedAt: recordedAt,
          foundPrice: rawPrice,
          currency,
          stockStatus: row.competitorStock || 'Onbekend',
          productTitle: row.productName || product.name,
          packagingUnit: row.packagingUnit || product.packagingUnit || 'stuks',
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
    userId: user.id,
    action: 'IMPORT_CONFIRM',
    entityType: 'ImportTask',
    entityId: task.id,
    newValue: { companyId, mode, filename: task.filename, totalRows: parsed.data.rows.length, processedRows },
  })

  revalidatePath('/import')
  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/concurrenten')

  return {
    message: errors.length
      ? `Import deels verwerkt: ${processedRows} van ${parsed.data.rows.length} regels voltooid, ${errors.length} fouten.`
      : `Import afgerond: ${processedRows} van ${parsed.data.rows.length} regels verwerkt.`,
    warnings,
    errors,
  }
}
