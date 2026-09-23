import assert from 'node:assert/strict'
import test from 'node:test'
import { extractOnlineProduct } from './online-ean-product'

const ean = '8719667001733'
const url = 'https://shop.example.com/product/box'

function product(body: Record<string, unknown>) {
  return '<html><script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', ...body }) + '</script></html>'
}

test('verified structured online EAN fills metadata, but not a competitor price or stock status', () => {
  const html = product({
    name: 'Distributiebak 90 liter met deksel',
    gtin13: ean, brand: { name: 'Engels' }, sku: '5106-00-825',
    mpn: 'M-123', model: 'Box 90', category: 'Kunststof bakken', description: 'Grijs, 800x400x400 mm',
    offers: { '@type': 'Offer', price: '125.00', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
  })
  const item = extractOnlineProduct(html, ean, url, false)
  assert.equal(item?.name, 'Distributiebak 90 liter met deksel')
  assert.equal(item?.brand, 'Engels')
  assert.equal(item?.model, 'Box 90')
  assert.equal(item?.mpn, 'M-123')
  assert.equal(item?.productGroup, 'Kunststof bakken')
  assert.equal(item?.description, 'Grijs, 800x400x400 mm')
  assert.equal(item?.articleNumber, null)
  assert.equal(item?.ownPrice, null)
  assert.equal(item?.ownUrl, null)
  assert.equal(item?.stockStatus, null)
})

test('verified own webshop product fills its product identity and price', () => {
  const html = product({ name: 'Distributiebak met scharnierdeksel', gtin13: ean, sku: '5106-00-825',
    offers: { '@type': 'Offer', price: 100.25, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } })
  const item = extractOnlineProduct(html, ean, url, true)
  assert.equal(item?.articleNumber, '5106-00-825')
  assert.equal(item?.ownPrice, 100.25)
  assert.equal(item?.currency, 'EUR')
  assert.equal(item?.stockStatus, 'Op voorraad')
  assert.equal(item?.ownUrl, url)
})

test('EAN mismatches and search snippets alone cannot fill product details', () => {
  const different = product({ name: 'Ander product', gtin13: '8719667001734', sku: 'WRONG' })
  assert.equal(extractOnlineProduct(different, ean, url, true), null)
  assert.equal(extractOnlineProduct('Distributiebak 90 liter 8719667001733', ean, url, false), null)
})
