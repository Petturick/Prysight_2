import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const page = read('src/app/producten/nieuw/page.tsx')
const quickStart = read('src/components/ProductUrlQuickStart.tsx')
const ean = read('src/components/EanDiscoveryField.tsx')
const productGroupField = read('src/components/ProductGroupField.tsx')
const create = read('src/app/actions/smartProductActions.ts')

test('Product toevoegen heeft één compacte primaire route en verbergt alleen optionele velden', () => {
  assert.match(page, /<h1[^>]*>Product toevoegen<\/h1>/)
  assert.doesNotMatch(page, /Eén product invoeren|Huidige keuze|Veel producten|Automatisch bijhouden/)
  assert.match(quickStart, /Product URL/)
  assert.match(page, /<ProductUrlQuickStart formId="new-product-form"/)
  assert.match(page, /<form id="new-product-form" action=\{createSmartProductAction\}/)
  assert.match(page, /Overige productgegevens \(optioneel\)/)
  assert.match(page, /Verzendkosten en extra prijsgegevens \(optioneel\)/)
  assert.match(page, /<ProductCreateSubmitButton \/>/)
  assert.match(page, /<Link href="\/import\/bulk"/)
  assert.match(page, /<Link href="\/feeds"/)
  assert.doesNotMatch(page, /\\n\s*<label/)
})

test('Alle verplichte en bestaande optionele velden blijven beschikbaar voor dezelfde serveractie', () => {
  for (const field of ['articleNumber', 'name', 'ownPrice', 'countryId', 'vatIncluded', 'currency',
    'gtin', 'mpn', 'brand', 'model', 'ownPriceOther', 'ownShippingCost',
    'ownShippingVatIncluded', 'ownUrl', 'stockStatus', 'packagingUnit', 'packagingQty']) {
    assert.equal(page.split(`name="${field}"`).length - 1, 1, `veld ${field} moet precies één keer voorkomen`)
  }
  assert.match(page, /<EanDiscoveryField \/>/)
  assert.match(page, /<ProductGroupField formId="new-product-form"/)
  assert.match(productGroupField, /name="productGroup"/)
  assert.match(productGroupField, /suggestProductGroup/)
  assert.match(ean, /name="ean"/)
  assert.match(create, /validateVatPricePair/)
  assert.match(create, /discoverProductCandidates/)
  assert.match(create, /requirePermission\('products.write'\)/)
})

test('URL herkenning vult ook verborgen velden in, met foutmelding en handmatige route', () => {
  for (const field of ['articleNumber', 'name', 'ean', 'ownPrice', 'currency', 'vatIncluded',
    'brand', 'model', 'mpn', 'countryId', 'ownUrl']) {
    assert.match(quickStart, new RegExp(`apply\\('${field}'`))
  }
  assert.doesNotMatch(quickStart, /apply\('productGroup'/)
  assert.match(quickStart, /fetch\('\/api\/products\/preview-url'/)
  assert.match(quickStart, /Geen URL\? Vul je product hieronder handmatig in/)
  assert.match(quickStart, /payload\.existingProduct/)
  assert.match(quickStart, /target\?\.focus\(\)/)
  assert.match(quickStart, /setControl\(form, name, value/)
})
