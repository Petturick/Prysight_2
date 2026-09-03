'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

const MAX_BULK_DELETE = 250

export async function deleteSelectedProductsAction(formData: FormData) {
  const actor = await requirePermission('products.write')
  const productIds = [...new Set(formData.getAll('productIds').map((value) => String(value)).filter(Boolean))].slice(0, MAX_BULK_DELETE)

  if (productIds.length === 0) redirect('/producten?selectie=leeg')

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, companyId: actor.companyId },
    select: { id: true, articleNumber: true, name: true },
  })

  if (products.length === 0) redirect('/producten?selectie=ongeldig')

  const ids = products.map((product) => product.id)

  await prisma.$transaction(async (tx) => {
    await tx.productMatch.deleteMany({ where: { companyId: actor.companyId, productId: { in: ids } } })
    await tx.product.deleteMany({ where: { companyId: actor.companyId, id: { in: ids } } })
  })

  await createAuditLog({
    userId: actor.id,
    action: 'PRODUCTS_BULK_DELETED',
    entityType: 'Product',
    entityId: `bulk:${ids.length}`,
    newValue: {
      count: ids.length,
      products: products.map((product) => ({ id: product.id, articleNumber: product.articleNumber, name: product.name })),
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/productmatches')
  revalidatePath('/concurrenten')
  redirect(`/producten?verwijderd=${ids.length}`)
}
