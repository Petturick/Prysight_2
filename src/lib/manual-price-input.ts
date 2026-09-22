/**
 * A single monetary amount remains the source of truth. The second VAT amount is
 * optional corroboration, not a second independently mutable price.
 */
export function parseManualAmount(raw: string, field: string, allowZero = false): number {
  const value = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^(?:\d+)(?:\.\d{1,4})?$/.test(value)) throw new Error(`Vul een geldig bedrag in voor ${field}.`)
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount > 10_000_000 || (allowZero ? amount < 0 : amount <= 0)) {
    throw new Error(`Vul een geldig bedrag in voor ${field}.`)
  }
  return amount
}

export function validateVatPricePair(input: {
  primary: string
  opposite?: string
  vatIncluded: boolean
  vatRate: number | null
}): number {
  const primary = parseManualAmount(input.primary, 'de verkoopprijs')
  if (!input.opposite?.trim()) return primary
  if (input.vatRate === null || !Number.isFinite(input.vatRate) || input.vatRate < 0 || input.vatRate > 100) {
    throw new Error('Selecteer een markt met een geldig btw tarief om beide prijsvarianten te controleren.')
  }
  const opposite = parseManualAmount(input.opposite, 'de aanvullende prijs')
  const factor = 1 + input.vatRate / 100
  const expected = input.vatIncluded ? primary / factor : primary * factor
  if (Math.abs(expected - opposite) > 0.02) {
    throw new Error('De prijzen inclusief en exclusief btw komen niet overeen met het btw tarief van deze markt.')
  }
  return primary
}

export function parseOptionalShipping(raw: string): number | null {
  if (!raw.trim()) return null
  return parseManualAmount(raw, 'de verzendkosten', true)
}

export function calculateDeliveredAmounts(input: {
  price: number | null
  priceVatIncluded: boolean
  shipping: number | null
  shippingVatIncluded: boolean
  vatRate: number | null
}) {
  const { price, priceVatIncluded, shipping, shippingVatIncluded, vatRate } = input
  if (price === null || vatRate === null || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    return { priceEx: null, priceInc: null, shippingEx: null, shippingInc: null, totalEx: null, totalInc: null }
  }
  const factor = 1 + vatRate / 100
  const priceEx = priceVatIncluded ? price / factor : price
  const priceInc = priceVatIncluded ? price : price * factor
  const shippingEx = shipping === null ? null : shippingVatIncluded ? shipping / factor : shipping
  const shippingInc = shipping === null ? null : shippingVatIncluded ? shipping : shipping * factor
  return {
    priceEx, priceInc, shippingEx, shippingInc,
    totalEx: shippingEx === null ? null : priceEx + shippingEx,
    totalInc: shippingInc === null ? null : priceInc + shippingInc,
  }
}
