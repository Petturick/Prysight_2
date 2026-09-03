export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { syncFeedSource } from '@/lib/feed-ingestion'
import { prisma } from '@/lib/prisma'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('feeds.write')
    const { id } = await context.params
    const source = await prisma.feedSource.findFirst({ where: { id, companyId: actor.companyId, isActive: true }, select: { id: true } })
    if (!source) return NextResponse.json({ error: 'Feedbron niet gevonden.' }, { status: 404 })
    const result = await syncFeedSource(source.id)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Synchronisatie mislukt.' }, { status: 403 })
  }
}
