'use server'

import { ImportFormat, ImportStatus, Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requireWritableUser } from '@/lib/authz'
import type { BulkProductRow } from '@/lib/bulk-product-import'
import { assertCompanyCapacity } from '@/lib/company-license'
import { saveProductOnboardingFields } from '@/lib/product-onboarding-fields'
import { discoverProductCandidates } from '@/lib/smart-discovery'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const rowSchema = z.object({
  articleNumber: z.string().min(1),
  productName: z.string().min(1),
  ean: z.string().default(''),
  mpn: z.string().default(''),
  brand: z.string().default(''),
  productGroup: z.string().default('Onbekend'),
  productTags: z.string().default(''),
  ownPrice: z.string().default(''),
  vatIncluded: z.string().default(''),
  ownUrl: z.string().default(''),
  costPrice: z.string().default(''),
  country: z.string().default('NL'),
  currency: z.string().default('EUR'),
  packagingUnit: z.string().default('stuks'),
  packagingQty: z.string().default('1'),
  marketMin: z.string().default(''),
  marketMax: z.string().default(''),
  marketAverage: z.string().default(''),
  marketPosition: z.string().default(''),
  marketIndex: z.string().default(''),
  matchCount: z.string().default(''),
})

const payloadSchema = z.object({
  filename: z.string().min(1),
  format: z.enum(['CSV', 'XLSX']),
  profile: z.enum(['prisync-horizontal', 'generic-product-feed']),
  rows: z.array(rowSchema).min(1).max(50_000),
})

function decimal(value: string) {
  const numeric = Number(value.replace(',', '.'))
  return value && Number.isFinite(numeric) ? new Prisma.Decimal(numeric) : null
}

function vatIncluded(value: string, fallback = true) {
  const normalized = value.trim().toLowerCase()
  if (['false', '0', 'nee', 'no', 'excl', 'exclusive', 'excluding'].includes(normalized)) return false
  if (['true', '1', 'ja', 'yes', 'incl', 'inclusive', 'including'].includes(normalized)) return true
  return fallback
}

function positiveInteger(value: string) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : 1
}

function reportNote(row: BulkProductRow) {
  const stats = [
    row.productTags ? `tags=${row.productTags}` : '',
    row.marketIndex ? `index=${row.marketIndex}` : '',
    row.marketPosition ? `positie=${row.marketPosition}` : '',
    row.marketMin ? `markt_min=${row.marketMin}` : '',
    row.marketAverage ? `markt_gem=${row.marketAverage}` : '',
    row.marketMax ? `markt_max=${row.marketMax}` : '',
    row.matchCount ? `matches=${row.matchCount}` : '',
  ].filter(Boolean)
  return stats.length ? `Bulk prijsfeed: ${stats.join(' | ')}` : null
}

async function inChunks<T>(items: T[], size: number, worker: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(worker))
  }
}

