import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const main = read('src/app/concurrenten/page.tsx')
const admin = read('src/app/beheer/concurrenten/page.tsx')
const bulk = read('src/components/CompetitorBulkTable.tsx')
const action = read('src/app/actions/competitorBulkActions.ts')

test('Bulkselectie werkt op beide concurrentenoverzichten en behoudt marktfilter', () => {
  for (const page of [main, admin]) {
    assert.match(page, /CompetitorBulkTable/)
    assert.match(page, /offerCount: competitor\._count\.offers/)
    assert.match(page, /name: competitor\.name/)
    assert.doesNotMatch(page, /<DataTable/)
  }
  assert.match(bulk, /Alle getoonde concurrenten selecteren/)
  assert.match(bulk, /selectedRows\.length/)
  assert.match(bulk, /new Set\(rows\.map\(row => row\.id\)\)/)
  assert.match(main, /key=\{selectedMarket\?\.code \?\? 'alle'\}/)
  assert.match(bulk, /router\.refresh\(\)/)
  assert.match(bulk, /role="dialog"/)
  assert.match(bulk, /selectedRows\.map\(row =>/)
})

test('Definitief verwijderen vereist expliciete bevestiging en controleert de actuele selectie serverzijdig', () => {
  assert.match(action, /requirePermission\('competitors\.write'\)/)
  assert.match(action, /new Set\(ids\)\.size !== ids\.length/)
  assert.match(action, /confirmation !== `VERWIJDER \$\{ids\.length\} CONCURRENTEN`/)
  assert.match(action, /companyId: actor\.companyId/)
  assert.match(action, /competitor\.name !== expectedNames\[index\]/)
  assert.match(action, /competitor\._count\.offers !== expectedOffers\[index\]/)
  assert.match(action, /prisma\.\$transaction/)
  assert.match(action, /tx\.alert\.deleteMany/)
  assert.match(action, /tx\.productMatch\.deleteMany/)
  assert.match(action, /tx\.competitorOffer\.deleteMany/)
  assert.match(action, /tx\.competitor\.deleteMany/)
  assert.match(action, /tx\.auditLog\.create/)
  assert.match(action, /REVALIDATE_AFTER_DELETE\.forEach\(revalidatePath\)/)
  assert.doesNotMatch(action, /deleteMany\(\{\s*where:\s*\{ companyId: actor\.companyId \}\s*\}\)/)
})
