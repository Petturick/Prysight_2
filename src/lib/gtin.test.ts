import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeGtin, validGtin } from './gtin'

test('accepts GS1 GTIN identifiers with valid check digits', () => {
  assert.equal(validGtin('96385074'), true)
  assert.equal(validGtin('036000291452'), true)
  assert.equal(validGtin('4006381333931'), true)
  assert.equal(validGtin('00012345600012'), true)
})

test('rejects nonnumeric, missing and mistyped GTIN identifiers', () => {
  assert.equal(validGtin('4006381333932'), false)
  assert.equal(validGtin('400638133393'), false)
  assert.equal(validGtin('1234567A90123'), false)
  assert.equal(validGtin(''), false)
  assert.equal(normalizeGtin('4006 3813-33931'), '4006381333931')
  assert.equal(validGtin('4006 3813-33931'), true)
})
