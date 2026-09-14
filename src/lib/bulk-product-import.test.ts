import assert from 'node:assert/strict'
import test from 'node:test'
import { recognizeBulkProductFeed } from '@/lib/bulk-product-import'

test('recognizes a Prisync horizontal product report without mapping competitor prices as product fields', () => {
  const result = recognizeBulkProductFeed({
    format: 'XLSX',
    headers: ['Product Name', 'Product Code', 'Barcode', 'Brand', 'Category', 'My Price', 'My Product Cost', 'Minimum Price', 'Maximum Price', 'Average Price', 'www.manutan.nl - Price', 'www.boxplus.be - Price'],
    rows: [{
      'Product Name': 'Testbak 600x400',
      'Product Code': 'EN-TEST-1',
      Barcode: '8712345678901',
      Brand: 'Engels',
      Category: 'Stapelbakken',
      'My Price': '24,95',
      'My Product Cost': '12,50',
      'Minimum Price': '22,00',
      'Maximum Price': '29,00',
      'Average Price': '25,50',
      'www.manutan.nl - Price': '23,95',
      'www.boxplus.be - Price': '24,10',
    }],
  })

  assert.equal(result.profile, 'prisync-horizontal')
  assert.equal(result.rows.length, 1)
  assert.equal(result.rows[0].articleNumber, 'EN-TEST-1')
  assert.equal(result.rows[0].ownPrice, '24.95')
  assert.equal(result.rows[0].costPrice, '12.5')
  assert.equal(result.rows[0].mpn, 'EN-TEST-1')
  assert.equal(result.detectedCompetitors.length, 2)
  assert.deepEqual(result.detectedCompetitors.map((item) => [item.domain, item.country]), [['manutan.nl', 'NL'], ['boxplus.be', 'BE']])
})

test('rejects a feed without a product code or product name', () => {
  assert.throws(() => recognizeBulkProductFeed({ format: 'CSV', headers: ['Price'], rows: [{ Price: '10' }] }), /Artikelnummer en productnaam/)
})
