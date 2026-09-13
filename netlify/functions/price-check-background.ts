declare const Netlify: { env: { get(name: string): string | undefined } }

const DEFAULT_BATCH_SIZE = 40
const DISCOVERY_BATCH_SIZE = 4

export default async (request: Request) => {
  const authorization = request.headers.get('authorization')?.trim()
  const expected = Netlify.env.get('PRICE_MONITOR_API_KEY')?.trim()

  if (!expected || authorization !== `Bearer ${expected}`) {
    console.error('Background price check rejected: invalid or missing authorization.')
    return
  }

  const origin = new URL(request.url).origin
  try {
    const response = await fetch(`${origin}/api/prijscontroles`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${expected}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PrysightBackgroundMonitor/3.0',
      },
      body: JSON.stringify({ limit: DEFAULT_BATCH_SIZE, smartDiscovery: true, discoveryLimit: DISCOVERY_BATCH_SIZE }),
    })

    const body = await response.text()
    if (!response.ok) {
      console.error(`Background monitoring failed with HTTP ${response.status}: ${body}`)
      return
    }
    console.log(`Background monitoring and discovery completed: ${body}`)
  } catch (error) {
    console.error('Background monitoring request failed.', error)
  }
}

export const config = { path: '/internal/price-check-background' }
