export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyBearerSecret } from '@/lib/api-auth'
import { prisma } from '@/lib/prisma'

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

export async function GET(request: Request) {
  const access = verifyBearerSecret(request, 'DATA_FEED_API_KEY')
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json'
  const products = await prisma.product.findMany({ where: { isActive: true }, include: { productGroup: true }, orderBy: { articleNumber: 'asc' } })
  const rows = products.map((product) => ({ articleNumber: product.articleNumber, ean: product.ean, gtin: product.gtin, name: product.name, productGroup: product.productGroup.name, ownPrice: product.ownPrice?.toString() ?? null, currency: product.currency, stockStatus: product.stockStatus, packagingUnit: product.packagingUnit, packagingQty: product.packagingQty, updatedAt: product.updatedAt.toISOString() }))
  if (format === 'json') return NextResponse.json({ generatedAt: new Date().toISOString(), count: rows.length, products: rows })
  const headers = Object.keys(rows[0] ?? { articleNumber: '', ean: '', gtin: '', name: '', productGroup: '', ownPrice: '', currency: '', stockStatus: '', packagingUnit: '', packagingQty: '', updatedAt: '' })
  const csv = [headers.map(csvEscape).join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(','))].join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pricingtool-products.csv"' } })
}
