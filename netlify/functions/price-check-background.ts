declare const Netlify: { env: { get(name: string): string | undefined } }

const DEFAULT_BATCH_SIZE = 40
const DISCOVERY_BATCH_SIZE = 20

export default async (request: Request) => {
  const authorization = request.headers.get('authorization')?.trim()
  const expected = Netlify.env.get('PRICE_MONITOR_API_KEY')?.trim()
  if (!expected || authorization !== `Bearer ${expected}`) {
    console.error('Background price check rejected: invalid or missing authorization.')
    return
  }

  const origin = new URL(request.url).origin
  const payload = request.method === 'POST'
    ? await request.json().catch(() => null) as { companyId?: unknown; productId?: unknown } | null
    : null
  const targeted = payload && typeof payload.companyId === 'string' && typeof payload.productId === 'string'
    && payload.companyId.length < 150 && payload.productId.length < 150
  try {
    const response = await fetch(`${origin}/api/prijscontroles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${expected}`, 'Content-Type': 'application/json', 'User-Agent': 'PrysightBackgroundMonitor/3.0' },
      body: JSON.stringify(targeted
        ? { companyId: payload.companyId, productId: payload.productId, limit: 2, smartDiscovery: false, smartPricing: false }
        : { limit: DEFAULT_BATCH_SIZE, smartDiscovery: true, discoveryLimit: DISCOVERY_BATCH_SIZE, smartPricing: true }),
    })
    const body = await response.text()
    if (!response.ok) {
      console.error(`Background monitoring failed with HTTP ${response.status}: ${body}`)
      return
    }
    console.log(`Background monitoring, discovery and pricing completed: ${body}`)
  } catch (error) {
    console.error('Background monitoring request failed.', error)
  }
}

export const config = { path: '/internal/price-check-background' }
