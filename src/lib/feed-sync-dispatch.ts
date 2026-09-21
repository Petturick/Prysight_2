const FEED_SYNC_BACKGROUND_PATH = '/internal/feed-sync-background'

export async function dispatchFeedSync(request: Request, feedSourceId: string) {
  const apiKey = process.env.FEED_SYNC_API_KEY?.trim()
  if (!apiKey) throw new Error('Achtergrondverwerking voor feeds is niet geconfigureerd.')

  const origin = new URL(request.url).origin
  const response = await fetch(`${origin}${FEED_SYNC_BACKGROUND_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'PrysightFeedSync/1.0',
    },
    body: JSON.stringify({ feedSourceId }),
  })

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim()
    throw new Error(detail || `Feedverwerking kon niet worden gestart, HTTP ${response.status}.`)
  }

  return { queued: true as const }
}
