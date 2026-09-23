import { FeedSourceType, FeedSyncStatus } from '@/generated/prisma/client'
import { NextResponse } from 'next/server'
import { verifyBearerSecret } from '@/lib/api-auth'
import { dispatchFeedSync } from '@/lib/feed-sync-dispatch'
import { dispatchOwnProductSync } from '@/lib/own-product-sync-dispatch'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// A bounded hourly dispatcher: only active URL feeds whose own frequency is due.
// Never dispatch manual-only feeds (8760 is the UI sentinel).
export async function POST(request: Request) {
  const access = verifyBearerSecret(request, 'FEED_SYNC_API_KEY')
  if (!access.ok) return NextResponse.json({ error: access.message }, { status: access.status })
  const now = Date.now()
  const candidates = await prisma.feedSource.findMany({
    where: {
      isActive: true, url: { not: null },
      OR: [{ sourceType: FeedSourceType.URL }, { sourceType: FeedSourceType.API, sourceKey: { startsWith: 'own-url:' } }],
      lastRunStatus: { not: FeedSyncStatus.RUNNING }, syncFrequencyHours: { lt: 8760 },
      company: { status: 'ACTIVE' },
    },
    select: { id: true, companyId: true, lastRunAt: true, syncFrequencyHours: true, sourceType: true, sourceKey: true },
    orderBy: [{ lastRunAt: 'asc' }, { createdAt: 'asc' }],
    take: 250,
  })
  let queued = 0
  let failed = 0
  for (const source of candidates) {
    if (queued >= 20) break
    if (source.lastRunAt && now - source.lastRunAt.getTime() < source.syncFrequencyHours * 3_600_000) continue
    const claimed = await prisma.feedSource.updateMany({
      where: { id: source.id, companyId: source.companyId, isActive: true,
        sourceType: source.sourceType, sourceKey: source.sourceKey,
        syncFrequencyHours: { lt: 8760 }, lastRunStatus: { not: FeedSyncStatus.RUNNING },
        ...(source.lastRunAt ? { lastRunAt: source.lastRunAt } : { lastRunAt: null }),
      },
      data: { lastRunStatus: FeedSyncStatus.RUNNING, syncError: null },
    })
    if (claimed.count !== 1) continue
    try {
      if (source.sourceType === FeedSourceType.URL) await dispatchFeedSync(request, source.id)
      else await dispatchOwnProductSync(request, source.id)
      queued += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : 'Geplande synchronisatie kon niet worden gestart.'
      await prisma.feedSource.updateMany({
        where: { id: source.id, companyId: source.companyId, lastRunStatus: FeedSyncStatus.RUNNING },
        data: { lastRunStatus: FeedSyncStatus.FAILED, syncError: message, lastRunAt: new Date() },
      })
      console.error('Scheduled feed dispatch failed', { feedSourceId: source.id, error: message })
    }
  }
  return NextResponse.json({ queued, failed, scanned: candidates.length })
}
