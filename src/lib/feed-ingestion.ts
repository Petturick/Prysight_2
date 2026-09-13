import { ingestCanonicalProducts as ingestCanonicalProductsV2 } from '@/lib/feed-ingestion-v2'

export * from '@/lib/feed-ingestion-v2'

export async function ingestCanonicalProducts(...args: Parameters<typeof ingestCanonicalProductsV2>) {
  const result = await ingestCanonicalProductsV2(...args)
  const input = args[0]
  if (input.sourceKey === 'manual:prysight' && result.errors > 0) {
    throw new Error(result.errorMessages[0] || 'Product kon niet volledig worden verwerkt.')
  }
  return result
}
