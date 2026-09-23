'use server'

import { ImportFormat, ImportStatus, MatchStatus, Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requireWritableUser } from '@/lib/authz'
import { assertCompanyCapacity } from '@/lib/company-license'
import { saveProductOnboardingFields } from '@/lib/product-onboarding-fields'
import { discoverProductCandidates } from '@/lib/smart-discovery'
import { matchProducts } from '@/lib/product-matching'
import { normalizePrice } from '@/lib/price-normalization'
import { prisma } from '@/lib/prisma'
import { mergedGroupTarget, productGroupLabel } from '@/lib/product-groups'
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

function importedVatIncluded(value: string | undefined, fallback = true) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  if (['false', '0', 'nee', 'no', 'excl', 'exclusive', 'excluding', 'excl. btw', 'excl btw', 'ex vat'].includes(normalized)) return false
  if (['true', '1', 'ja', 'yes', 'incl', 'inclusive', 'including', 'incl. btw', 'incl btw', 'inc vat'].includes(normalized)) return true
  if (/\b(?:excl|exclusive|excluding|ex\.?\s*(?:vat|btw)|zzgl)\b/i.test(normalized)) return false
  if (/\b(?:incl|inclusive|including|inkl)\b/i.test(normalized)) return true
  return fallback
}

function validDate(value: string | undefined) {
  if (!value) return new Date()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function competitorKey(name: string, countryId: string) {
  return `${countryId}\u0000${name}`
}

function productMarketKey(productId: string, countryId: string) {
  return `${productId}\u0000${countryId}`
}

export async function processImportRowsAction(payload: unknown) {
  const parsed = importPayloadSchema.safeParse(payload)
  if (!parsed.success) {
    return {
      message: 'Import afgekeurd door validatie.',
      warnings: [],
      errors: parsed.error.issues.map((issue) => issue.message),
      summary: { products: 0, markets: 0, competitorUrls: 0, readyForMonitoring: 0 },
    }
  }

  const user = await requireWritableUser()
  const companyId = user.companyId
  const mode = parsed.data.mode
  const importsProducts = mode === 'products' || mode === 'combined'
  const importsCompetitors = mode === 'competitors' || mode === 'combined'
  const canManagePricing = user.role === 'SUPER_ADMIN' || user.permissions.includes('pricing.manage')
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

  const resolvedArticleNumbers = parsed.data.rows.map((row, index) => {
    const articleNumber = row.articleNumber?.trim()
    return articleNumber || (importsProducts ? `IMP-${task.id.slice(-6)}-${index + 1}` : '')
  })
  const requestedArticleNumbers = [...new Set(resolvedArticleNumbers.filter(Boolean))]
  const countryCodes = [...new Set(parsed.data.rows.map((row) => (row.country || 'NL').toUpperCase()))]
  const sourceGroupNames = importsProducts
    ? [...new Set(parsed.data.rows.map((row) => row.productGroup?.trim() || 'Onbekend'))]
    : []
  const groupNames = importsProducts ? [...new Set([...sourceGroupNames.filter((name) => !/^\d+$/.test(name)), 'Onbekend'])] : []

  const [existingProducts, countries, companyCountries, existingGroups] = await Promise.all([
    requestedArticleNumbers.length
      ? prisma.product.findMany({ where: { companyId, articleNumber: { in: requestedArticleNumbers } } })
      : Promise.resolve([]),
    prisma.country.findMany({ where: { code: { in: countryCodes } } }),
    prisma.companyCountry.findMany({ where: { companyId }, select: { countryId: true, isActive: true } }),
    groupNames.length
      ? prisma.productGroup.findMany({ where: { companyId, name: { in: [...new Set([...groupNames, ...sourceGroupNames])] } } })
      : Promise.resolve([]),
  ])

  const productCache = new Map(existingProducts.map((product) => [product.articleNumber, product]))
  if (importsProducts) {
    const newSkuCount = requestedArticleNumbers.length - productCache.size
    if (newSkuCount > 0) await assertCompanyCapacity(companyId, 'skus', newSkuCount)
  }

  const existingMarketPrices = existingProducts.length && countries.length
    ? await prisma.productMarket.findMany({
        where: {
          companyId,
          productId: { in: existingProducts.map((product) => product.id) },
          countryId: { in: countries.map((country) => country.id) },
        },
        select: { productId: true, countryId: true, ownPrice: true },
      })
    : []
  const marketPriceCache = new Map(existingMarketPrices.map((market) => [productMarketKey(market.productId, market.countryId), market.ownPrice]))

  const countryByCode = new Map(countries.map((country) => [country.code.toUpperCase(), country]))
  const activeMarketIds = new Set(companyCountries.filter((item) => item.isActive).map((item) => item.countryId))
  const groupCache = new Map(existingGroups.map((group) => [group.name, group]))
  // Keep the original feed key as an alias after a category merge.
  const aliases = existingGroups.filter((group) => mergedGroupTarget(group.description))
  if (aliases.length) {
    const targetIds = [...new Set(aliases.map((group) => mergedGroupTarget(group.description)!))]
    const targets = await prisma.productGroup.findMany({
      where: { companyId, id: { in: targetIds }, isActive: true },
    })
    const targetById = new Map(targets.map((group) => [group.id, group]))
    for (const alias of aliases) {
      const target = targetById.get(mergedGroupTarget(alias.description)!)
      if (!target) throw new Error('Een samengevoegde productgroep heeft geen actief doel. Controleer het productgroepenbeheer.')
      groupCache.set(alias.name, target)
    }
  }
  for (const groupName of groupNames) {
    if (groupCache.has(groupName)) continue
    const group = await prisma.productGroup.upsert({
      where: { companyId_name: { companyId, name: groupName } },
      update: {},
      create: { companyId, name: groupName, description: `Automatisch aangemaakt via import ${parsed.data.filename}` },
    })
    groupCache.set(groupName, group)
  }

  const competitorNames = importsCompetitors
    ? [...new Set(parsed.data.rows.map((row) => (row.competitorName || row.webshop || '').trim()).filter(Boolean))]
    : []
  const existingCompetitors = competitorNames.length && countries.length
    ? await prisma.competitor.findMany({
        where: { companyId, name: { in: competitorNames }, countryId: { in: countries.map((country) => country.id) } },
      })
    : []
  const competitorCache = new Map(existingCompetitors.map((competitor) => [competitorKey(competitor.name, competitor.countryId), competitor]))
  const onboardingInitialized = new Set<string>()

  let processedRows = 0
  let productRows = 0
  let marketRows = 0
  let competitorUrlRows = 0
  let monitoringReadyRows = 0
  let suggestionCount = 0
  const discoveryTargets: Array<{ productId: string; countryId: string; articleNumber: string }> = []

  for (const [index, row] of parsed.data.rows.entries()) {
    try {
      const countryCode = (row.country || 'NL').toUpperCase()
      const country = countryByCode.get(countryCode) ?? null
      const marketIsActive = Boolean(country && activeMarketIds.has(country.id))

      if (!country) {
        warnings.push(`Rij ${index + 1}: land ${countryCode} is niet herkend. Het product wordt wel geïmporteerd, maar niet aan een markt gekoppeld.`)
      } else if (!marketIsActive) {
        warnings.push(`Rij ${index + 1}: land ${countryCode} is niet actief voor dit bedrijf. Het product wordt wel geïmporteerd, maar monitoring voor deze markt blijft uit.`)
      }

      const articleNumber = row.articleNumber?.trim()
      if (!articleNumber && importsCompetitors && !importsProducts) {
        warnings.push(`Rij ${index + 1}: artikelnummer ontbreekt, concurrent URL kan niet worden gekoppeld.`)
        continue
      }

      const currency = row.currency || country?.currency || 'EUR'
      const packagingQty = Number(row.packagingQty || 1) || 1
      const recordedAt = validDate(row.lastChecked)
      const resolvedArticleNumber = resolvedArticleNumbers[index]
      let product = resolvedArticleNumber ? productCache.get(resolvedArticleNumber) ?? null : null

      if (importsProducts) {
        const pricingInputPresent = Boolean(row.costPrice || row.minimumMarginPct || row.targetMarginPct || row.minimumPrice || row.maximumPrice || row.pricingMode || row.pricingCooldownHours)
        if (pricingInputPresent && !canManagePricing) throw new Error('Onvoldoende rechten om pricinginstellingen te importeren.')

        const sourceCategory = row.productGroup?.trim() || 'Onbekend'
        const incomingGroup = groupCache.get(sourceCategory)
        const hasReadableCategory = !/^\d+$/.test(sourceCategory) || Boolean(incomingGroup && productGroupLabel(incomingGroup) !== 'Nog niet ingedeeld')
        const productGroup = hasReadableCategory ? incomingGroup ?? groupCache.get('Onbekend') : groupCache.get('Onbekend')
        if (!productGroup) throw new Error('De standaardcategorie voor niet ingedeelde producten ontbreekt.')
        const ownPrice = toDecimal(row.ownPrice)
        const previousOwnPrice = product?.ownPrice ?? null

        product = await prisma.product.upsert({
          where: { companyId_articleNumber: { companyId, articleNumber: resolvedArticleNumber } },
          update: {
            ean: row.ean || undefined,
            gtin: row.gtin || undefined,
            name: row.productName || undefined,
            productGroupId: hasReadableCategory ? productGroup.id : undefined,
            ownPrice: ownPrice ?? undefined,
            vatIncluded: importedVatIncluded(row.vatIncluded, product?.vatIncluded ?? true),
            packagingUnit: row.packagingUnit || undefined,
            packagingQty,
            stockStatus: row.ownStock || undefined,
            currency,
            isActive: true,
          },
          create: {
            companyId,
            articleNumber: resolvedArticleNumber,
            ean: row.ean || null,
            gtin: row.gtin || null,
            name: row.productName || resolvedArticleNumber,
            productGroupId: productGroup.id,
            ownPrice,
            vatIncluded: importedVatIncluded(row.vatIncluded, true),
            packagingUnit: row.packagingUnit || 'stuks',
            packagingQty,
            stockStatus: row.ownStock || 'Onbekend',
            currency,
            isActive: true,
          },
        })
        productCache.set(resolvedArticleNumber, product)

        const onboardingFieldsPresent = Boolean(row.mpn || row.brand || row.model || row.costPrice || row.minimumMarginPct || row.targetMarginPct || row.minimumPrice || row.maximumPrice || row.pricingMode || row.pricingCooldownHours)
        if (!onboardingInitialized.has(product.id) || onboardingFieldsPresent) {
          await saveProductOnboardingFields(companyId, product.id, {
            mpn: row.mpn,
            brand: row.brand,
            model: row.model,
            costPrice: row.costPrice,
            minimumMarginPct: row.minimumMarginPct,
            targetMarginPct: row.targetMarginPct,
            minimumPrice: row.minimumPrice,
            maximumPrice: row.maximumPrice,
            pricingMode: row.pricingMode,
            pricingCooldownHours: row.pricingCooldownHours,
          })
          onboardingInitialized.add(product.id)
        }
        productRows += 1

        const historyCountryId = country && marketIsActive ? country.id : null
        const previousHistoryPrice = historyCountryId
          ? marketPriceCache.get(productMarketKey(product.id, historyCountryId)) ?? null
          : previousOwnPrice

        if (country && marketIsActive) {
          await prisma.productMarket.upsert({
            where: { companyId_productId_countryId: { companyId, productId: product.id, countryId: country.id } },
            update: {
              ownPrice: ownPrice ?? undefined,
              currency,
              ownUrl: row.engelsUrl || undefined,
              stockStatus: row.ownStock || undefined,
              isActive: true,
            },
            create: {
              companyId,
              productId: product.id,
              countryId: country.id,
              ownPrice,
              currency,
              ownUrl: row.engelsUrl || null,
              stockStatus: row.ownStock || 'Onbekend',
              isActive: true,
            },
          })
          if (ownPrice) marketPriceCache.set(productMarketKey(product.id, country.id), ownPrice)
          marketRows += 1
          discoveryTargets.push({ productId: product.id, countryId: country.id, articleNumber: product.articleNumber })
        }

        if (ownPrice && (!previousHistoryPrice || !previousHistoryPrice.eq(ownPrice))) {
          await prisma.ownPriceHistory.create({
            data: {
              companyId,
              productId: product.id,
              countryId: historyCountryId,
              recordedAt,
              price: ownPrice,
              currency,
            },
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

      if (!country || !marketIsActive) {
        if (importsProducts) processedRows += 1
        warnings.push(`Rij ${index + 1}: concurrentmonitoring is niet gestart omdat markt ${countryCode} niet actief is.`)
        continue
      }

      const competitorName = (row.competitorName || row.webshop || '').trim()
      if (!competitorName) {
        if (importsProducts) processedRows += 1
        warnings.push(`Rij ${index + 1}: concurrentnaam ontbreekt. Product is geïmporteerd, monitoring nog niet.`)
        continue
      }

      if (!row.competitorUrl) {
        if (importsProducts) processedRows += 1
        warnings.push(`Rij ${index + 1}: concurrent URL ontbreekt. Product is geïmporteerd, monitoring nog niet.`)
        continue
      }

      const safeOfferUrl = (await assertSafeRemoteHttpUrl(row.competitorUrl)).toString()
      const website = new URL(safeOfferUrl).origin
      const cacheKey = competitorKey(competitorName, country.id)
      let competitor = competitorCache.get(cacheKey) ?? null
      if (!competitor) {
        await assertCompanyCapacity(companyId, 'competitors')
        competitor = await prisma.competitor.upsert({
          where: { companyId_name_countryId: { companyId, name: competitorName, countryId: country.id } },
          update: { website, isActive: true },
          create: { companyId, name: competitorName, website, countryId: country.id, isActive: true },
        })
        competitorCache.set(cacheKey, competitor)
      } else if (competitor.website !== website || !competitor.isActive) {
        competitor = await prisma.competitor.update({ where: { id: competitor.id }, data: { website, isActive: true } })
        competitorCache.set(cacheKey, competitor)
      }

      const rawPrice = toDecimal(row.competitorPrice)
      const normalized = rawPrice
        ? normalizePrice(rawPrice, true, country.vatRate, currency, row.packagingUnit || product.packagingUnit || 'stuks', packagingQty, true, 'EUR').amount
        : null

      const existingOffer = await prisma.competitorOffer.findUnique({
        where: { companyId_competitorId_url: { companyId, competitorId: competitor.id, url: safeOfferUrl } },
        include: { productMatch: true },
      })
      if (existingOffer?.productMatch && existingOffer.productMatch.productId !== product.id) {
        if (importsProducts) processedRows += 1
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
              lastCheckedAt: rawPrice ? recordedAt : undefined,
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
              lastCheckedAt: rawPrice ? recordedAt : null,
              isActive: true,
            },
          })
      competitorUrlRows += 1

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
          sku: articleNumber || product.articleNumber,
          ean: row.ean,
          gtin: row.gtin,
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
      if (matchResult.status === 'CERTAIN') monitoringReadyRows += 1

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
            isSuccess: true,
          },
        })
      }

      processedRows += 1
    } catch (error) {
      errors.push(`Rij ${index + 1}: ${error instanceof Error ? error.message : 'onbekende fout'}`)
    }
  }

  if (importsProducts && (user.role === 'SUPER_ADMIN' || user.permissions.includes('competitors.write'))) {
    const uniqueTargets = [...new Map(discoveryTargets.map((target) => [`${target.productId}:${target.countryId}`, target])).values()]
    const immediateTargets = uniqueTargets.slice(0, 12)

    for (let index = 0; index < immediateTargets.length; index += 2) {
      await Promise.all(immediateTargets.slice(index, index + 2).map(async (target) => {
        try {
          const discovery = await discoverProductCandidates({
            companyId,
            productId: target.productId,
            countryId: target.countryId,
          })
          suggestionCount += discovery.created
        } catch (error) {
          warnings.push(`${target.articleNumber}: AI concurrentsuggesties konden niet direct worden opgebouwd en worden later opnieuw geprobeerd.`)
          console.error('Import competitor discovery failed', { companyId, productId: target.productId, error })
        }
      }))
    }

    if (uniqueTargets.length > immediateTargets.length) {
      warnings.push(`Voor ${uniqueTargets.length - immediateTargets.length} extra producten worden AI concurrentsuggesties automatisch via de achtergrondcontrole aangevuld.`)
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
    newValue: {
      companyId,
      mode,
      filename: task.filename,
      totalRows: parsed.data.rows.length,
      processedRows,
      productRows,
      marketRows,
      competitorUrlRows,
      monitoringReadyRows,
      suggestionCount,
    },
  })

  revalidatePath('/import')
  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/concurrenten')
  revalidatePath('/productmatches')
  revalidatePath('/waarschuwingen')
  revalidatePath('/monitoring')
  revalidatePath('/prijsstrategie')
  revalidatePath('/prijsautomatisering')

  return {
    message: errors.length
      ? `Import deels verwerkt: ${processedRows} van ${parsed.data.rows.length} regels voltooid, ${errors.length} fouten.`
      : `Import afgerond: ${processedRows} van ${parsed.data.rows.length} regels verwerkt.`,
    warnings,
    errors,
    summary: {
      products: productRows,
      markets: marketRows,
      competitorUrls: competitorUrlRows,
      readyForMonitoring: monitoringReadyRows,
      suggestions: suggestionCount,
    },
  }
}
