import { safeRemoteFetch } from '@/lib/safe-remote-url'

export type FxSnapshot = {
  base: 'EUR'
  asOf: string
  source: 'ECB' | 'FALLBACK'
  rates: Record<string, number>
}

const ECB_DAILY_RATES_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

let cached: { loadedAt: number; snapshot: FxSnapshot } | null = null

const fallbackSnapshot: FxSnapshot = {
  base: 'EUR',
  asOf: 'fallback',
  source: 'FALLBACK',
  rates: {
    EUR: 1,
    GBP: 0.855,
    DKK: 7.46,
    USD: 1.1,
  },
}

export function parseEcbDailyRates(xml: string): FxSnapshot {
  const date = xml.match(/time=['"]([^'"]+)['"]/i)?.[1]
  const rates: Record<string, number> = { EUR: 1 }
  for (const match of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]/gi)) {
    const currency = match[1]?.toUpperCase()
    const rate = Number(match[2])
    if (currency && Number.isFinite(rate) && rate > 0) rates[currency] = rate
  }
  if (!date || Object.keys(rates).length < 2) throw new Error('ECB wisselkoersrespons kon niet betrouwbaar worden gelezen.')
  return { base: 'EUR', asOf: date, source: 'ECB', rates }
}

export function convertWithFxSnapshot(amount: number, fromCurrency: string, toCurrency: string, snapshot: FxSnapshot) {
  const from = fromCurrency.toUpperCase()
  const to = toCurrency.toUpperCase()
  if (from === to) return amount
  const fromPerEur = snapshot.rates[from]
  const toPerEur = snapshot.rates[to]
  if (!fromPerEur || !toPerEur) throw new Error(`Geen wisselkoers beschikbaar voor ${from} naar ${to}.`)
  const amountInEur = amount / fromPerEur
  return amountInEur * toPerEur
}

export async function getFxSnapshot(forceRefresh = false): Promise<FxSnapshot> {
  if (!forceRefresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.snapshot

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const response = await safeRemoteFetch(ECB_DAILY_RATES_URL, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/xml,text/xml;q=0.9' },
    })
    clearTimeout(timer)
    if (!response.ok) throw new Error(`ECB gaf HTTP ${response.status}.`)
    const snapshot = parseEcbDailyRates(await response.text())
    cached = { loadedAt: Date.now(), snapshot }
    return snapshot
  } catch {
    if (cached) return cached.snapshot
    return fallbackSnapshot
  }
}
