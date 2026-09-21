export const dynamic = 'force-dynamic'

import { createHash } from 'node:crypto'
import { FeedSourceType, FeedSyncStatus } from '@/generated/prisma/client'
import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { validateFeedUrl } from '@/lib/feed-parser'
import { prisma } from '@/lib/prisma'

type Context = { params: Promise<{ id: string }> }
const EDITABLE_TYPES: FeedSourceType[] = [FeedSourceType.URL, FeedSourceType.FILE]
const countryCodes = new Set(['GLOBAL', 'NL', 'BE', 'DE', 'FR', 'PT', 'ES', 'GB', 'DK'])

function failure(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback
  return NextResponse.json({ error: message }, { status: message === 'Niet geauthenticeerd' ? 401 : 403 })
}

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requirePermission('feeds.read')
    const { id } = await context.params
    const source = await prisma.feedSource.findFirst({
      where: { id, companyId: actor.companyId },
      select: {
        id: true, lastRunStatus: true, lastRunAt: true, lastItemCount: true,
        lastErrorCount: true, syncError: true, isActive: true,
      },
    })
    if (!source) return NextResponse.json({ error: 'Feedbron niet gevonden.' }, { status: 404 })
    return NextResponse.json(source, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error, 'Geen toegang.')
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requirePermission('feeds.write')
    const { id } = await context.params
    const source = await prisma.feedSource.findFirst({
      where: { id, companyId: actor.companyId },
      select: { id: true, name: true, url: true, sourceType: true, lastRunStatus: true },
    })
    if (!source) return NextResponse.json({ error: 'Feedbron niet gevonden.' }, { status: 404 })
    if (!EDITABLE_TYPES.includes(source.sourceType)) return NextResponse.json({ error: 'Deze systeembron wordt via de eigen integratie beheerd en kan hier niet worden gewijzigd.' }, { status: 409 })
    if (source.lastRunStatus === FeedSyncStatus.RUNNING) return NextResponse.json({ error: 'Deze bron wordt nu gesynchroniseerd. Probeer het na afronding opnieuw.' }, { status: 409 })

    const body = await request.json().catch(() => null) as {
      name?: unknown; url?: unknown; countryCode?: unknown; isActive?: unknown; syncFrequencyHours?: unknown
    } | null
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120)) {
      return NextResponse.json({ error: 'Geef de bron een naam van maximaal 120 tekens.' }, { status: 400 })
    }
    if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
      return NextResponse.json({ error: 'Ongeldige bronstatus.' }, { status: 400 })
    }
    if (body.syncFrequencyHours !== undefined) {
      const hours = body.syncFrequencyHours
      if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > 8760) {
        return NextResponse.json({ error: 'Synchronisatiefrequentie moet tussen 1 en 8760 uur liggen.' }, { status: 400 })
      }
    }
    let countryCode: string | undefined
    if (body.countryCode !== undefined) {
      if (typeof body.countryCode !== 'string' || !countryCodes.has(body.countryCode.toUpperCase().trim())) {
        return NextResponse.json({ error: 'Selecteer een geldige markt.' }, { status: 400 })
      }
      countryCode = body.countryCode.toUpperCase().trim()
    }
    let url: string | undefined
    let sourceKey: string | undefined
    if (body.url !== undefined) {
      if (source.sourceType !== FeedSourceType.URL || typeof body.url !== 'string') {
        return NextResponse.json({ error: 'Alleen de URL van een URL feed kan hier worden gewijzigd.' }, { status: 400 })
      }
      try { url = validateFeedUrl(body.url).toString() }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Ongeldige feed URL.' }, { status: 400 }) }
      if (url !== source.url) {
        sourceKey = `url:${createHash('sha256').update(url).digest('hex')}`
        const existing = await prisma.feedSource.findUnique({
          where: { companyId_sourceKey: { companyId: actor.companyId, sourceKey } },
          select: { id: true },
        })
        if (existing && existing.id !== id) return NextResponse.json({ error: 'Deze feed URL is al gekoppeld aan een andere bron.' }, { status: 409 })
      }
    }
    const updated = await prisma.feedSource.update({
      where: { id, companyId: actor.companyId },
      data: {
        name: typeof body.name === 'string' ? body.name.trim() : undefined,
        url,
        sourceKey,
        countryCode,
        isActive: typeof body.isActive === 'boolean' ? body.isActive : undefined,
        syncFrequencyHours: typeof body.syncFrequencyHours === 'number' ? body.syncFrequencyHours : undefined,
        ...(sourceKey ? { lastRunStatus: FeedSyncStatus.IDLE, syncError: null } : {}),
      },
      select: {
        id: true, name: true, url: true, countryCode: true, isActive: true,
        syncFrequencyHours: true, lastRunStatus: true, lastRunAt: true,
        lastItemCount: true, lastErrorCount: true, syncError: true,
      },
    })
    return NextResponse.json(updated)
  } catch (error) {
    return failure(error, 'Bron wijzigen mislukt.')
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requirePermission('feeds.write')
    const { id } = await context.params
    const source = await prisma.feedSource.findFirst({
      where: { id, companyId: actor.companyId },
      select: { id: true, sourceType: true, lastRunStatus: true },
    })
    if (!source) return NextResponse.json({ error: 'Feedbron niet gevonden.' }, { status: 404 })
    if (!EDITABLE_TYPES.includes(source.sourceType)) {
      return NextResponse.json({ error: 'Een systeembron moet vanuit de bijbehorende integratie worden losgekoppeld.' }, { status: 409 })
    }
    if (source.lastRunStatus === FeedSyncStatus.RUNNING) {
      return NextResponse.json({ error: 'Wacht tot de synchronisatie is afgerond voordat je deze bron verwijdert.' }, { status: 409 })
    }
    const body = await request.json().catch(() => null) as { confirm?: boolean } | null
    if (body?.confirm !== true) return NextResponse.json({ error: 'Bevestig eerst dat je de feedbron wilt verwijderen.' }, { status: 400 })
    await prisma.feedSource.delete({ where: { id, companyId: actor.companyId } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return failure(error, 'Feed verwijderen mislukt.')
  }
}
