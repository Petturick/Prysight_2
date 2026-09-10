import 'server-only'
import { prisma } from '@/lib/prisma'
import { buildOnboardingState } from '@/lib/onboarding-progress'

export async function getOnboardingState(companyId: string) {
  const [company, countries, products, competitors, matches, successfulChecks] = await Promise.all([
    prisma.company.count({ where: { id: companyId, status: 'ACTIVE' } }),
    prisma.companyCountry.count({ where: { companyId, isActive: true } }),
    prisma.product.count({ where: { companyId, isActive: true } }),
    prisma.competitor.count({ where: { companyId, isActive: true } }),
    prisma.productMatch.count({ where: { companyId, matchStatus: { in: ['CERTAIN', 'REVIEW'] } } }),
    prisma.priceCheck.count({ where: { companyId, isSuccess: true } }),
  ])
  return buildOnboardingState({ company, countries, products, competitors, matches, successfulChecks })
}
