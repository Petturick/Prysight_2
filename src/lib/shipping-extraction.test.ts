import test from 'node:test'
import assert from 'node:assert/strict'
import { extractShippingSnapshot } from './shipping-extraction'

test('reads JSON LD shipping rate for the matching EAN and destination', () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'Test product',
    gtin13: '8712345678901',
    offers: {
      '@type': 'Offer',
      price: '29.95',
      priceCurrency: 'EUR',
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'NL' },
        shippingRate: { '@type': 'MonetaryAmount', value: '6.95', currency: 'EUR' },
      },
    },
  })}</script>`
  const result = extractShippingSnapshot(html, { ean: '8712345678901', countryCode: 'NL' })
  assert.equal(result.cost, 6.95)
  assert.equal(result.currency, 'EUR')
  assert.equal(result.method, 'JSON_LD')
})

test('recognizes explicit free shipping but not a free-shipping threshold', () => {
  assert.equal(extractShippingSnapshot('<div>Gratis verzending</div>').cost, 0)
  assert.equal(extractShippingSnapshot('<div>Gratis verzending vanaf € 75</div>').cost, null)
})

test('reads explicit shipping costs from visible product text', () => {
  const result = extractShippingSnapshot('<div class="delivery">Verzendkosten: € 5,95</div>')
  assert.equal(result.cost, 5.95)
  assert.equal(result.currency, 'EUR')
  assert.equal(result.method, 'HTML')
})

test('does not treat shipping starting-price messaging as exact shipping cost', () => {
  const result = extractShippingSnapshot('<div>Verzendkosten vanaf € 4,95 afhankelijk van postcode</div>')
  assert.equal(result.cost, null)
})
