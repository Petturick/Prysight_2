const DEFAULT_BATCH_SIZE = 40

function productionBaseUrl() {
  const configured = process.env.PRYSIGHT_APP_URL?.trim()
  const netlifyUrl = process.env.URL?.trim()
  const deployUrl = process.env.DEPLOY_PRIME_URL?.trim()
  return (configured || netlifyUrl || deployUrl || '').replace(/\/$/, '')
}

export default async () => {
  const baseUrl = productionBaseUrl()
  const apiKey = process.env.PRICE_MONITOR_API_KEY?.trim()

  if (!baseUrl) {
    console.error('Scheduled price check skipped: no production URL configured.')
    return new Response('Missing production URL', { status: 500 })
  }

  if (!apiKey) {
    console.error('Scheduled price check skipped: PRICE_MONITOR_API_KEY is missing.')
    return new Response('Missing PRICE_MONITOR_API_KEY', { status: 500 })
  }

  const response = await fetch(`${baseUrl}/api/prijscontroles`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'PrysightScheduledMonitor/1.0',
    },
    body: JSON.stringify({ limit: DEFAULT_BATCH_SIZE }),
  })

  const body = await response.text()
  if (!response.ok) {
    console.error(`Scheduled price check failed with HTTP ${response.status}: ${body}`)
    return new Response(body || 'Price check failed', { status: response.status })
  }

  console.log(`Scheduled price check completed: ${body}`)
  return new Response(body || 'OK', { status: 200 })
}

export const config = {
  schedule: '@hourly',
}
