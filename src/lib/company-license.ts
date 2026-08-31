import { prisma } from '@/lib/prisma'
import {
  assertLicenseAccess,
  assertWithinLicenseLimit,
  resolveEffectiveLimits,
  type LicenseResource,
} from '@/lib/licensing'

export async function getCompanyLicenseSnapshot(companyId: string) {
  const license = await prisma.companyLicense.findUniqueOrThrow({
    where: { companyId },
    include: { plan: true },
  })

  const startOfToday = new Date()
  startOfToday.setUTCHours(0, 0, 0, 0)

  const [users, countries, competitors, skus, checksPerDay] = await Promise.all([
    prisma.companyMembership.count({ where: { companyId, isActive: true } }),
    prisma.companyCountry.count({ where: { companyId, isActive: true } }),
    prisma.competitor.count({ where: { companyId, isActive: true } }),
    prisma.product.count({ where: { companyId, isActive: true } }),
    prisma.priceCheck.count({ where: { companyId, checkMethod: { not: 'IMPORT' }, checkedAt: { gte: startOfToday } } }),
  ])

  const limits = resolveEffectiveLimits(license.plan, license)

  return {
    license,
    limits,
    usage: { users, countries, competitors, skus, checksPerDay },
  }
}

export async function assertCompanyCapacity(companyId: string, resource: LicenseResource, requested = 1) {
  const snapshot = await getCompanyLicenseSnapshot(companyId)
  assertLicenseAccess(snapshot.license)
  assertWithinLicenseLimit(snapshot.limits, resource, snapshot.usage[resource], requested)
  return snapshot
}
