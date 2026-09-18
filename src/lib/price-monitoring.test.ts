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


test('JSON LD extractie kiest het product dat bij de gekoppelde EAN hoort', () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: 'Ander product',
        gtin13: '8719667019999',
        offers: {
          '@type': 'Offer',
          price: '129.00',
          priceCurrency: 'EUR',
        },
      },
      {
        '@type': 'Product',
        name: 'Afvalcontainer 120 liter grijs met deksel',
        gtin13: '8719667010643',
        sku: 'MGB 120.700',
        offers: {
          '@type': 'Offer',
          price: '34.95',
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
        },
      },
    ],
  })}</script></head></html>`

  const result = extractOfferSnapshot(html, {
    ean: '8719667010643',
    sku: 'MGB 120.700',
    productName: 'Afvalcontainer 120 liter, grijs met deksel',
  })

  assert.equal(result.price, 34.95)
  assert.equal(result.ean, '8719667010643')
  assert.equal(result.sku, 'MGB 120.700')
  assert.equal(result.productTitle, 'Afvalcontainer 120 liter grijs met deksel')
  assert.equal(result.method, 'JSON_LD')
})

test('JSON LD extractie houdt aanbod en product uit hetzelfde Product object bij elkaar', () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        name: 'Product A',
        gtin13: '1111111111111',
        offers: { '@type': 'Offer', price: '10.00', priceCurrency: 'EUR' },
      },
      {
        '@type': 'Product',
        name: 'Product B',
        gtin13: '2222222222222',
        offers: { '@type': 'Offer', price: '20.00', priceCurrency: 'EUR' },
      },
    ],
  })}</script></head></html>`

  const result = extractOfferSnapshot(html, { ean: '2222222222222' })
  assert.equal(result.ean, '2222222222222')
  assert.equal(result.price, 20)
})
