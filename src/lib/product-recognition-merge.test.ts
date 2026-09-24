import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeVerifiedProductSources } from './product-recognition-merge'
import type { OnlineProduct } from './online-ean-product'

const ean = '4006381333931'
function product(values: Partial<OnlineProduct> = {}): OnlineProduct {
  return {
    name: 'Bestaand product', articleNumber: null, ean, brand: null, model: null,
    mpn: null, productGroup: null, packagingQty: 1, stockStatus: null,
    ownPrice: null, currency: null, vatIncluded: null, ownUrl: null,
    image: null, description: null, sourceUrl: 'https://example.com/product',
    sourceType: 'ONLINE', ...values,
  }
}

test('trusted tenant feed takes priority and online descriptions only fill missing fields', () => {
  const merged = mergeVerifiedProductSources([
    { product: product({ name: 'Competitor title', brand: 'Online Brand', ownPrice: 1, articleNumber: 'BAD' }), origin: 'ONLINE' },
    { product: product({ name: 'Our product', articleNumber: 'SKU-1', ownPrice: 15, currency: 'EUR', vatIncluded: true,
      sourceType: 'OWN_SHOP', sourceUrl: 'https://ourshop.test/p' }), origin: 'OWN_FEED' },
  ], ean)
  assert.equal(merged.name, 'Our product')
  assert.equal(merged.brand, 'Online Brand')
  assert.equal(merged.articleNumber, 'SKU-1')
  assert.equal(merged.ownPrice, 15)
  assert.equal(merged.feedMatched, true)
  assert.equal(merged.fieldSources.name, 'OWN_FEED')
  assert.ok(merged.conflicts.includes('name'))
})

test('a competitor URL cannot define own selling price, article identity or own URL', () => {
  const merged = mergeVerifiedProductSources([
    { product: product({ articleNumber: 'COMPETITOR', ownPrice: 12, currency: 'EUR',
      ownUrl: 'https://example.com/p' }), origin: 'ONLINE' },
  ], ean)
  assert.equal(merged.articleNumber, null)
  assert.equal(merged.ownPrice, null)
  assert.equal(merged.ownUrl, null)
})

test('zero shipping and source tax basis from exact own feed remain distinct from missing shipping', () => {
  const merged = mergeVerifiedProductSources([
    { product: product({ ownShippingCost: 0, ownShippingVatIncluded: true, shippingCurrency: 'EUR' }),
      origin: 'OWN_FEED' },
  ], ean)
  assert.equal(merged.ownShippingCost, 0)
  assert.equal(merged.ownShippingVatIncluded, true)
  assert.equal(merged.shippingCurrency, 'EUR')
})
