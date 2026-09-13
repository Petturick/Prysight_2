import assert from 'node:assert/strict'
import test from 'node:test'
import { convertWithFxSnapshot, parseEcbDailyRates } from '@/lib/fx-rates'

test('parseEcbDailyRates leest datum en koersen', () => {
  const snapshot = parseEcbDailyRates(`<gesmes:Envelope><Cube><Cube time="2026-09-11"><Cube currency="USD" rate="1.17"/><Cube currency="GBP" rate="0.86"/><Cube currency="DKK" rate="7.46"/></Cube></Cube></gesmes:Envelope>`)
  assert.equal(snapshot.asOf, '2026-09-11')
  assert.equal(snapshot.source, 'ECB')
  assert.equal(snapshot.rates.EUR, 1)
  assert.equal(snapshot.rates.GBP, 0.86)
})

test('convertWithFxSnapshot rekent via EUR zonder vaste koers in pricing code', () => {
  const snapshot = { base: 'EUR' as const, asOf: '2026-09-11', source: 'ECB' as const, rates: { EUR: 1, GBP: 0.8, DKK: 8 } }
  assert.equal(convertWithFxSnapshot(80, 'GBP', 'EUR', snapshot), 100)
  assert.equal(convertWithFxSnapshot(100, 'EUR', 'DKK', snapshot), 800)
})
