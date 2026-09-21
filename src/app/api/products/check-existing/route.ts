export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { findExistingProduct } from '@/lib/product-duplicate'

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('products.write')
    const body = await request.json().catch(() => null) as {
      articleNumber?: unknown
      ean?: unknown
      gtin?: unknown
      ownUrl?: unknown
      excludeProductId?: unknown
    } | null

    const existing = await findExistingProduct({
      companyId: actor.companyId,
      articleNumber: typeof body?.articleNumber === 'string' ? body.articleNumber : null,
      ean: typeof body?.ean === 'string' ? body.ean : null,
      gtin: typeof body?.gtin === 'string' ? body.gtin : null,
      ownUrl: typeof body?.ownUrl === 'string' ? body.ownUrl : null,
      excludeProductId: typeof body?.excludeProductId === 'string' ? body.excludeProductId : null,
    })

    return NextResponse.json({ existing })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Controle mislukt.' }, { status: 400 })
  }
}
