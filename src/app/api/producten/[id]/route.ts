export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { productSchema } from '@/lib/validators'

async function scopedProduct(companyId: string, id: string) {
  return prisma.product.findFirst({ where: { id, companyId }, select: { id: true } })
}

async function scopedProductGroup(companyId: string, id: string) {
  return prisma.productGroup.findFirst({ where: { id, companyId, isActive: true }, select: { id: true } })
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('products.read')
    const { id } = await params
    const product = await prisma.product.findFirst({
      where: { id, companyId: actor.companyId },
      include: { productGroup: true, matches: { include: { competitorOffer: { include: { competitor: true } } } } },
    })
    if (!product) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
    return NextResponse.json(product)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('products.write')
    const { id } = await params
    if (!(await scopedProduct(actor.companyId, id))) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })

    const body = await request.json()
    const parsed = productSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 })
    if (!(await scopedProductGroup(actor.companyId, parsed.data.productGroupId))) {
      return NextResponse.json({ error: 'Productgroep bestaat niet binnen deze organisatie.' }, { status: 422 })
    }

    const product = await prisma.product.update({
      where: { id, companyId: actor.companyId },
      data: {
        ...parsed.data,
        ownPrice: parsed.data.ownPrice === null || parsed.data.ownPrice === undefined ? null : new Prisma.Decimal(parsed.data.ownPrice),
      },
    })
    return NextResponse.json(product)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Product bijwerken mislukt.' }, { status: 403 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('products.write')
    const { id } = await params
    if (!(await scopedProduct(actor.companyId, id))) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
    await prisma.$transaction(async (tx) => {
      const matches = await tx.productMatch.findMany({
        where: { companyId: actor.companyId, productId: id },
        select: { competitorOfferId: true },
      })
      const offerIds = matches.map((match) => match.competitorOfferId)

      await tx.alert.deleteMany({ where: { companyId: actor.companyId, productId: id } })
      if (offerIds.length) {
        await tx.alert.deleteMany({
          where: { companyId: actor.companyId, competitorOfferId: { in: offerIds } },
        })
      }
      await tx.productMatch.deleteMany({ where: { companyId: actor.companyId, productId: id } })
      if (offerIds.length) {
        await tx.competitorOffer.deleteMany({
          where: { companyId: actor.companyId, id: { in: offerIds } },
        })
      }
      await tx.product.delete({ where: { id, companyId: actor.companyId } })
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Product verwijderen mislukt.' }, { status: 403 })
  }
}
