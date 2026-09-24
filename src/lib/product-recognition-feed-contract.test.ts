import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const feed = read('src/lib/feed-ean-lookup.ts')
const eanRoute = read('src/app/api/products/recognize-ean/route.ts')
const eanField = read('src/components/EanDiscoveryField.tsx')
const urlRoute = read('src/app/api/products/preview-url/route.ts')
const urlField = read('src/components/ProductUrlQuickStart.tsx')

test('EAN first checks tenant-owned active product feeds and requires exact GTIN', () => {
  assert.match(feed, /companyId,\s*status: 'IMPORTED'/)
  assert.match(feed, /isActive: true, isMainFeed: true/)
  assert.match(feed, /sourceKey: \{ not: 'manual:prysight' \}/)
  assert.match(feed, /path: \['ean'\], equals: normalized/)
  assert.match(feed, /path: \['gtin'\], equals: normalized/)
  assert.match(feed, /normalizeGtin\(str\(value\)\) === normalized/)
  assert.match(feed, /vatIncluded: ownPrice === null \? null : vat\(data.vatIncluded\)/)
  assert.match(eanRoute, /lookupOwnFeedByEan\(actor.companyId, ean, countryCode\)/)
  assert.match(eanRoute, /origin: 'OWN_FEED' as const/)
})

test('EAN onboarding never treats ex VAT source prices as incl VAT and shows feed provenance', () => {
  assert.match(eanField, /payload.vatIncluded === false && factor \? safePrice \* factor/)
  assert.match(eanField, /apply\('ownPrice', money\(incl\)\)/)
  assert.match(eanField, /apply\('ownPriceOther', money\(excl\)\)/)
  assert.doesNotMatch(eanField, /apply\('vatIncluded', payload.vatIncluded\)/)
  assert.match(eanField, /payload.feedMatched/)
})

test('URL onboarding applies verified category and handles blocked or partial pages', () => {
  assert.match(urlRoute, /details.description/)
  assert.match(urlRoute, /shippingCost: owned \? offer.shippingCost : null/)
  assert.match(urlRoute, /response\?\.status === 403 \|\| response\?\.status === 429/)
  assert.match(urlField, /if \(payload.partial\)/)
  assert.match(urlField, /apply\('productGroup', option.value\)/)
  assert.match(urlField, /verifiedCurrency/)
  assert.match(urlField, /Gevonden verzendkosten/)
})
