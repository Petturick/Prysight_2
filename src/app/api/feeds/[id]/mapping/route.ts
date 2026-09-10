export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { FEED_TARGET_FIELDS, inferHeaderTarget } from '@/lib/import-mapping'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('feeds.write')
    const { id } = await context.params
    const source = await prisma.feedSource.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true } })
    if (!source) return NextResponse.json({ error: 'Feedbron niet gevonden.' }, { status: 404 })

    const body = await request.json().catch(() => null) as { mappings?: Array<{ id?: string; targetField?: string | null }> } | null
    if (!body?.mappings || !Array.isArray(body.mappings)) return NextResponse.json({ error: 'Ongeldige mapping.' }, { status: 400 })

    const allowedTargets = new Set<string>(FEED_TARGET_FIELDS.map((field) => field.key))
    const columnIds = body.mappings.map((mapping) => mapping.id).filter((value): value is string => Boolean(value))
    const columns = await prisma.feedColumnMapping.findMany({
      where: { companyId: actor.companyId, feedSourceId: source.id, id: { in: columnIds } },
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
      where: { id: mapping.id as string, companyId: actor.companyId },
      data: { targetField: mapping.targetField?.trim() || null },
    })))
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 })
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('feeds.write')
    const { id } = await context.params
    const source = await prisma.feedSource.findFirst({
      where: { id, companyId: actor.companyId },
      include: { columns: { where: { companyId: actor.companyId }, orderBy: { position: 'asc' } } },
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
      where: { id: suggestion.id, companyId: actor.companyId },
      data: { targetField: suggestion.target },
    })))
    return NextResponse.json({ ok: true, mapped: suggestions.filter((suggestion) => suggestion.target).length, total: suggestions.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 })
  }
}
