export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { DEFAULT_COMPANY_ID } from '@/lib/company'
import { FEED_TARGET_FIELDS, inferHeaderTarget } from '@/lib/import-mapping'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = await request.json().catch(() => null) as { mappings?: Array<{ id?: string; targetField?: string | null }> } | null
  if (!body?.mappings || !Array.isArray(body.mappings)) return NextResponse.json({ error: 'Ongeldige mapping.' }, { status: 400 })

  const allowedTargets = new Set<string>(FEED_TARGET_FIELDS.map((field) => field.key))
  const columnIds = body.mappings.map((mapping) => mapping.id).filter((value): value is string => Boolean(value))
  const columns = await prisma.feedColumnMapping.findMany({
    where: { companyId: DEFAULT_COMPANY_ID, feedSourceId: id, id: { in: columnIds } },
    select: { id: true },
  })
  if (columns.length !== new Set(columnIds).size) return NextResponse.json({ error: 'Een of meer feedkolommen zijn ongeldig.' }, { status: 400 })

  const usedTargets = new Set<string>()
  for (const mapping of body.mappings) {
    const target = mapping.targetField?.trim() || null
    if (target && !allowedTargets.has(target)) return NextResponse.json({ error: `Onbekend doelveld: ${target}` }, { status: 400 })
    if (target && usedTargets.has(target)) return NextResponse.json({ error: `Doelveld ${target} is meer dan één keer gekoppeld.` }, { status: 400 })
    if (target) usedTargets.add(target)
  }

  await prisma.$transaction(body.mappings.map((mapping) => prisma.feedColumnMapping.update({
    where: { id: mapping.id as string },
    data: { targetField: mapping.targetField?.trim() || null },
  })))

  return NextResponse.json({ ok: true })
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const source = await prisma.feedSource.findFirst({
    where: { id, companyId: DEFAULT_COMPANY_ID },
    include: { columns: { orderBy: { position: 'asc' } } },
  })
  if (!source) return NextResponse.json({ error: 'Feedbron niet gevonden.' }, { status: 404 })

  const allowed = FEED_TARGET_FIELDS.map((field) => field.key)
  const usedTargets = new Set<string>()
  const suggestions = source.columns.map((column) => {
    let target = inferHeaderTarget(column.sourceColumn, allowed) || null
    if (target && usedTargets.has(target)) target = null
    if (target) usedTargets.add(target)
    return { id: column.id, target }
  })

  await prisma.$transaction(suggestions.map((suggestion) => prisma.feedColumnMapping.update({
    where: { id: suggestion.id },
    data: { targetField: suggestion.target },
  })))

  return NextResponse.json({ ok: true, mapped: suggestions.filter((suggestion) => suggestion.target).length, total: suggestions.length })
}
