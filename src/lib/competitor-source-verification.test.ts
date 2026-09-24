import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateSourceVerification, type SourceVerificationInput } from './competitor-source-verification'

const now = Date.parse('2026-09-24T09:00:00Z')
const checkedAt = new Date(now - 60_000)
const valid: SourceVerificationInput = {
  linked: true,
  matchStatus: 'CERTAIN',
  price: 29.95,
  url: 'https://www.example.com/same-product',
  lastCheckedAt: checkedAt,
  check: { checkedAt, isSuccess: true, foundPrice: 29.95, checkMethod: 'JSON_LD', sourceUrl: 'https://www.example.com/same-product' },
}

test('only a recent successful source fetch for the confirmed product is verified', () => {
  assert.deepEqual(evaluateSourceVerification(valid, now), { verified: true, status: 'verified' })
})

test('latest failed price fetch invalidates earlier stored prices', () => {
  assert.deepEqual(evaluateSourceVerification({ ...valid, check: { ...valid.check!, isSuccess: false } }, now), { verified: false, status: 'failed' })
})

test('a price extracted from an unconfirmed match is not a verified competitor price', () => {
  assert.deepEqual(evaluateSourceVerification({ ...valid, matchStatus: 'REVIEW' }, now), { verified: false, status: 'match-review' })
})

test('stale measurements cannot pass as a live verification', () => {
  const expired = new Date(now - 25 * 60 * 60 * 1000)
  assert.deepEqual(evaluateSourceVerification({ ...valid, lastCheckedAt: expired, check: { ...valid.check!, checkedAt: expired } }, now), { verified: false, status: 'stale' })
})

test('different product page, manual price or rejected extraction cannot pass', () => {
  for (const override of [
    { check: { ...valid.check!, sourceUrl: 'https://www.example.com/other-product' } },
    { check: { ...valid.check!, checkMethod: 'MANUAL' } },
    { check: { ...valid.check!, checkMethod: 'HTTP|REJECTED' } },
    { check: { ...valid.check!, foundPrice: null } },
    { price: null },
  ]) {
    assert.deepEqual(evaluateSourceVerification({ ...valid, ...override }, now), { verified: false, status: 'unverified' })
  }
})

test('reports missing linked source and missing check without inventing evidence', () => {
  assert.deepEqual(evaluateSourceVerification({ ...valid, linked: false }, now), { verified: false, status: 'not-linked' })
  assert.deepEqual(evaluateSourceVerification({ ...valid, check: null }, now), { verified: false, status: 'not-checked' })
})
