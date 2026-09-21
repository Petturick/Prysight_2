import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

function value(formData: FormData, key: string) {
  const raw = formData.get(key)
  return typeof raw === 'string' ? raw.trim() : ''
}

export type ProductSelectionFilters = {
  q?: string
  productGroupId?: string
  countryId?: string
  competitorId?: string
  identifierStatus?: string
}

export function readProductSelectionFilters(formData: FormData): ProductSelectionFilters {
  return {
    q: value(formData, 'selectionQ') || undefined,
    productGroupId: value(formData, 'selectionProductGroupId') || undefined,
    countryId: value(formData, 'selectionCountryId') || undefined,
    competitorId: value(formData, 'selectionCompetitorId') || undefined,
    identifierStatus: value(formData, 'selectionIdentifierStatus') || undefined,
  }
}

export function productSelectionWhere(companyId: string, filters: ProductSelectionFilters): Prisma.ProductWhereInput {
  return {
    companyId,
    isActive: true,
    productGroupId: filters.productGroupId,
    AND: [
      filters.q ? {
        OR: [
          { articleNumber: { contains: filters.q, mode: 'insensitive' } },
          { name: { contains: filters.q, mode: 'insensitive' } },
          { ean: { contains: filters.q } },
          { gtin: { contains: filters.q } },
        ],
      } : {},
      filters.countryId ? {
        OR: [
          { productMarkets: { some: { companyId, countryId: filters.countryId, isActive: true } } },
          { matches: { some: { companyId, competitorOffer: { competitor: { companyId, countryId: filters.countryId } } } } },
        ],
      } : {},
      filters.identifierStatus === 'ontbreekt'
        ? { AND: [{ ean: null }, { gtin: null }] }
        : filters.identifierStatus === 'aanwezig'
          ? { OR: [{ ean: { not: null } }, { gtin: { not: null } }] }
          : {},
      filters.competitorId
        ? { matches: { some: { companyId, competitorOffer: { competitorId: filters.competitorId, isActive: true } } } }
        : {},
    ],
  }
}

export async function resolveProductSelection({
  companyId,
  formData,
  limit,
}: {
  companyId: string
  formData: FormData
  limit?: number
}) {
  const selectionMode = value(formData, 'selectionMode')
  if (selectionMode !== 'all') {
    const ids = [...new Set(formData.getAll('productIds').map((entry) => String(entry)).filter(Boolean))]
    return {
      mode: 'explicit' as const,
      ids: typeof limit === 'number' ? ids.slice(0, limit) : ids,
      totalMatching: ids.length,
      filters: readProductSelectionFilters(formData),
    }
  }

  const filters = readProductSelectionFilters(formData)
  const excludedIds = [...new Set(formData.getAll('excludedProductIds').map((entry) => String(entry)).filter(Boolean))]
  const baseWhere = productSelectionWhere(companyId, filters)
  const where: Prisma.ProductWhereInput = excludedIds.length
    ? { AND: [baseWhere, { id: { notIn: excludedIds } }] }
    : baseWhere
  const [rows, totalMatching] = await Promise.all([
    prisma.product.findMany({
      where,
      select: { id: true },
      orderBy: { articleNumber: 'asc' },
      ...(typeof limit === 'number' ? { take: limit } : {}),
    }),
    prisma.product.count({ where }),
  ])

  return {
    mode: 'all' as const,
    ids: rows.map((row) => row.id),
    totalMatching,
    filters,
  }
}
