import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('kern APIs gebruiken nooit de legacy default tenant', () => {
  const files = [
    'src/app/api/producten/route.ts',
    'src/app/api/producten/[id]/route.ts',
    'src/app/api/concurrenten/route.ts',
    'src/app/api/feeds/[id]/mapping/route.ts',
  ]
  for (const file of files) {
    const text = source(file)
    assert.equal(text.includes('DEFAULT_COMPANY_ID'), false, `${file} mag geen legacy default tenant gebruiken`)
    assert.match(text, /actor\.companyId/, `${file} moet de actieve tenant gebruiken`)
  }
})

test('tenantgevoelige paginas vereisen rechten en filteren op companyId', () => {
  const expectations: Array<[string, string]> = [
    ['src/app/productmatches/page.tsx', "requirePermission('competitors.read')"],
    ['src/app/rapportages/page.tsx', "requirePermission('reports.read')"],
    ['src/app/import/page.tsx', "requirePermission('imports.run')"],
    ['src/app/feeds/page.tsx', "requirePermission('feeds.read')"],
    ['src/app/feeds/diagnose/page.tsx', "requirePermission('feeds.read')"],
    ['src/app/feeds/map/page.tsx', "requirePermission('feeds.read')"],
    ['src/app/feeds/data/page.tsx', "requirePermission('feeds.read')"],
  ]
  for (const [file, permission] of expectations) {
    const text = source(file)
    assert.ok(text.includes(permission), `${file} mist ${permission}`)
    assert.ok(text.includes('companyId: actor.companyId'), `${file} mist company scoping`)
  }
})

test('rapport exports en matchmutaties zijn tenant scoped', () => {
  const reportsApi = source('src/app/api/rapportages/route.ts')
  assert.ok(reportsApi.includes("requirePermission('reports.read')"))
  assert.ok(reportsApi.includes('companyId: actor.companyId'))
  assert.ok(reportsApi.includes('buildWeeklyReportPayload(company.id, weekStart, new Date())'))

  const matches = source('src/app/actions/matchActions.ts')
  assert.ok(matches.includes("requirePermission('competitors.write')"))
  assert.ok(matches.includes('companyId: actor.companyId'))
})

test('productpublicatie kan nooit zonder expliciete tenantfilter queryen', () => {
  const publication = source('src/app/api/feeds/publicaties/products/route.ts')
  assert.ok(publication.includes('where: { companyId: scope.companyId, isActive: true }'))
  assert.ok(publication.includes("requirePermission('feeds.read')"))
})

test('automatische monitoring verdeelt werk over actieve gelicentieerde organisaties', () => {
  const route = source('src/app/api/prijscontroles/route.ts')
  assert.ok(route.includes("where: { status: 'ACTIVE' }"))
  assert.ok(route.includes('hasLicenseAccess(company.license)'))
  assert.ok(route.includes('runDuePriceChecks({ companyId: company.id'))
})

test('hourly Netlify taak draagt zwaar werk over aan background functie', () => {
  const scheduled = source('netlify/functions/scheduled-price-check.ts')
  const background = source('netlify/functions/price-check-background.ts')
  assert.ok(scheduled.includes('/internal/price-check-background'))
  assert.ok(scheduled.includes("schedule: '@hourly'"))
  assert.ok(background.includes('/api/prijscontroles'))
  assert.ok(background.includes("Netlify.env.get('PRICE_MONITOR_API_KEY')"))
})

test('rapport toont een verse productstand en telt alle fouten voor uitsluitend actieve productbronnen', () => {
  const dashboard = source('src/lib/dashboard.ts')
  const reports = source('src/app/rapportages/page.tsx')
  const actions = source('src/app/actions/reportActions.ts')
  assert.ok(dashboard.includes('prisma.priceCheck.count({ where: failedWhere })'))
  assert.ok(dashboard.includes('prisma.competitorOffer.count({ where: staleWhere })'))
  assert.ok(dashboard.includes('product: { companyId: companyId || undefined, isActive: true }'))
  assert.ok(dashboard.includes('checkedAt: { gte: checkedSince, lte: checkedUntil }'))
  assert.ok(reports.includes('getFreshDashboardSnapshot({}, actor.companyId)'))
  assert.ok(reports.includes('Historische momentopname'))
  assert.ok(actions.includes('getFreshDashboardSnapshot({}, companyId, { from: weekStart, to: weekEnd })'))
})


test('operationele tenantcode heeft geen impliciete Engels Group fallback', () => {
  const files = [
    'src/app/api/rapportages/route.ts',
    'src/app/api/integraties/product-feed/route.ts',
    'src/app/api/feeds/publicaties/products/route.ts',
    'src/app/api/integraties/syntrx/route.ts',
    'src/lib/feed-ingestion-v2.ts',
    'src/lib/price-monitoring.ts',
  ]
  for (const file of files) {
    const text = source(file)
    assert.equal(text.includes('DEFAULT_COMPANY_ID'), false, `${file} mag geen standaardtenant gebruiken`)
    assert.equal(text.includes("'cmp_engels_group'"), false, `${file} mag geen hardcoded Engels Group tenant gebruiken`)
  }
})

test('Prisma domeinmodellen hebben geen companyId database default', () => {
  const schema = source('prisma/schema.prisma')
  assert.equal(schema.includes('@default("cmp_engels_group")'), false)
})

test('tenant hardening migration verwijdert legacy browser policies en company defaults', () => {
  const migration = source('supabase/migrations/20260924155000_tenant_boundary_hardening.sql')
  assert.match(migration, /policyname like 'anon_%'/)
  assert.match(migration, /revoke all on table public\.%I from anon, authenticated/)
  assert.match(migration, /alter column company_id drop default/)
})
