export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { requireAuthenticatedUser, requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { alertPatchSchema } from '@/lib/validators'

export async function GET(request: Request) {
  const actor = await requireAuthenticatedUser()
  if (actor.role !== 'SUPER_ADMIN' && !actor.permissions.includes('alerts.manage') && !actor.permissions.includes('products.read')) return NextResponse.json({ error: 'Onvoldoende rechten.' }, { status: 403 })
  const { searchParams } = new URL(request.url)
  const severity = searchParams.get('severity') ?? undefined
  const type = searchParams.get('type') ?? undefined
  const productId = searchParams.get('productId') ?? undefined
  const alerts = await prisma.alert.findMany({
    where: { companyId: actor.companyId, severity: severity as never, type, productId },
    include: { product: true, competitorOffer: { include: { competitor: true } } },
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }], take: 250,
  })
  return NextResponse.json(alerts)
}

export async function PATCH(request: Request) {
  const actor = await requirePermission('alerts.manage')
  const body = await request.json()
  const parsed = alertPatchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 })
  const existing = await prisma.alert.findFirst({ where: { id: parsed.data.id, companyId: actor.companyId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Waarschuwing niet gevonden.' }, { status: 404 })
  const alert = await prisma.alert.update({ where: { id: existing.id }, data: { isRead: parsed.data.isRead } })
  return NextResponse.json(alert)
}
