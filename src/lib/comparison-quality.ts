export type ComparisonQuality = 'VERIFIED' | 'LIMITED' | 'ATTENTION' | 'NO_DATA'

export function comparisonQuality(input: {
  verifiedOfferCount: number
  sourceCount: number
  reviewCount: number
  stale: boolean
  lastCheckFailed: boolean
}) {
  const { verifiedOfferCount, sourceCount, reviewCount, stale, lastCheckFailed } = input
  if (lastCheckFailed || stale || reviewCount > 0) {
    return {
      code: 'ATTENTION' as const,
      label: 'Controleren',
      detail: lastCheckFailed
        ? 'De laatste prijscontrole is mislukt.'
        : stale
          ? 'De laatste geldige prijsmeting is verouderd.'
          : 'Er wachten productmatches op beoordeling.',
    }
  }
  if (verifiedOfferCount >= 2) {
    return {
      code: 'VERIFIED' as const,
      label: 'Sterk onderbouwd',
      detail: 'Minimaal twee bevestigde en actuele concurrentieprijzen.',
    }
  }
  if (verifiedOfferCount === 1) {
    return {
      code: 'LIMITED' as const,
      label: 'Beperkte dekking',
      detail: 'Eén bevestigde en actuele concurrentieprijs.',
    }
  }
  return {
    code: 'NO_DATA' as const,
    label: sourceCount > 0 ? 'Nog geen geldige prijs' : 'Geen bronnen',
    detail: sourceCount > 0
      ? 'Er zijn bronnen gekoppeld, maar nog geen bruikbare actuele prijs.'
      : 'Koppel eerst een concurrentiebron.',
  }
}
