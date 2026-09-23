import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/authz'
import { requireLicensedCountry } from '@/lib/company-countries'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 403 })
    const actor = await requirePermission('competitors.write')
    const { id } = await context.params
    const body = await request.json().catch(() => null) as { frequency?: unknown } | null
    const frequency = Number(body?.frequency)
    if (![6, 12, 24, 48, 168, 876000].includes(frequency)) {
      return NextResponse.json({ error: 'Ongeldige controlefrequentie.' }, { status: 400 })
    }
    const competitor = await prisma.competitor.findFirst({
      where: { id, companyId: actor.companyId }, select: { id: true, countryId: true },
    })
    if (!competitor) return NextResponse.json({ error: 'Concurrent niet gevonden.' }, { status: 404 })
    await requireLicensedCountry(actor.companyId, competitor.countryId)
    await prisma.competitor.update({
      where: { id: competitor.id, companyId: actor.companyId },
      data: { checkFrequencyHours: frequency },
    })
    revalidatePath('/concurrenten')
    revalidatePath('/beheer/synchronisatie')
    return NextResponse.json({ id: competitor.id, frequency })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Opslaan mislukt.' }, { status: 403 })
  }
}
