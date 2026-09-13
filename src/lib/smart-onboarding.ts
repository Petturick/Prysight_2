export function identifierStatus(input: { ean?: string | null; gtin?: string | null; mpn?: string | null }) {
  if (input.ean?.trim()) return { type: 'EAN' as const, value: input.ean.trim() }
  if (input.gtin?.trim()) return { type: 'GTIN' as const, value: input.gtin.trim() }
  if (input.mpn?.trim()) return { type: 'MPN' as const, value: input.mpn.trim() }
  return null
}
