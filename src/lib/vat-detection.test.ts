import assert from 'node:assert/strict'
import test from 'node:test'
import { detectVatInclusion } from '@/lib/vat-detection'

test('detects an excluding VAT label next to the extracted price', () => {
  const result = detectVatInclusion('<div class="price">€ 100,00 excl. btw</div><div>€ 121,00 incl. btw</div>', 100)
  assert.equal(result.vatIncluded, false)
  assert.equal(result.confidence, 'HIGH')
})

test('detects an including VAT label next to the extracted price', () => {
  const result = detectVatInclusion('<div>Price £ 59.99 including VAT</div>', 59.99)
  assert.equal(result.vatIncluded, true)
  assert.equal(result.confidence, 'HIGH')
})

test('does not guess when the page contains conflicting VAT labels without price context', () => {
  const result = detectVatInclusion('<p>Business prices excl VAT, consumer prices incl VAT</p>', null)
  assert.equal(result.vatIncluded, null)
  assert.equal(result.confidence, 'UNKNOWN')
})
