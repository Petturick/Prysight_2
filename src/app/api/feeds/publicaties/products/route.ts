export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyBearerSecret } from '@/lib/api-auth'
import { requirePermission } from '@/lib/authz'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { prisma } from '@/lib/prisma'

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

async function resolveCompanyId(request: Request) {
  const authorization = request.headers.get('authorization')
  if (authorization) {
    const access = verifyBearerSecret(request, 'DATA_FEED_API_KEY')
    if (!access.ok) return { error: NextResponse.json({ error: access.message }, { status: access.status }) }
    const url = new URL(request.url)
    const companyId = request.headers.get('x-prysight-company-id')?.trim() || url.searchParams.get('companyId')?.trim() || DEFAULT_COMPANY_ID
    const company = await prisma.company.findFirst({ where: { id: companyId, status: 'ACTIVE' }, select: { id: true } })
    if (!company) return { error: NextResponse.json({ error: 'Organisatie niet gevonden of niet actief.' }, { status: 404 }) }
    return { companyId: company.id }
  }

  try {
    const actor = await requirePermission('feeds.read')
    return { companyId: actor.companyId }
  } catch (error) {
    return { error: NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 }) }
  }
}

export async function GET(request: Request) {
  const scope = await resolveCompanyId(request)
  if ('error' in scope) return scope.error

  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json'
  const products = await prisma.product.findMany({
    where: { companyId: scope.companyId, isActive: true },
    include: { productGroup: true },
    orderBy: { articleNumber: 'asc' },
  })
  const rows = products.map((product) => ({ articleNumber: product.articleNumber, ean: product.ean, gtin: product.gtin, name: product.name, productGroup: product.productGroup.name, ownPrice: product.ownPrice?.toString() ?? null, currency: product.currency, stockStatus: product.stockStatus, packagingUnit: product.packagingUnit, packagingQty: product.packagingQty, updatedAt: product.updatedAt.toISOString() }))
  if (format === 'json') return NextResponse.json({ generatedAt: new Date().toISOString(), companyId: scope.companyId, count: rows.length, products: rows })
  const headers = Object.keys(rows[0] ?? { articleNumber: '', ean: '', gtin: '', name: '', productGroup: '', ownPrice: '', currency: '', stockStatus: '', packagingUnit: '', packagingQty: '', updatedAt: '' })
  const csv = [headers.map(csvEscape).join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(','))].join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="prysight-products.csv"', 'X-Prysight-Company-Id': scope.companyId } })
}
