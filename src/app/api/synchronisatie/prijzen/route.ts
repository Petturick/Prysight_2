import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { selectedMarketCode } from '@/lib/market-context'
import { runDuePriceChecks } from '@/lib/price-monitoring'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 403 })
    const actor = await requirePermission('pricing.manage')
    const [markets, code] = await Promise.all([
      getActiveCompanyCountries(actor.companyId), selectedMarketCode(actor.companyId),
    ])
    const selected = code === 'ALL' ? markets : markets.filter(market => market.code.toUpperCase() === code)
    if (!selected.length) return NextResponse.json({ error: 'Selecteer een actieve markt.' }, { status: 409 })
    // A short, bounded synchronous batch prevents request timeouts and respects the daily license cap.
    const result = await runDuePriceChecks({
      companyId: actor.companyId, countryIds: selected.map(market => market.id), limit: 8, force: true,
    })
    return NextResponse.json({ due: result.due, successful: result.successful, failed: result.failed,
      limitReached: result.due === 8 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Prijscontrole mislukt.' }, { status: 400 })
  }
}
