export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import {
  disconnectMagentoIntegration,
  getMagentoIntegrationSummary,
  saveMagentoIntegrationConfig,
  testMagentoIntegrationInput,
  type MagentoIntegrationInput,
} from '@/lib/magento-pricing'

function inputFromBody(body: Record<string, unknown>): MagentoIntegrationInput {
  return {
    baseUrl: String(body.baseUrl ?? '').trim(),
    accessToken: String(body.accessToken ?? '').trim() || undefined,
    currency: String(body.currency ?? 'EUR').trim().toUpperCase(),
    storeCode: String(body.storeCode ?? 'all').trim() || 'all',
    storeId: typeof body.storeId === 'number' || typeof body.storeId === 'string' ? body.storeId : 0,
    pricesIncludeTax: body.pricesIncludeTax === true,
  }
}

export async function GET() {
  try {
    const actor = await requirePermission('feeds.read')
    return NextResponse.json(await getMagentoIntegrationSummary(actor.companyId))
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Geen toegang.' }, { status: 403 })
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission('settings.manage')
    const body = await request.json().catch(() => null) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 })

    const action = String(body.action ?? 'test')
    const input = inputFromBody(body)
    if (!input.baseUrl) return NextResponse.json({ error: 'Vul de Magento basis URL in.' }, { status: 400 })

    if (action === 'test') {
      const result = await testMagentoIntegrationInput(actor.companyId, input)
      return NextResponse.json({ ...result, summary: await getMagentoIntegrationSummary(actor.companyId) })
    }

    if (action === 'connect') {
      const result = await saveMagentoIntegrationConfig(actor.companyId, input)
      return NextResponse.json({ ...result, summary: await getMagentoIntegrationSummary(actor.companyId) })
    }

    return NextResponse.json({ error: 'Onbekende integratieactie.' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Magento koppeling mislukt.' }, { status: 422 })
  }
}

export async function DELETE() {
  try {
    const actor = await requirePermission('settings.manage')
    await disconnectMagentoIntegration(actor.companyId)
    return NextResponse.json({ ok: true, summary: await getMagentoIntegrationSummary(actor.companyId) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Magento koppeling verbreken mislukt.' }, { status: 422 })
  }
}
