import { cookies } from 'next/headers'

// The selection is scoped to the authenticated company. Never authorize a market using the cookie alone.
export const marketCookieName = (companyId: string) => `prysight_market_${companyId.replace(/[^a-zA-Z0-9_-]/g, '_')}`

export async function selectedMarketCode(companyId: string) {
  return (await cookies()).get(marketCookieName(companyId))?.value?.trim().toUpperCase() || 'ALL'
}
