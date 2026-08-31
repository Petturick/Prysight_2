export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { assertCompanyCapacity } from '@/lib/company-license'
import { prisma } from '@/lib/prisma'
import { competitorSchema } from '@/lib/validators'

export async function GET() {
  const competitors = await prisma.competitor.findMany({ where: { companyId: DEFAULT_COMPANY_ID }, include: { country: true }, orderBy: { name: 'asc' } })
  return NextResponse.json(competitors)
}

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = competitorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 })
  }
  await assertCompanyCapacity(DEFAULT_COMPANY_ID, 'competitors')
  const competitor = await prisma.competitor.create({ data: { ...parsed.data, companyId: DEFAULT_COMPANY_ID } })
  return NextResponse.json(competitor, { status: 201 })
}
