'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { Prisma } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

const MAX_SELECTED_DELETE = 250

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim()
}

function filteredProductWhere(actorCompanyId: string, formData: FormData): Prisma.ProductWhereInput {
  const q = text(formData, 'filterQ') || undefined
  const productGroupId = text(formData, 'filterProductGroupId') || undefined
  const countryId = text(formData, 'filterCountryId') || undefined
  const competitorId = text(formData, 'filterCompetitorId') || undefined
  const identifierStatus = text(formData, 'filterIdentifierStatus') || undefined
  const feedSourceId = text(formData, 'filterFeedSourceId') || undefined

  return {
    companyId: actorCompanyId,
    isActive: true,
    productGroupId,
    AND: [
      q ? {
        OR: [
          { articleNumber: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { ean: { contains: q } },
          { gtin: { contains: q } },
        ],
      } : {},
      countryId ? {
        OR: [
          { productMarkets: { some: { companyId: actorCompanyId, countryId, isActive: true } } },
          {
            matches: {
              some: {
                companyId: actorCompanyId,
                competitorOffer: {
                  competitor: { companyId: actorCompanyId, countryId },
                },
              },
            },
          },
        ],
      } : {},
      identifierStatus === 'ontbreekt'
        ? { AND: [{ ean: null }, { gtin: null }] }
        : identifierStatus === 'aanwezig'
          ? { OR: [{ ean: { not: null } }, { gtin: { not: null } }] }
          : {},
      competitorId ? {
        matches: {
          some: {
            companyId: actorCompanyId,
            competitorOffer: { competitorId, isActive: true },
          },
        },
      } : {},
      feedSourceId ? {
        feedLinks: { some: { companyId: actorCompanyId, feedSourceId, feedSource: { companyId: actorCompanyId } } },
      } : {},
    ],
  }
}

export async function deleteSelectedProductsAction(formData: FormData) {
  const actor = await requirePermission('products.write')
  const scope = text(formData, 'deleteScope')

  let products: Array<{ id: string; articleNumber: string; name: string }>

  if (scope === 'filtered') {
    products = await prisma.product.findMany({
      where: filteredProductWhere(actor.companyId, formData),
      select: { id: true, articleNumber: true, name: true },
      orderBy: { id: 'asc' },
    })
  } else {
    const productIds = [...new Set(
      formData.getAll('productIds').map((value) => String(value)).filter(Boolean),
    )].slice(0, MAX_SELECTED_DELETE)

    if (productIds.length === 0) redirect('/producten?selectie=leeg')

    products = await prisma.product.findMany({
      where: { id: { in: productIds }, companyId: actor.companyId },
      select: { id: true, articleNumber: true, name: true },
    })
  }

  if (products.length === 0) redirect('/producten?selectie=ongeldig')

  const expectedCount = Number(text(formData, 'expectedCount'))
  if (!Number.isSafeInteger(expectedCount) || expectedCount !== products.length) {
    throw new Error('De selectie is veranderd. Vernieuw het productenoverzicht en bevestig opnieuw voordat je verwijdert.')
  }

  const ids = products.map((product) => product.id)

  await prisma.$transaction(async (tx) => {
    const chunkSize = 5000
    for (let offset = 0; offset < ids.length; offset += chunkSize) {
      const chunk = ids.slice(offset, offset + chunkSize)
      await tx.productMatch.deleteMany({
        where: { companyId: actor.companyId, productId: { in: chunk } },
      })
      await tx.product.deleteMany({
        where: { companyId: actor.companyId, id: { in: chunk } },
      })
    }
  })

  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: scope === 'filtered' ? 'PRODUCTS_FILTERED_BULK_DELETED' : 'PRODUCTS_BULK_DELETED',
    entityType: 'Product',
    entityId: `bulk:${ids.length}`,
    newValue: {
      count: ids.length,
      scope: scope === 'filtered' ? 'FILTERED_RESULTS' : 'SELECTED_IDS',
      products: products.slice(0, 100).map((product) => ({
        id: product.id,
        articleNumber: product.articleNumber,
        name: product.name,
      })),
      auditListTruncated: products.length > 100,
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/productmatches')
  revalidatePath('/concurrenten')
  redirect(`/producten?verwijderd=${ids.length}`)
}
