declare const Netlify: { env: { get(name: string): string | undefined } }

export default async (request: Request) => {
  const apiKey = Netlify.env.get('PRICE_MONITOR_API_KEY')?.trim()
  if (!apiKey) {
    console.error('Scheduled price check skipped: PRICE_MONITOR_API_KEY is missing.')
    return
  }

  const origin = new URL(request.url).origin
  try {
    const response = await fetch(`${origin}/internal/price-check-background`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'PrysightScheduledMonitor/2.0',
      },
      body: JSON.stringify({ source: 'hourly-schedule' }),
    })

    if (!response.ok) {
      console.error(`Scheduled price check could not start background worker, HTTP ${response.status}.`)
      return
    }
    console.log('Scheduled price check handed off to background worker.')
  } catch (error) {
    console.error('Scheduled price check could not start background worker.', error)
  }
}

export const config = {
  schedule: '@hourly',
}
