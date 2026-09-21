'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { runSelectedPriceChecks } from '@/lib/manual-price-checks'
import { prisma } from '@/lib/prisma'
import { resolveProductSelection } from '@/lib/product-selection'

function singleProductId(formData: FormData) {
  return String(formData.get('singleProductId') ?? formData.get('productId') ?? '').trim()
}

function returnToDetail(formData: FormData) {
  return String(formData.get('returnTo') ?? '') === 'detail'
}

async function logManualRefresh({
  actor,
  products,
  result,
  mode,
}: {
  actor: { companyId: string; id: string }
  products: Array<{ id: string; articleNumber: string; name: string }>
  result: Awaited<ReturnType<typeof runSelectedPriceChecks>>
  mode: 'single' | 'bulk'
}) {
  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'PRODUCT_PRICES_MANUALLY_REFRESHED',
    entityType: 'Product',
    entityId: mode === 'single' ? products[0]?.id ?? 'single:unknown' : `bulk:${products.length}`,
    newValue: {
      mode,
      products: products.map((product) => ({ id: product.id, articleNumber: product.articleNumber, name: product.name })),
      offers: result.offers,
      successful: result.successful,
      failed: result.failed,
      truncated: result.truncated,
    },
  })
}

function revalidateProducts(products: Array<{ id: string }>) {
  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath('/monitoring')
  revalidatePath('/prijswijzigingen')
  for (const product of products) revalidatePath(`/producten/${product.id}`)
}

export async function refreshSingleProductPriceAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const productId = singleProductId(formData)
  const detail = returnToDetail(formData)

  if (!productId) redirect('/producten?crawlstatus=product-ontbreekt')

  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: actor.companyId, isActive: true },
    select: { id: true, articleNumber: true, name: true },
  })

  if (!product) redirect('/producten?crawlstatus=product-ontbreekt')

  let result: Awaited<ReturnType<typeof runSelectedPriceChecks>>
  try {
    result = await runSelectedPriceChecks({ companyId: actor.companyId, productIds: [product.id], limit: 40 })
  } catch (error) {
    console.error('Manual single product price refresh failed', { companyId: actor.companyId, productId: product.id, error })
    if (detail) redirect(`/producten/${product.id}?crawlstatus=mislukt`)
    redirect(`/producten?crawlstatus=mislukt&crawlproduct=${encodeURIComponent(product.articleNumber)}`)
  }

  await logManualRefresh({ actor, products: [product], result, mode: 'single' })
  revalidateProducts([product])

  if (result.offers === 0) {
    if (detail) redirect(`/producten/${product.id}?crawlstatus=geen-bron#concurrent-bron-toevoegen`)
    redirect(`/producten?crawlstatus=geen-bron&crawlproduct=${encodeURIComponent(product.articleNumber)}&openproduct=${encodeURIComponent(product.id)}`)
  }

  if (detail) redirect(`/producten/${product.id}?controle=${result.successful}-${result.failed}&bronnen=${result.offers}`)
  redirect(`/producten?crawlstatus=klaar&crawl=${result.successful}-${result.failed}&bronnen=${result.offers}&producten=1&crawlproduct=${encodeURIComponent(product.articleNumber)}`)
}

export async function refreshSelectedProductPricesAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const selection = await resolveProductSelection({ companyId: actor.companyId, formData })

  if (selection.ids.length === 0) redirect('/producten?selectie=leeg')

  const products = await prisma.product.findMany({
    where: { id: { in: selection.ids }, companyId: actor.companyId, isActive: true },
    select: { id: true, articleNumber: true, name: true },
    orderBy: { articleNumber: 'asc' },
  })

  if (products.length === 0) redirect('/producten?selectie=ongeldig')

  // Make every selected source immediately due. The hourly monitor will keep processing
  // sources that do not fit in this synchronous request, so a large all-pages selection
  // does not silently stop after the first batch.
  await prisma.competitorOffer.updateMany({
    where: {
      companyId: actor.companyId,
      isActive: true,
      competitor: { isActive: true },
      productMatch: { productId: { in: products.map((product) => product.id) } },
    },
    data: { lastCheckedAt: null },
  })

  let result: Awaited<ReturnType<typeof runSelectedPriceChecks>>
  try {
    result = await runSelectedPriceChecks({
      companyId: actor.companyId,
      productIds: products.map((product) => product.id),
      limit: 120,
    })
  } catch (error) {
    console.error('Manual bulk product price refresh failed', { companyId: actor.companyId, productIds: products.map((product) => product.id), error })
    redirect(`/producten?crawlstatus=mislukt&producten=${products.length}`)
  }

  await logManualRefresh({ actor, products: products.slice(0, 250), result, mode: 'bulk' })
  revalidateProducts(products.slice(0, 250))

  if (result.offers === 0) {
    redirect(`/producten?crawlstatus=geen-bronnen-selectie&producten=${selection.totalMatching}`)
  }

  const continuesAutomatically = result.truncated || selection.totalMatching > result.checkedProducts
  redirect(`/producten?crawlstatus=klaar&crawl=${result.successful}-${result.failed}&bronnen=${result.offers}&producten=${selection.totalMatching}${result.truncated ? '&limiet=1' : ''}${continuesAutomatically ? '&automatisch=1' : ''}`)
}
