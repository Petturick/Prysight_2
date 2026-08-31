export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { prisma } from '@/lib/prisma'
import { productSchema } from '@/lib/validators'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await prisma.product.findUnique({
    where: { id, companyId: DEFAULT_COMPANY_ID },
    include: { productGroup: true, matches: { include: { competitorOffer: { include: { competitor: true } } } } },
  })
  if (!product) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  return NextResponse.json(product)
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const parsed = productSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 })
  }
  const product = await prisma.product.update({
    where: { id, companyId: DEFAULT_COMPANY_ID },
    data: {
      ...parsed.data,
      ownPrice: parsed.data.ownPrice === null || parsed.data.ownPrice === undefined ? null : new Prisma.Decimal(parsed.data.ownPrice),
    },
  })
  return NextResponse.json(product)
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.product.delete({ where: { id, companyId: DEFAULT_COMPANY_ID } })
  return NextResponse.json({ success: true })
}
