/**
 * Suggestion-only conversion. An unknown source VAT status is not a license
 * to guess whether the observed amount is gross or net.
 */
export function priceSuggestionAmounts(
  observed: number,
  vatIncluded: boolean | null,
  vatRate: number,
): { incl: number | null; excl: number | null } {
  if (!Number.isFinite(observed) || observed <= 0 || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100 || vatIncluded === null) {
    return { incl: null, excl: null }
  }
  const factor = 1 + vatRate / 100
  const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
  return vatIncluded
    ? { incl: cents(observed), excl: cents(observed / factor) }
    : { incl: cents(observed * factor), excl: cents(observed) }
}
