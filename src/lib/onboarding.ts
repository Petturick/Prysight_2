import 'server-only'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { buildOnboardingState } from '@/lib/onboarding-progress'

const getCachedOnboardingState = unstable_cache(
  async (companyId: string) => {
    const [company, countries, products, competitors, matches, successfulChecks] = await Promise.all([
      prisma.company.count({ where: { id: companyId, status: 'ACTIVE' } }),
      prisma.companyCountry.count({ where: { companyId, isActive: true } }),
      prisma.product.count({ where: { companyId, isActive: true } }),
      prisma.competitor.count({ where: { companyId, isActive: true } }),
      prisma.productMatch.count({ where: { companyId, matchStatus: { in: ['CERTAIN', 'REVIEW'] } } }),
      prisma.priceCheck.count({ where: { companyId, isSuccess: true } }),
    ])
    return buildOnboardingState({ company, countries, products, competitors, matches, successfulChecks })
  },
  ['prysight-onboarding-state-v2'],
  { revalidate: 30 },
)

export async function getOnboardingState(companyId: string) {
  return getCachedOnboardingState(companyId)
}
