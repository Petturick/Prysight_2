export const dynamic = 'force-dynamic'

import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { FeedSourceType } from '@/generated/prisma/client'
import { requirePermission } from '@/lib/authz'
import { dispatchFeedSync } from '@/lib/feed-sync-dispatch'
import { normalizeGoogleDriveUrl, validateFeedUrl } from '@/lib/feed-parser'
import { prisma } from '@/lib/prisma'

function sourceKey(url: string) { return `url:${createHash('sha256').update(url).digest('hex')}` }

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('feeds.write')
    const body = await request.json().catch(() => null) as { url?: string; name?: string; countryCode?: string } | null
    if (!body?.url) return NextResponse.json({ error: 'Vul een productfeed URL in.' }, { status: 400 })
    let normalized: URL
    try { normalized = validateFeedUrl(body.url) } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Ongeldige feed URL.' }, { status: 400 }) }
    const googleDriveSource = ['drive.google.com', 'docs.google.com'].includes(normalized.hostname.toLowerCase())
    if (googleDriveSource) {
      try {
        const probe = await fetch(normalizeGoogleDriveUrl(normalized), {
          redirect: 'follow',
          signal: AbortSignal.timeout(15_000),
          headers: { 'User-Agent': 'Prysight Feed Access Check/1.0' },
        })
        const contentType = (probe.headers.get('content-type') ?? '').toLowerCase()
        await probe.body?.cancel().catch(() => undefined)
        if (!probe.ok) {
          return NextResponse.json({ error: `Google Drive bestand kon niet worden geopend, HTTP ${probe.status}. Controleer de deelrechten van het bestand.` }, { status: 422 })
        }
        if (contentType.includes('text/html')) {
          return NextResponse.json({ error: 'Google Drive gaf een webpagina terug in plaats van het spreadsheet. Deel het bestand als Iedereen met de link, met kijkrechten, zodat Prysight het zonder ingelogde Google sessie kan synchroniseren.' }, { status: 422 })
        }
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? `Google Drive bron kon niet worden gecontroleerd, ${error.message}` : 'Google Drive bron kon niet worden gecontroleerd.' }, { status: 422 })
      }
    }
    const name = body.name?.trim() || normalized.pathname.split('/').filter(Boolean).pop()?.replace(/\.(xml|csv|json|xlsx|xls)$/i, '') || normalized.hostname
    const countryCode = (body.countryCode || 'GLOBAL').toUpperCase()
    const source = await prisma.feedSource.upsert({
      where: { companyId_sourceKey: { companyId: actor.companyId, sourceKey: sourceKey(normalized.toString()) } },
      update: { name, url: normalized.toString(), countryCode, isActive: true, syncError: null },
      create: { companyId: actor.companyId, sourceKey: sourceKey(normalized.toString()), name, sourceType: FeedSourceType.URL, url: normalized.toString(), countryCode, isActive: true },
    })
    try {
      await dispatchFeedSync(request, source.id)
      return NextResponse.json({ feedSourceId: source.id, queued: true }, { status: 202 })
    } catch (error) {
      return NextResponse.json({ feedSourceId: source.id, error: error instanceof Error ? error.message : 'Feedverwerking kon niet worden gestart.' }, { status: 503 })
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 })
  }
}
