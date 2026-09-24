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

test('premium quality is not achieved by hiding uncertainty', () => {
  assert.match(comparison, /row\.qualityLabel/)
  assert.match(comparison, /row\.qualityDetail/)
  assert.match(monitoring, /Mislukte|mislukte|failedChecks24h/)
})