export async function processBulkProductImportAction(payload: unknown) {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) {
    return { ok: false, message: 'Bulkimport afgekeurd door validatie.', errors: parsed.error.issues.map((issue) => issue.message), summary: { products: 0, markets: 0, groups: 0 } }
  }

  const user = await requireWritableUser()
  const companyId = user.companyId
  const rows = parsed.data.rows
  const articleNumbers = [...new Set(rows.map((row) => row.articleNumber.trim()).filter(Boolean))]
  const countryCodes = [...new Set(rows.map((row) => (row.country || 'NL').toUpperCase()))]
  const groupNames = [...new Set(rows.map((row) => row.productGroup.trim() || 'Onbekend'))]

  const [existingProducts, countries, companyCountries] = await Promise.all([
    prisma.product.findMany({ where: { companyId, articleNumber: { in: articleNumbers } }, select: { articleNumber: true } }),
    prisma.country.findMany({ where: { code: { in: countryCodes } } }),
    prisma.companyCountry.findMany({ where: { companyId, isActive: true }, select: { countryId: true } }),
  ])
  const newSkuCount = articleNumbers.length - existingProducts.length
  if (newSkuCount > 0) await assertCompanyCapacity(companyId, 'skus', newSkuCount)

  const task = await prisma.importTask.create({
    data: {
      companyId,
      filename: parsed.data.filename,
      format: parsed.data.format as ImportFormat,
      status: ImportStatus.PROCESSING,
      totalRows: rows.length,
      processedRows: 0,
      errorRows: 0,
      importedBy: user.id,
    },
  })

  const errors: string[] = []
  const warnings: string[] = []
  let processed = 0
  let marketCount = 0
  let suggestionCount = 0
  const discoveryTargets: Array<{ productId: string; countryId: string; articleNumber: string }> = []

  try {
    const groups = await Promise.all(groupNames.map((name) => prisma.productGroup.upsert({
      where: { companyId_name: { companyId, name } },
      update: { isActive: true },
      create: { companyId, name, description: `Automatisch aangemaakt via bulkimport ${parsed.data.filename}`, isActive: true },
    })))
    const groupByName = new Map(groups.map((group) => [group.name, group]))
    const countryByCode = new Map(countries.map((country) => [country.code.toUpperCase(), country]))
    const activeCountryIds = new Set(companyCountries.map((country) => country.countryId))

    await inChunks(rows, 10, async (row) => {
      try {
        const group = groupByName.get(row.productGroup.trim() || 'Onbekend')
        if (!group) throw new Error('Productgroep kon niet worden bepaald.')
        const ownPrice = decimal(row.ownPrice)
        const country = countryByCode.get((row.country || 'NL').toUpperCase())
        const note = reportNote(row)
        const existing = await prisma.product.findUnique({ where: { companyId_articleNumber: { companyId, articleNumber: row.articleNumber.trim() } }, select: { vatIncluded: true } })
        const product = await prisma.product.upsert({
          where: { companyId_articleNumber: { companyId, articleNumber: row.articleNumber.trim() } },
          update: {
            name: row.productName.trim(),
            ean: row.ean || undefined,
            productGroupId: group.id,
            ownPrice: ownPrice ?? undefined,
            vatIncluded: vatIncluded(row.vatIncluded, existing?.vatIncluded ?? true),
            packagingUnit: row.packagingUnit || 'stuks',
            packagingQty: positiveInteger(row.packagingQty),
            currency: row.currency || 'EUR',
            notes: note ?? undefined,
            isActive: true,
          },
          create: {
            companyId,
            articleNumber: row.articleNumber.trim(),
            ean: row.ean || null,
            name: row.productName.trim(),
            productGroupId: group.id,
            ownPrice,
            vatIncluded: vatIncluded(row.vatIncluded, true),
            packagingUnit: row.packagingUnit || 'stuks',
            packagingQty: positiveInteger(row.packagingQty),
            currency: row.currency || 'EUR',
            stockStatus: 'Onbekend',
            notes: note,
            isActive: true,
          },
        })

        await saveProductOnboardingFields(companyId, product.id, {
          mpn: row.mpn || row.articleNumber,
          brand: row.brand,
          costPrice: Number(row.costPrice) > 0 ? row.costPrice : undefined,
        })

        if (country && activeCountryIds.has(country.id)) {
          await prisma.productMarket.upsert({
            where: { companyId_productId_countryId: { companyId, productId: product.id, countryId: country.id } },
            update: { ownPrice: ownPrice ?? undefined, currency: row.currency || country.currency, ownUrl: row.ownUrl || undefined, isActive: true },
            create: { companyId, productId: product.id, countryId: country.id, ownPrice, currency: row.currency || country.currency, ownUrl: row.ownUrl || undefined, stockStatus: 'Onbekend', isActive: true },
          })
          marketCount += 1
          discoveryTargets.push({ productId: product.id, countryId: country.id, articleNumber: row.articleNumber.trim() })
        } else {
          warnings.push(`${row.articleNumber}: markt ${row.country || 'NL'} is niet actief of niet herkend.`)
        }
        processed += 1
      } catch (error) {
        errors.push(`${row.articleNumber}: ${error instanceof Error ? error.message : 'onbekende fout'}`)
      }
    })

    if (user.role === 'SUPER_ADMIN' || user.permissions.includes('competitors.write')) {
      const uniqueTargets = [...new Map(discoveryTargets.map((target) => [`${target.productId}:${target.countryId}`, target])).values()]
      const immediateTargets = uniqueTargets.slice(0, 8)

      await inChunks(immediateTargets, 2, async (target) => {
        try {
          const discovery = await discoverProductCandidates({
            companyId,
            productId: target.productId,
            countryId: target.countryId,
          })
          suggestionCount += discovery.created
        } catch (error) {
          warnings.push(`${target.articleNumber}: AI concurrentsuggesties konden niet direct worden opgebouwd, dit wordt later opnieuw geprobeerd.`)
          console.error('Bulk product competitor discovery failed', { companyId, productId: target.productId, error })
        }
      })

      if (uniqueTargets.length > immediateTargets.length) {
        warnings.push(`Voor ${uniqueTargets.length - immediateTargets.length} extra producten worden concurrentsuggesties automatisch via de achtergrondcontrole aangevuld.`)
      }
    }

    await prisma.importTask.update({
      where: { id: task.id },
      data: { status: errors.length ? ImportStatus.FAILED : ImportStatus.DONE, processedRows: processed, errorRows: errors.length, errors, warnings },
    })

    await createAuditLog({
      userId: user.id,
      action: 'BULK_PRODUCT_IMPORT',
      entityType: 'ImportTask',
      entityId: task.id,
      newValue: { companyId, filename: parsed.data.filename, profile: parsed.data.profile, products: processed, markets: marketCount, groups: groupNames.length, suggestions: suggestionCount, errors: errors.length },
    })

    for (const path of ['/import', '/import/bulk', '/producten', '/dashboard', '/productmatches']) revalidatePath(path)

    return {
      ok: errors.length === 0,
      message: errors.length ? `${processed} producten verwerkt, ${errors.length} regels met fouten.` : `${processed} producten succesvol geïmporteerd.`,
      errors,
      warnings,
      summary: { products: processed, markets: marketCount, groups: groupNames.length, suggestions: suggestionCount },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bulkimport is onverwacht gestopt.'
    await prisma.importTask.update({ where: { id: task.id }, data: { status: ImportStatus.FAILED, processedRows: processed, errorRows: Math.max(1, errors.length), errors: [...errors, message], warnings } })
    return { ok: false, message, errors: [...errors, message], warnings, summary: { products: processed, markets: marketCount, groups: groupNames.length, suggestions: suggestionCount } }
  }
}
