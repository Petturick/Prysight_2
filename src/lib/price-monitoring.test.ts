import assert from 'node:assert/strict'
import test from 'node:test'
import { extractOfferSnapshot, publicPriceCheckErrorMessage } from '@/lib/price-monitoring'

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


test('Magento prijsdata wordt uit data price amount gelezen', () => {
  const html = `<html><head><title>Afvalcontainer MGB 240 liter</title></head><body>
    <span class="price-wrapper" data-price-amount="81.82" data-price-currency="EUR">
      <span class="price">€ 81,82</span>
    </span>
    <script>window.productConfig = {"sku":"MGB 240.700","finalPrice":{"amount":81.82}}</script>
  </body></html>`
  const result = extractOfferSnapshot(html)
  assert.equal(result.price, 81.82)
  assert.equal(result.currency, 'EUR')
  assert.equal(result.method, 'MAGENTO')
})

test('technische scrape fouten worden als korte bronstatus opgeslagen', () => {
  assert.equal(
    publicPriceCheckErrorMessage(new Error('No result returned by the scraping service. Empty response.')),
    'Bron leverde geen leesbare productpagina terug.',
  )
  assert.equal(
    publicPriceCheckErrorMessage(new Error('Bron gaf HTTP 403.')),
    'Bron blokkeert automatische prijscontrole.',
  )
})


test('palletbox afmetingen worden niet als verpakkingsaantal gezien', () => {
  const html = `<html><head><script type="application/ld+json">${JSON.stringify({
    '@type': 'Product',
    name: 'Euroformaat palletbox 1200 x 800 x 760 mm op 4 poten',
    offers: {
      '@type': 'Offer',
      price: '185.00',
      priceCurrency: 'EUR',
    },
  })}</script></head></html>`

  const result = extractOfferSnapshot(html)
  assert.equal(result.price, 185)
  assert.equal(result.method, 'JSON_LD')
  assert.equal(result.packagingQty, null)
})

test('afgekeurde prijsvalidatie geeft een bruikbare melding', () => {
  assert.equal(
    publicPriceCheckErrorMessage(
      new Error('Prijsvalidatie afgekeurd: Prijs ligt buiten de professionele plausibiliteitsbandbreedte ten opzichte van de eigen prijs.'),
    ),
    'Prijs gevonden, maar de genormaliseerde prijs wijkt onwaarschijnlijk af van de eigen prijs.',
  )
})
