export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { alertPatchSchema } from '@/lib/validators'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const severity = searchParams.get('severity') ?? undefined
  const type = searchParams.get('type') ?? undefined
  const productId = searchParams.get('productId') ?? undefined

  const alerts = await prisma.alert.findMany({
    where: {
      severity: severity as never,
      type,
      productId,
    },
    include: { product: true, competitorOffer: { include: { competitor: true } } },
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
  })

  return NextResponse.json(alerts)
}

export async function PATCH(request: Request) {
  const body = await request.json()
  const parsed = alertPatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 })
  }

  const alert = await prisma.alert.update({ where: { id: parsed.data.id }, data: { isRead: parsed.data.isRead } })
  return NextResponse.json(alert)
}
