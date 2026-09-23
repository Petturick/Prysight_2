import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const eanInput = read('src/components/EanDiscoveryField.tsx')
const eanApi = read('src/app/api/products/recognize-ean/route.ts')
const productPage = read('src/app/producten/[id]/page.tsx')
const errorPage = read('src/app/error.tsx')

test('EAN lookup uses validated identifiers, tenant scope, and a matching source', () => {
  assert.match(eanApi, /validGtin\(ean\)/)
  assert.match(eanApi, /companyId: actor\.companyId/)
  assert.match(eanApi, /hasExactEan/)
  assert.match(eanApi, /lookupOnlineProduct\(candidate\.url, ean/)
  assert.match(eanApi, /ownPrice = own\?\.ownPrice \?\? null/)
  assert.match(eanApi, /actual product details require|exact EAN\/GTIN match on a source page/)
  assert.match(eanApi, /return NextResponse\.json\(\{ ean, existingProduct, found: false/)
})

test('EAN auto-recognition fills fields without overwriting manual input', () => {
  assert.match(eanInput, /fetch\('\/api\/products\/recognize-ean'/)
  assert.match(eanInput, /setTimeout\(\(\) => void recognize\(input\), 650\)/)
  assert.match(eanInput, /control\.value\.trim\(\) && control\.value !== autoValues\.current\[name\]/)
  for (const name of ['name', 'articleNumber', 'ownPrice', 'ownUrl', 'brand', 'model']) {
    assert.match(eanInput, new RegExp("apply\\('" + name + "'"))
  }
  assert.match(eanInput, /payload\.existingProduct/)
  assert.match(eanInput, /apply\('gtin', payload\.ean\)/)
  assert.match(eanInput, /onlinePreview\.sources/)
})

test('Product pages preserve optional feed failures and do not misdiagnose all crashes as database errors', () => {
  assert.match(productPage, /Optional product feed context unavailable/)
  assert.match(errorPage, /De pagina kon niet worden geladen/)
  assert.doesNotMatch(errorPage, /De pagina kon de database niet bereiken/)
})
