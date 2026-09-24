import assert from 'node:assert/strict'
import test from 'node:test'
import { comparisonQuality } from './comparison-quality'

test('comparison quality is verified only with multiple current confirmed prices', () => {
  assert.equal(comparisonQuality({ verifiedOfferCount: 2, sourceCount: 2, reviewCount: 0, stale: false, lastCheckFailed: false }).code, 'VERIFIED')
  assert.equal(comparisonQuality({ verifiedOfferCount: 1, sourceCount: 2, reviewCount: 0, stale: false, lastCheckFailed: false }).code, 'LIMITED')
})

test('stale, failed or review states always require attention', () => {
  for (const state of [
    { verifiedOfferCount: 2, sourceCount: 2, reviewCount: 1, stale: false, lastCheckFailed: false },
    { verifiedOfferCount: 2, sourceCount: 2, reviewCount: 0, stale: true, lastCheckFailed: false },
    { verifiedOfferCount: 2, sourceCount: 2, reviewCount: 0, stale: false, lastCheckFailed: true },
  ]) assert.equal(comparisonQuality(state).code, 'ATTENTION')
})

test('no verified market price is never presented as reliable', () => {
  assert.equal(comparisonQuality({ verifiedOfferCount: 0, sourceCount: 3, reviewCount: 0, stale: false, lastCheckFailed: false }).code, 'NO_DATA')
})
