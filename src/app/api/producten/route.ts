export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { requirePermission } from '@/lib/authz'
import { assertCompanyCapacity } from '@/lib/company-license'
import { prisma } from '@/lib/prisma'
import { productSchema } from '@/lib/validators'

async function requireCompanyProductGroup(companyId: string, productGroupId: string) {
  return prisma.productGroup.findFirst({ where: { id: productGroupId, companyId, isActive: true }, select: { id: true } })
}

export async function GET(request: Request) {
  try {
    const actor = await requirePermission('products.read')
    const { searchParams } = new URL(request.url)
    const q = searchParams.get('q')?.trim() || undefined
    const products = await prisma.product.findMany({
      where: {
        companyId: actor.companyId,
        OR: q
          ? [
              { articleNumber: { contains: q } },
              { name: { contains: q } },
              { ean: { contains: q } },
            ]
          : undefined,
      },
      include: { productGroup: true },
      orderBy: { articleNumber: 'asc' },
    })
    return NextResponse.json(products)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('products.write')
    const body = await request.json()
    const parsed = productSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 })

    const productGroup = await requireCompanyProductGroup(actor.companyId, parsed.data.productGroupId)
    if (!productGroup) return NextResponse.json({ error: 'Productgroep bestaat niet binnen deze organisatie.' }, { status: 422 })

    await assertCompanyCapacity(actor.companyId, 'skus')
    const product = await prisma.product.create({
      data: {
        ...parsed.data,
        companyId: actor.companyId,
        ownPrice: parsed.data.ownPrice === null || parsed.data.ownPrice === undefined ? null : new Prisma.Decimal(parsed.data.ownPrice),
      },
    })
    return NextResponse.json(product, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Product opslaan mislukt.' }, { status: 403 })
  }
}
