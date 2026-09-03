import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const user = await requirePermission('products.write')
    const body = await request.json().catch(() => null) as { productIds?: unknown } | null
    const productIds = Array.isArray(body?.productIds)
      ? body.productIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : []

    const uniqueIds = [...new Set(productIds)].slice(0, 200)
    if (!uniqueIds.length) return NextResponse.json({ error: 'Selecteer minimaal één product.' }, { status: 400 })

    const existing = await prisma.product.findMany({
      where: { companyId: user.companyId, id: { in: uniqueIds }, isActive: true },
      select: { id: true },
    })
    const allowedIds = existing.map((product) => product.id)
    if (!allowedIds.length) return NextResponse.json({ error: 'Geen geldige producten gevonden om te verwijderen.' }, { status: 404 })

    const result = await prisma.product.updateMany({
      where: { companyId: user.companyId, id: { in: allowedIds } },
      data: { isActive: false },
    })

    return NextResponse.json({ success: true, removed: result.count })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bulkverwijdering is mislukt.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
