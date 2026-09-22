import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateDeliveredAmounts, parseOptionalShipping, validateVatPricePair } from './manual-price-input'

test('both VAT prices must reconcile within a small rounding tolerance', () => {
  assert.equal(validateVatPricePair({ primary: '121,00', opposite: '100,00', vatIncluded: true, vatRate: 21 }), 121)
  assert.equal(validateVatPricePair({ primary: '100.00', opposite: '121.00', vatIncluded: false, vatRate: 21 }), 100)
  assert.throws(() => validateVatPricePair({ primary: '100', opposite: '130', vatIncluded: false, vatRate: 21 }))
  assert.throws(() => validateVatPricePair({ primary: '100', opposite: '121', vatIncluded: false, vatRate: null }))
})

test('shipping distinguishes unknown from confirmed free delivery', () => {
  assert.equal(parseOptionalShipping(''), null)
  assert.equal(parseOptionalShipping('0'), 0)
  assert.equal(parseOptionalShipping('6,05'), 6.05)
  assert.throws(() => parseOptionalShipping('-3'))
})

test('delivered prices use the matching VAT basis and never assume free shipping', () => {
  const result = calculateDeliveredAmounts({ price: 100, priceVatIncluded: false, shipping: 6.05, shippingVatIncluded: true, vatRate: 21 })
  assert.ok(Math.abs(result.totalEx! - 105) < 0.00001)
  assert.ok(Math.abs(result.totalInc! - 127.05) < 0.00001)
  assert.equal(calculateDeliveredAmounts({ price: 100, priceVatIncluded: false, shipping: null, shippingVatIncluded: true, vatRate: 21 }).totalInc, null)
  assert.equal(calculateDeliveredAmounts({ price: 100, priceVatIncluded: false, shipping: 0, shippingVatIncluded: true, vatRate: 21 }).totalInc, 121)
})
