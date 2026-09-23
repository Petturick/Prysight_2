declare const Netlify: { env: { get(name: string): string | undefined } }

export default async (request: Request) => {
  const token = Netlify.env.get('FEED_SYNC_API_KEY')?.trim()
  if (!token) { console.error('Scheduled feed sync not configured.'); return }
  try {
    const response = await fetch(new URL('/api/internal/scheduled-feed-sync', request.url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (!response.ok) console.error('Scheduled feed sync dispatch failed', response.status)
  } catch (error) {
    console.error('Scheduled feed sync could not dispatch', error)
  }
}

export const config = { schedule: '@hourly' }
