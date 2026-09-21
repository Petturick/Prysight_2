import assert from 'node:assert/strict'
import test from 'node:test'
import { priceSuggestionAmounts } from './ean-price-suggestion-amounts'

test('converts incl. btw to an excl. btw suggestion for a 21 percent market', () => {
  assert.deepEqual(priceSuggestionAmounts(121, true, 21), { incl: 121, excl: 100 })
})

test('converts excl. btw to incl. btw for the selected market', () => {
  assert.deepEqual(priceSuggestionAmounts(100, false, 9), { incl: 109, excl: 100 })
})

test('never invents gross or net prices when the source VAT status is unknown', () => {
  assert.deepEqual(priceSuggestionAmounts(100, null, 21), { incl: null, excl: null })
})

test('rejects invalid monetary values and VAT rates', () => {
  assert.deepEqual(priceSuggestionAmounts(-1, true, 21), { incl: null, excl: null })
  assert.deepEqual(priceSuggestionAmounts(10, false, NaN), { incl: null, excl: null })
  assert.deepEqual(priceSuggestionAmounts(10, false, 125), { incl: null, excl: null })
})
