export async function dispatchOwnProductSync(request: Request, feedSourceId: string) {
  const apiKey = process.env.FEED_SYNC_API_KEY?.trim()
  if (!apiKey) throw new Error('Achtergrondverwerking voor product URL synchronisatie is niet geconfigureerd.')
  const response = await fetch(new URL('/internal/own-product-sync-background', request.url), {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedSourceId }),
  })
  if (!response.ok) throw new Error('Product URL synchronisatie kon niet worden gestart.')
}
