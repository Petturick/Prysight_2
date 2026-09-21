export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { dispatchFeedSync } from '@/lib/feed-sync-dispatch'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('feeds.write')
    const { id } = await context.params
    const source = await prisma.feedSource.findFirst({ where: { id, companyId: actor.companyId, isActive: true }, select: { id: true } })
    if (!source) return NextResponse.json({ error: 'Feedbron niet gevonden.' }, { status: 404 })
    await dispatchFeedSync(request, source.id)
    return NextResponse.json({ accepted: true }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Synchronisatie kon niet worden gestart.' }, { status: 503 })
  }
}
