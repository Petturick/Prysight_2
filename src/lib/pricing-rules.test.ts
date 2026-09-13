import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePricingRule, type PersistedPricingRule } from '@/lib/pricing-rules'

function rule(overrides: Partial<PersistedPricingRule>): PersistedPricingRule {
  return {
    id: 'base',
    companyId: 'company',
    name: 'Basis',
    countryId: null,
    productGroupId: null,
    productId: null,
    strategy: 'MARKET_MEDIAN',
    adjustmentPct: 0,
    maxChangePct: 5,
    minimumSignalPct: 1,
    onlyInStock: true,
    minimumCompetitors: 2,
    minimumMarginPct: null,
    minimumPrice: null,
    maximumPrice: null,
    roundingMode: 'CENT',
    requireApproval: true,
    priority: 0,
    ...overrides,
  }
}

test('productregel wint van groepsregel en algemene regel', () => {
  const rules = [
    rule({ id: 'general', name: 'Algemeen', priority: 100 }),
    rule({ id: 'group', name: 'Groep', productGroupId: 'group-1' }),
    rule({ id: 'product', name: 'Product', productId: 'product-1' }),
  ]
  const selected = resolvePricingRule(rules, { productId: 'product-1', productGroupId: 'group-1', countryId: 'nl' })
  assert.equal(selected?.id, 'product')
})

test('land en product samen zijn specifieker dan alleen product', () => {
  const rules = [
    rule({ id: 'product', productId: 'product-1', priority: 50 }),
    rule({ id: 'product-nl', productId: 'product-1', countryId: 'nl', priority: 0 }),
  ]
  const selected = resolvePricingRule(rules, { productId: 'product-1', productGroupId: 'group-1', countryId: 'nl' })
  assert.equal(selected?.id, 'product-nl')
})

test('prioriteit beslist alleen bij gelijke specificiteit', () => {
  const rules = [
    rule({ id: 'low', countryId: 'nl', priority: 1 }),
    rule({ id: 'high', countryId: 'nl', priority: 10 }),
  ]
  const selected = resolvePricingRule(rules, { productId: 'product-1', productGroupId: 'group-1', countryId: 'nl' })
  assert.equal(selected?.id, 'high')
})
