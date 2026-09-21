import { syncFeedSource } from '../../src/lib/feed-ingestion'

declare const Netlify: { env: { get(name: string): string | undefined } }

export default async (request: Request) => {
  const authorization = request.headers.get('authorization')?.trim()
  const expected = Netlify.env.get('FEED_SYNC_API_KEY')?.trim()
  if (!expected || authorization !== `Bearer ${expected}`) {
    console.error('Background feed sync rejected, invalid or missing authorization.')
    return
  }

  let feedSourceId = ''
  try {
    const body = await request.json() as { feedSourceId?: string }
    feedSourceId = body.feedSourceId?.trim() ?? ''
  } catch {
    console.error('Background feed sync rejected, invalid JSON body.')
    return
  }

  if (!feedSourceId) {
    console.error('Background feed sync rejected, feedSourceId is missing.')
    return
  }

  try {
    const result = await syncFeedSource(feedSourceId)
    console.log(`Background feed sync completed for ${feedSourceId}, ${result.rows} rows, ${result.errors} errors.`)
  } catch (error) {
    console.error(`Background feed sync failed for ${feedSourceId}.`, error)
  }
}

export const config = { path: '/internal/feed-sync-background' }
