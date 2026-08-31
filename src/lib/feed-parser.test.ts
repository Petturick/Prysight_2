import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFeedBuffer, validateFeedUrl } from './feed-parser'

function buffer(value: string) {
  return new TextEncoder().encode(value).buffer
}

test('parses CSV product feeds', async () => {
  const result = await parseFeedBuffer('products.csv', 'text/csv', buffer('sku,title,price\nA1,Bak 1,12.50\nA2,Bak 2,13.50'))
  assert.equal(result.format, 'CSV')
  assert.equal(result.rows.length, 2)
  assert.deepEqual(result.headers, ['sku', 'title', 'price'])
})

test('parses JSON product feeds', async () => {
  const result = await parseFeedBuffer('products.json', 'application/json', buffer(JSON.stringify({ products: [{ sku: 'A1', title: 'Bak 1' }] })))
  assert.equal(result.format, 'JSON')
  assert.equal(result.rows[0].sku, 'A1')
})

test('parses basic XML product feeds', async () => {
  const result = await parseFeedBuffer('products.xml', 'application/xml', buffer('<products><product><sku>A1</sku><title>Bak 1</title></product><product><sku>A2</sku><title>Bak 2</title></product></products>'))
  assert.equal(result.format, 'XML')
  assert.equal(result.rows.length, 2)
  assert.equal(result.rows[1].sku, 'A2')
})

test('rejects private and sitemap URLs', () => {
  assert.throws(() => validateFeedUrl('http://127.0.0.1/products.csv'))
  assert.throws(() => validateFeedUrl('https://example.com/sitemap.xml'))
  assert.equal(validateFeedUrl('https://example.com/products.csv').hostname, 'example.com')
})
