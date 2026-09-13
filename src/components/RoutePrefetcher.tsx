'use client'

/**
 * Zware PrySight-routes worden bewust niet globaal geprefetcht.
 * Product-, markt-, monitoring- en pricingpagina's voeren serverqueries uit;
 * speculative prefetch maakte die queries al vóór een echte gebruikersklik.
 * Next.js kan lichte, lokale navigatie nog steeds op linkniveau optimaliseren.
 */
export function RoutePrefetcher() {
  return null
}
