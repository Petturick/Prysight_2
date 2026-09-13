import assert from 'node:assert/strict'
import test from 'node:test'
import { extractOfferSnapshot } from '@/lib/price-monitoring'

test('JSON LD extractie leest prijs, valuta, EAN en verpakking', () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'Opslagbak premium pack 10',
    gtin13: '8712345678901',
    offers: {
      '@type': 'Offer',
      price: '149.50',
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
    },
  })}</script></head></html>`
  const result = extractOfferSnapshot(html)
  assert.equal(result.price, 149.5)
  assert.equal(result.currency, 'EUR')
  assert.equal(result.ean, '8712345678901')
  assert.equal(result.packagingQty, 10)
  assert.equal(result.method, 'JSON_LD')
})

test('meta extractie herkent verpakkingsaantal uit titel', () => {
  const html = `<html><head>
    <meta property="product:price:amount" content="89,95">
    <meta property="product:price:currency" content="EUR">
    <meta property="og:title" content="Transportbak doos van 6 stuks">
  </head></html>`
  const result = extractOfferSnapshot(html)
  assert.equal(result.price, 89.95)
  assert.equal(result.packagingQty, 6)
  assert.equal(result.method, 'META')
})
