import { syncOwnProductUrlSource } from '../../src/lib/own-product-url-sync'

declare const Netlify: { env: { get(name: string): string | undefined } }

export default async (request: Request) => {
  const token = Netlify.env.get('FEED_SYNC_API_KEY')?.trim()
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    console.error('Product URL sync rejected, invalid authorization.')
    return
  }
  try {
    const body = await request.json() as { feedSourceId?: string }
    if (!body.feedSourceId || typeof body.feedSourceId !== 'string') return
    await syncOwnProductUrlSource(body.feedSourceId)
  } catch (error) {
    console.error('Product URL synchronisatie mislukt.', error)
  }
}

export const config = { path: '/internal/own-product-sync-background' }
