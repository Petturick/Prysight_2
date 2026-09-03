export const dynamic = 'force-dynamic'

import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { FeedSourceType } from '@/generated/prisma/client'
import { requirePermission } from '@/lib/authz'
import { syncFeedSource } from '@/lib/feed-ingestion'
import { validateFeedUrl } from '@/lib/feed-parser'
import { prisma } from '@/lib/prisma'

function sourceKey(url: string) { return `url:${createHash('sha256').update(url).digest('hex')}` }

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('feeds.write')
    const body = await request.json().catch(() => null) as { url?: string; name?: string; countryCode?: string } | null
    if (!body?.url) return NextResponse.json({ error: 'Vul een productfeed URL in.' }, { status: 400 })
    let normalized: URL
    try { normalized = validateFeedUrl(body.url) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Ongeldige feed URL.' }, { status: 400 }) }
    const name = body.name?.trim() || normalized.pathname.split('/').filter(Boolean).pop()?.replace(/\.(xml|csv|json|xlsx|xls)$/i, '') || normalized.hostname
    const countryCode = (body.countryCode || 'GLOBAL').toUpperCase()
    const source = await prisma.feedSource.upsert({
      where: { companyId_sourceKey: { companyId: actor.companyId, sourceKey: sourceKey(normalized.toString()) } },
      update: { name, url: normalized.toString(), countryCode, isActive: true, syncError: null },
      create: { companyId: actor.companyId, sourceKey: sourceKey(normalized.toString()), name, sourceType: FeedSourceType.URL, url: normalized.toString(), countryCode, isActive: true },
    })
    try {
      const result = await syncFeedSource(source.id)
      return NextResponse.json({ feedSourceId: source.id, ...result })
    } catch (error) {
      return NextResponse.json({ feedSourceId: source.id, error: error instanceof Error ? error.message : 'Feed synchroniseren mislukt.' }, { status: 422 })
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 })
  }
}
