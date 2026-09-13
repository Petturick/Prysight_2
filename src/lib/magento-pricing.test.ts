import assert from 'node:assert/strict'
import test from 'node:test'
import { convertPriceTaxMode, pricesEqual } from '@/lib/magento-pricing'

test('Magento tax mode converteert bruto naar netto en terug', () => {
  assert.equal(convertPriceTaxMode(121, true, false, 21), 100)
  assert.equal(convertPriceTaxMode(100, false, true, 21), 121)
})

test('Magento tax mode laat gelijke prijssemantiek ongemoeid', () => {
  assert.equal(convertPriceTaxMode(42.955, true, true, 21), 42.96)
  assert.equal(convertPriceTaxMode(42.955, false, false, 21), 42.96)
})

test('Magento tax mode weigert conversie zonder btw percentage', () => {
  assert.throws(() => convertPriceTaxMode(100, true, false, null), /Btw-percentage ontbreekt/)
})

test('prijsverificatie accepteert alleen een kleine afrondingstolerantie', () => {
  assert.equal(pricesEqual(42.5, 42.504), true)
  assert.equal(pricesEqual(42.5, 42.52), false)
})
