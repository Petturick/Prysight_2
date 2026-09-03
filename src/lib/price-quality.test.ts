import assert from 'node:assert/strict'
import test from 'node:test'
import { assessPriceQuality, isPlausibleMarketPrice } from './price-quality'

test('rejects the 11 cent regression against a 38.20 own price', () => {
  assert.equal(isPlausibleMarketPrice(38.2, 0.11), false)
  const result = assessPriceQuality({
    extractedPrice: 0.11,
    normalizedPrice: 0.11,
    method: 'META',
    extractedTitle: 'Afvalcontainer 120 liter, grijs met deksel',
    productName: 'Afvalcontainer 120 liter, grijs met deksel',
    ownPrice: 38.2,
  })
  assert.equal(result.accepted, false)
  assert.equal(result.confidence, 'REJECTED')
})

test('accepts a plausible structured price with exact EAN', () => {
  const result = assessPriceQuality({
    extractedPrice: 34.95,
    normalizedPrice: 34.95,
    method: 'JSON_LD',
    extractedEan: '8719667010643',
    productEan: '8719667010643',
    extractedTitle: 'Afvalcontainer 120 liter, grijs met deksel',
    productName: 'Afvalcontainer 120 liter, grijs met deksel',
    ownPrice: 38.2,
  })
  assert.equal(result.accepted, true)
  assert.equal(result.confidence, 'HIGH')
})

test('rejects an explicit EAN mismatch', () => {
  const result = assessPriceQuality({
    extractedPrice: 34.95,
    normalizedPrice: 34.95,
    method: 'JSON_LD',
    extractedEan: '8719667019999',
    productEan: '8719667010643',
    ownPrice: 38.2,
  })
  assert.equal(result.accepted, false)
  assert.equal(result.confidence, 'REJECTED')
})

test('rejects an explicit SKU mismatch even when the title looks similar', () => {
  const result = assessPriceQuality({
    extractedPrice: 34.95,
    normalizedPrice: 34.95,
    method: 'META',
    extractedSku: 'OTHER-SKU',
    articleNumber: 'MGB 120.700',
    extractedTitle: 'Afvalcontainer 120 liter, grijs met deksel',
    productName: 'Afvalcontainer 120 liter, grijs met deksel',
    ownPrice: 38.2,
  })
  assert.equal(result.accepted, false)
  assert.equal(result.confidence, 'REJECTED')
})

test('does not promote loose HTML currency amounts to market prices', () => {
  const result = assessPriceQuality({
    extractedPrice: 35.5,
    normalizedPrice: 35.5,
    method: 'HTML_REGEX',
    extractedTitle: 'Afvalcontainer 120 liter, grijs met deksel',
    productName: 'Afvalcontainer 120 liter, grijs met deksel',
    ownPrice: 38.2,
  })
  assert.equal(result.accepted, false)
  assert.equal(result.confidence, 'LOW')
})

test('accepts plausible structured prices with a sufficiently matching title when identifiers are unavailable', () => {
  const result = assessPriceQuality({
    extractedPrice: 36.5,
    normalizedPrice: 36.5,
    method: 'META',
    extractedTitle: 'Afvalcontainer 120 liter grijs met deksel online kopen',
    productName: 'Afvalcontainer 120 liter, grijs met deksel',
    ownPrice: 38.2,
  })
  assert.equal(result.accepted, true)
  assert.equal(result.confidence, 'MEDIUM')
})
