export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { name?: string; isActive?: boolean; syncFrequencyHours?: number } | null
  if (!body) return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
  const source = await prisma.feedSource.update({
    where: { id, companyId: DEFAULT_COMPANY_ID },
    data: {
      name: body.name?.trim() || undefined,
      isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
      syncFrequencyHours: Number.isFinite(body.syncFrequencyHours) && Number(body.syncFrequencyHours) > 0 ? Math.round(Number(body.syncFrequencyHours)) : undefined,
    },
  })
  return NextResponse.json(source)
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  await prisma.feedSource.delete({ where: { id, companyId: DEFAULT_COMPANY_ID } })
  return new NextResponse(null, { status: 204 })
}
