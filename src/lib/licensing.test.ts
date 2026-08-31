import assert from 'node:assert/strict'
import test from 'node:test'
import {
  LicenseInactiveError,
  LicenseLimitError,
  assertLicenseAccess,
  assertWithinLicenseLimit,
  hasLicenseAccess,
  resolveEffectiveLimits,
} from './licensing'

const plan = {
  maxUsers: 3,
  maxCountries: 2,
  maxCompetitors: 10,
  maxSkus: 100,
  maxChecksPerDay: null,
}

test('planlimieten blijven leidend wanneer geen overrides bestaan', () => {
  assert.deepEqual(resolveEffectiveLimits(plan, {
    overrideMaxUsers: null,
    overrideMaxCountries: null,
    overrideMaxCompetitors: null,
    overrideMaxSkus: null,
    overrideMaxChecksPerDay: null,
  }), {
    users: 3,
    countries: 2,
    competitors: 10,
    skus: 100,
    checksPerDay: null,
  })
})

test('company override vervangt alleen de ingestelde limiet', () => {
  const limits = resolveEffectiveLimits(plan, {
    overrideMaxUsers: 8,
    overrideMaxCountries: null,
    overrideMaxCompetitors: null,
    overrideMaxSkus: 500,
    overrideMaxChecksPerDay: null,
  })

  assert.equal(limits.users, 8)
  assert.equal(limits.countries, 2)
  assert.equal(limits.skus, 500)
})

test('null betekent onbeperkt', () => {
  assert.doesNotThrow(() => assertWithinLicenseLimit({
    users: null,
    countries: null,
    competitors: null,
    skus: null,
    checksPerDay: null,
  }, 'skus', 250_000, 50_000))
})

test('toevoegen tot exact de limiet is toegestaan', () => {
  assert.doesNotThrow(() => assertWithinLicenseLimit({
    users: 3,
    countries: 2,
    competitors: 10,
    skus: 100,
    checksPerDay: 1000,
  }, 'users', 2, 1))
})

test('overschrijden van de limiet geeft een bruikbare fout', () => {
  assert.throws(
    () => assertWithinLicenseLimit({
      users: 3,
      countries: 2,
      competitors: 10,
      skus: 100,
      checksPerDay: 1000,
    }, 'competitors', 10, 1),
    (error) => error instanceof LicenseLimitError && error.resource === 'competitors' && error.limit === 10,
  )
})

test('past due houdt toegang tijdens betaalherstel actief', () => {
  assert.equal(hasLicenseAccess({
    status: 'PAST_DUE',
    currentPeriodEnd: null,
    manuallyGrantedUntil: null,
  }), true)
})

test('opgezegd abonnement houdt toegang tot het betaalde periode einde', () => {
  const now = new Date('2026-08-25T08:00:00Z')
  assert.equal(hasLicenseAccess({
    status: 'CANCELED',
    currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
    manuallyGrantedUntil: null,
  }, now), true)
})

test('verlopen licentie wordt geblokkeerd', () => {
  assert.throws(() => assertLicenseAccess({
    status: 'EXPIRED',
    currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
    manuallyGrantedUntil: null,
  }, new Date('2026-08-25T08:00:00Z')), LicenseInactiveError)
})
