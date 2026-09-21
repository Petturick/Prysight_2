export const dynamic = 'force-dynamic'

import { FeedSourceType, FeedSyncStatus } from '@/generated/prisma/client'
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { dispatchFeedSync } from '@/lib/feed-sync-dispatch'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission('feeds.write')
    const { id } = await context.params
    const source = await prisma.feedSource.findFirst({
      where: { id, companyId: actor.companyId },
      select: { id: true, sourceType: true, isActive: true, url: true, lastRunStatus: true },
    })
    if (!source) return NextResponse.json({ error: 'Feedbron niet gevonden.' }, { status: 404 })
    if (source.sourceType !== FeedSourceType.URL || !source.url) {
      return NextResponse.json({ error: 'Handmatig ophalen is alleen beschikbaar voor gekoppelde URL feeds.' }, { status: 409 })
    }
    if (!source.isActive) return NextResponse.json({ error: 'Activeer deze bron voordat je synchroniseert.' }, { status: 409 })
    if (source.lastRunStatus === FeedSyncStatus.RUNNING) {
      return NextResponse.json({ error: 'Deze feed wordt al verwerkt. Wacht totdat de synchronisatie klaar is.' }, { status: 409 })
    }

    // Claim de bron atomair om dubbele handmatige synchronisaties en gelijktijdige verwijdering te blokkeren.
    const claim = await prisma.feedSource.updateMany({
      where: { id, companyId: actor.companyId, isActive: true, lastRunStatus: { not: FeedSyncStatus.RUNNING } },
      data: { lastRunStatus: FeedSyncStatus.RUNNING, syncError: null },
    })
    if (claim.count !== 1) return NextResponse.json({ error: 'Deze feed wordt al verwerkt of is niet meer actief.' }, { status: 409 })

    try {
      await dispatchFeedSync(request, source.id)
      return NextResponse.json({ accepted: true, feedSourceId: source.id, status: 'RUNNING' }, { status: 202 })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Feedverwerking kon niet worden gestart.'
      await prisma.feedSource.updateMany({
        where: { id, companyId: actor.companyId, lastRunStatus: FeedSyncStatus.RUNNING },
        data: { lastRunStatus: FeedSyncStatus.FAILED, syncError: message },
      })
      return NextResponse.json({ error: message }, { status: 503 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Synchronisatie kon niet worden gestart.'
    return NextResponse.json({ error: message }, { status: message === 'Niet geauthenticeerd' ? 401 : 403 })
  }
}
