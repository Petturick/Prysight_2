export type OnboardingCounts = {
  company: number
  countries: number
  products: number
  competitors: number
  matches: number
  successfulChecks: number
}

export type OnboardingStep = {
  key: 'company' | 'countries' | 'products' | 'competitors' | 'matches' | 'monitoring'
  title: string
  description: string
  href: string
  complete: boolean
}

export function buildOnboardingState(counts: OnboardingCounts) {
  const steps: OnboardingStep[] = [
    { key: 'company', title: 'Bedrijf is actief', description: 'Je Prysight omgeving en organisatie zijn veilig aangemaakt.', href: '/instellingen/profiel', complete: counts.company > 0 },
    { key: 'countries', title: 'Kies je markt', description: 'Activeer minimaal één land waarin je prijzen wilt vergelijken.', href: '/instellingen/markten', complete: counts.countries > 0 },
    { key: 'products', title: 'Voeg producten toe', description: 'Koppel een feed, importeer een bestand of voeg een product handmatig toe.', href: '/feeds', complete: counts.products > 0 },
    { key: 'competitors', title: 'Voeg concurrenten toe', description: 'Koppel de webshops die je in deze markt wilt volgen.', href: '/concurrenten', complete: counts.competitors > 0 },
    { key: 'matches', title: 'Controleer productmatches', description: 'Bevestig dat concurrent URLs echt bij hetzelfde product horen.', href: '/productmatches', complete: counts.matches > 0 },
    { key: 'monitoring', title: 'Start de eerste controle', description: 'Zodra de eerste betrouwbare meting binnen is, is je monitoring actief.', href: '/monitoring', complete: counts.successfulChecks > 0 },
  ]
  const completed = steps.filter((step) => step.complete).length
  return { steps, completed, total: steps.length, progress: Math.round((completed / steps.length) * 100), nextStep: steps.find((step) => !step.complete) ?? null }
}
