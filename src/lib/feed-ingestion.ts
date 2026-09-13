import { reactivateFeedProductGroups } from '@/lib/feed-group-reactivation'
import {
  ingestCanonicalProducts as ingestCanonicalProductsV2,
  syncFeedSource as syncFeedSourceV2,
} from '@/lib/feed-ingestion-v2'

export * from '@/lib/feed-ingestion-v2'

export async function ingestCanonicalProducts(...args: Parameters<typeof ingestCanonicalProductsV2>) {
  const result = await ingestCanonicalProductsV2(...args)
  const input = args[0]
  if (input.sourceKey === 'manual:prysight' && result.errors > 0) {
    throw new Error(result.errorMessages[0] || 'Product kon niet volledig worden verwerkt.')
  }
  return result
}

export async function syncFeedSource(feedSourceId: string) {
  const result = await syncFeedSourceV2(feedSourceId)
  await reactivateFeedProductGroups(feedSourceId)
  return result
}
