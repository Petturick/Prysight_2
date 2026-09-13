import { prisma } from '@/lib/prisma'

export async function reactivateFeedProductGroups(feedSourceId: string) {
  const source = await prisma.feedSource.findUnique({
    where: { id: feedSourceId },
    select: { companyId: true },
  })
  if (!source) return 0

  const importedItems = await prisma.feedItem.findMany({
    where: {
      companyId: source.companyId,
      feedSourceId,
      status: 'IMPORTED',
      importedProductId: { not: null },
    },
    select: { importedProductId: true },
  })
  const productIds = [...new Set(
    importedItems
      .map((item) => item.importedProductId)
      .filter((id): id is string => Boolean(id)),
  )]
  if (!productIds.length) return 0

  const products = await prisma.product.findMany({
    where: { companyId: source.companyId, id: { in: productIds } },
    select: { productGroupId: true },
  })
  const productGroupIds = [...new Set(products.map((product) => product.productGroupId))]
  if (!productGroupIds.length) return 0

  const result = await prisma.productGroup.updateMany({
    where: { companyId: source.companyId, id: { in: productGroupIds }, isActive: false },
    data: { isActive: true },
  })
  return result.count
}
