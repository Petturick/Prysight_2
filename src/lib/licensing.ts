export const LICENSE_RESOURCES = ['users', 'countries', 'competitors', 'skus', 'checksPerDay'] as const

export type LicenseResource = (typeof LICENSE_RESOURCES)[number]

export type LicenseLimits = Record<LicenseResource, number | null>

export type LicensePlanLimits = {
  maxUsers: number | null
  maxCountries: number | null
  maxCompetitors: number | null
  maxSkus: number | null
  maxChecksPerDay: number | null
}

export type LicenseOverrides = {
  overrideMaxUsers: number | null
  overrideMaxCountries: number | null
  overrideMaxCompetitors: number | null
  overrideMaxSkus: number | null
  overrideMaxChecksPerDay: number | null
}

export type LicenseAccessState = {
  status: 'INCOMPLETE' | 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELED' | 'EXPIRED' | 'UNPAID'
  currentPeriodEnd: Date | null
  manuallyGrantedUntil: Date | null
}

const RESOURCE_LABELS: Record<LicenseResource, string> = {
  users: 'gebruikers',
  countries: 'landen',
  competitors: 'concurrenten',
  skus: 'SKU\'s',
  checksPerDay: 'prijscontroles per dag',
}

export class LicenseLimitError extends Error {
  readonly code = 'LICENSE_LIMIT_REACHED'

  constructor(
    readonly resource: LicenseResource,
    readonly limit: number,
    readonly current: number,
    readonly requested: number,
  ) {
    super(`De licentielimiet voor ${RESOURCE_LABELS[resource]} is bereikt, ${current} van ${limit} in gebruik.`)
    this.name = 'LicenseLimitError'
  }
}

export class LicenseInactiveError extends Error {
  readonly code = 'LICENSE_INACTIVE'

  constructor(readonly status: LicenseAccessState['status']) {
    super('De licentie is niet actief. Herstel het abonnement of laat een beheerder de licentie aanpassen.')
    this.name = 'LicenseInactiveError'
  }
}

export function resolveEffectiveLimits(plan: LicensePlanLimits, overrides: LicenseOverrides): LicenseLimits {
  return {
    users: overrides.overrideMaxUsers ?? plan.maxUsers,
    countries: overrides.overrideMaxCountries ?? plan.maxCountries,
    competitors: overrides.overrideMaxCompetitors ?? plan.maxCompetitors,
    skus: overrides.overrideMaxSkus ?? plan.maxSkus,
    checksPerDay: overrides.overrideMaxChecksPerDay ?? plan.maxChecksPerDay,
  }
}

export function hasLicenseAccess(license: LicenseAccessState, now = new Date()): boolean {
  if (license.manuallyGrantedUntil && license.manuallyGrantedUntil > now) return true
  if (license.status === 'ACTIVE' || license.status === 'TRIALING' || license.status === 'PAST_DUE') return true
  return license.status === 'CANCELED' && Boolean(license.currentPeriodEnd && license.currentPeriodEnd > now)
}

export function assertLicenseAccess(license: LicenseAccessState, now = new Date()): void {
  if (!hasLicenseAccess(license, now)) throw new LicenseInactiveError(license.status)
}

export function assertWithinLicenseLimit(
  limits: LicenseLimits,
  resource: LicenseResource,
  current: number,
  requested = 1,
): void {
  if (!Number.isInteger(current) || current < 0) throw new TypeError('current moet een niet negatief geheel getal zijn')
  if (!Number.isInteger(requested) || requested < 1) throw new TypeError('requested moet minimaal 1 zijn')

  const limit = limits[resource]
  if (limit !== null && current + requested > limit) {
    throw new LicenseLimitError(resource, limit, current, requested)
  }
}
