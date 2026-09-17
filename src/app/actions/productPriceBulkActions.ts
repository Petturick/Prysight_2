'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { runSelectedPriceChecks } from '@/lib/manual-price-checks'
import { prisma } from '@/lib/prisma'

const MAX_SELECTED_PRODUCTS = 50

export async function refreshSelectedProductPricesAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const productIds = [...new Set(formData.getAll('productIds').map((value) => String(value)).filter(Boolean))].slice(0, MAX_SELECTED_PRODUCTS)

  if (productIds.length === 0) redirect('/producten?selectie=leeg')

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, companyId: actor.companyId, isActive: true },
    select: { id: true, articleNumber: true, name: true },
  })

  if (products.length === 0) redirect('/producten?selectie=ongeldig')

  const result = await runSelectedPriceChecks({
    companyId: actor.companyId,
    productIds: products.map((product) => product.id),
    limit: 120,
  })

  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'PRODUCT_PRICES_MANUALLY_REFRESHED',
    entityType: 'Product',
    entityId: `bulk:${products.length}`,
    newValue: {
      products: products.map((product) => ({ id: product.id, articleNumber: product.articleNumber, name: product.name })),
      offers: result.offers,
      successful: result.successful,
      failed: result.failed,
      truncated: result.truncated,
    },
  })

  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/monitoring')
  revalidatePath('/prijswijzigingen')
  for (const product of products) revalidatePath(`/producten/${product.id}`)

  redirect(`/producten?crawl=${result.successful}-${result.failed}&bronnen=${result.offers}&producten=${products.length}${result.truncated ? '&limiet=1' : ''}`)
}
