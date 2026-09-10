export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { assertCompanyCapacity } from '@/lib/company-license'
import { requireLicensedCountry } from '@/lib/company-countries'
import { prisma } from '@/lib/prisma'
import { competitorSchema } from '@/lib/validators'

export async function GET() {
  try {
    const actor = await requirePermission('competitors.read')
    const competitors = await prisma.competitor.findMany({
      where: { companyId: actor.companyId },
      include: { country: true },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(competitors)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('competitors.write')
    const body = await request.json()
    const parsed = competitorSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 })

    await requireLicensedCountry(actor.companyId, parsed.data.countryId)
    await assertCompanyCapacity(actor.companyId, 'competitors')
    const competitor = await prisma.competitor.create({ data: { ...parsed.data, companyId: actor.companyId } })
    return NextResponse.json(competitor, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Concurrent opslaan mislukt.' }, { status: 403 })
  }
}
