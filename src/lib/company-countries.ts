import { prisma } from '@/lib/prisma'

export async function getActiveCompanyCountries(companyId: string) {
  const memberships = await prisma.companyCountry.findMany({
    where: { companyId, isActive: true, country: { isActive: true } },
    include: { country: true },
    orderBy: { country: { name: 'asc' } },
  })
  return memberships.map((membership) => membership.country)
}

export async function requireLicensedCountry(companyId: string, countryId: string) {
  const membership = await prisma.companyCountry.findUnique({
    where: { companyId_countryId: { companyId, countryId } },
    include: { country: true },
  })
  if (!membership?.isActive || !membership.country.isActive) {
    throw new Error('Dit land is niet actief binnen de licentie van deze organisatie.')
  }
  return membership.country
}
