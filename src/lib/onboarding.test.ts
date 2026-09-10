import test from 'node:test'
import assert from 'node:assert/strict'
import { buildOnboardingState } from './onboarding-progress'

test('onboarding starts with company complete and market as next step', () => {
  const state = buildOnboardingState({ company: 1, countries: 0, products: 0, competitors: 0, matches: 0, successfulChecks: 0 })
  assert.equal(state.completed, 1)
  assert.equal(state.progress, 17)
  assert.equal(state.nextStep?.key, 'countries')
})

test('onboarding is complete only after a successful price check', () => {
  const almost = buildOnboardingState({ company: 1, countries: 1, products: 10, competitors: 2, matches: 5, successfulChecks: 0 })
  assert.equal(almost.progress, 83)
  assert.equal(almost.nextStep?.key, 'monitoring')
  const complete = buildOnboardingState({ company: 1, countries: 1, products: 10, competitors: 2, matches: 5, successfulChecks: 1 })
  assert.equal(complete.progress, 100)
  assert.equal(complete.nextStep, null)
})
