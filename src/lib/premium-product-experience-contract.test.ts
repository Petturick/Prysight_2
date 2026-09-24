import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const interaction = read('src/components/InteractionFeedback.tsx')
const shell = read('src/components/AppShell.tsx')
const sidebar = read('src/components/Sidebar.tsx')
const css = read('src/app/globals.css')
const monitoring = read('src/app/monitoring/page.tsx')
const notFound = read('src/app/not-found.tsx')
const comparison = read('src/components/ProductComparisonView.tsx')
const productsPage = read('src/app/producten/page.tsx')
const feeds = read('src/app/feeds/page.tsx')
const importPage = read('src/app/import/page.tsx')
const matches = read('src/app/productmatches/page.tsx')
const priceRules = read('src/app/prijsregels/page.tsx')
const priceChanges = read('src/app/prijswijzigingen/page.tsx')
const dataTable = read('src/components/DataTable.tsx')
const competitorActions = read('src/components/CompetitorRowActions.tsx')
const competitorBulk = read('src/components/CompetitorBulkTable.tsx')

test('premium shell stays quiet, accessible and avoids gimmicky interaction feedback', () => {
  assert.doesNotMatch(interaction, /vibrate/i)
  assert.doesNotMatch(interaction, /Laden…/)
  assert.match(interaction, /setTimeout\(\(\) => setVisible\(true\), 180\)/)
  assert.match(shell, /aria-current=\{active \? 'page'/)
  assert.match(sidebar, /aria-current=\{active \? 'page'/)
})

test('premium interaction standard covers focus, touch and reduced motion', () => {
  assert.match(css, /Premium B2B interaction standard/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /prefers-reduced-motion: reduce/)
  assert.match(css, /pointer:coarse/)
  assert.match(css, /premium-kpi-card/)
})

test('core decision surfaces use premium patterns and explicit recovery states', () => {
  assert.match(monitoring, /premium-kpi-card/)
  assert.match(monitoring, /Monitoringstatus/)
  assert.match(comparison, /Jouw B2B prijs/)
  assert.match(comparison, /Laagste bevestigde prijs, excl\. btw/)
  assert.match(notFound, /Je gegevens zijn niet gewijzigd/)
  assert.match(notFound, /Naar overzicht/)
})

test('core product comparison query is performance budgeted', () => {
  assert.match(productsPage, /profileStep\('\/producten', 'overview-query'/)
  assert.match(productsPage, /450\)/)
})


test('data onboarding and pricing governance use the same premium B2B hierarchy', () => {
  assert.match(feeds, /premium-kpi-card/)
  assert.match(importPage, /premium-decision-card/)
  assert.match(priceChanges, /premium-kpi-card/)
  assert.match(priceRules, /rounded-\[8px\].*border border-\[#dce3eb\]/)
  assert.doesNotMatch(priceRules, /border-2/)
})

test('match review communicates evidence without pseudo precise percentages', () => {
  assert.match(matches, /Sterke match/)
  assert.match(matches, /Waarschijnlijke match/)
  assert.match(matches, /Handmatig controleren/)
  assert.doesNotMatch(matches, /formatNumber\(match\.confidenceScore\).*%/s)
})


test('shared tables use the same quiet enterprise data surface', () => {
  assert.match(dataTable, /data-grid-scroll/)
  assert.match(dataTable, /scope="col"/)
  assert.match(dataTable, /rounded-\[12px\].*border border-\[#e2e8f0\]/s)
  assert.doesNotMatch(dataTable, /rounded-\[16px\]/)
})


test('destructive competitor actions use an in-product confirmation flow', () => {
  assert.doesNotMatch(competitorActions, /window\.prompt/)
  assert.match(competitorActions, /role="dialog"/)
  assert.match(competitorActions, /Typ de volledige concurrentnaam/)
  assert.match(competitorActions, /ps-button-danger/)
})

test('bulk competitor actions share the same premium confirmation language', () => {
  assert.match(competitorBulk, /premium-toolbar/)
  assert.match(competitorBulk, /ps-button-danger/)
  assert.match(competitorBulk, /role="dialog"/)
})

test('premium quality is not achieved by hiding uncertainty', () => {
  assert.match(comparison, /row\.qualityLabel/)
  assert.match(comparison, /row\.qualityDetail/)
  assert.match(monitoring, /Mislukte|mislukte|failedChecks24h/)
})
