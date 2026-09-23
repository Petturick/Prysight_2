import { NextResponse } from 'next/server'
import { requireAuthenticatedUser } from '@/lib/authz'
import { getActiveCompanyCountries } from '@/lib/company-countries'
import { marketCookieName, selectedMarketCode } from '@/lib/market-context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const actor = await requireAuthenticatedUser()
    const markets = await getActiveCompanyCountries(actor.companyId)
    const selected = await selectedMarketCode(actor.companyId)
    return NextResponse.json({
      selected: selected === 'ALL' || markets.some(market => market.code.toUpperCase() === selected) ? selected : 'ALL',
      markets: markets.map(({ id, code, name }) => ({ id, code, name })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Je moet ingelogd zijn om van markt te wisselen.' }, { status: 401 })
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 403 })
    const actor = await requireAuthenticatedUser()
    const body = await request.json().catch(() => null) as { code?: unknown } | null
    const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : ''
    if (!/^[A-Z]{2,3}$/.test(code) && code !== 'ALL') return NextResponse.json({ error: 'Selecteer een geldige markt.' }, { status: 400 })
    if (code !== 'ALL') {
      const markets = await getActiveCompanyCountries(actor.companyId)
      if (!markets.some(market => market.code.toUpperCase() === code)) {
        return NextResponse.json({ error: 'Dit land is niet actief binnen je licentie.' }, { status: 403 })
      }
    }
    const response = NextResponse.json({ selected: code }, { headers: { 'Cache-Control': 'no-store' } })
    response.cookies.set(marketCookieName(actor.companyId), code, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 180,
    })
    return response
  } catch {
    return NextResponse.json({ error: 'De gekozen markt kon niet worden opgeslagen.' }, { status: 403 })
  }
}
