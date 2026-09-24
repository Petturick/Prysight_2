import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const comparison = read('src/components/ProductComparisonView.tsx')
const products = read('src/components/ProductOverviewGrid.tsx')
const dashboard = read('src/components/OneGlanceDashboardPage.tsx')

test('B2B comparison makes ex VAT the primary product price', () => {
  assert.match(comparison, /Jouw B2B prijs/)
  assert.match(comparison, /{row\.ownEx}.*excl\. btw/s)
  assert.match(comparison, /Laagste bevestigde prijs, excl\. btw/)
  assert.match(products, /'ownEx',[\s\S]*'marketEx'/)
})

test('premium comparison exposes transparent data quality instead of a cosmetic score', () => {
  assert.match(comparison, /row\.qualityLabel/)
  assert.match(comparison, /row\.qualityDetail/)
  assert.match(dashboard, /Datadekking/)
  assert.match(dashboard, /Technische kwaliteit/)
  assert.doesNotMatch(comparison, /confidence score|betrouwbaarheidsscore/i)
})
