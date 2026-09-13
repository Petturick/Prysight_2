import { safeRemoteFetch } from '@/lib/safe-remote-url'

type MagentoConfig = {
  baseUrl: string
  accessToken: string
  storeCode: string
  storeId: number
}

type MagentoBasePrice = {
  price?: number | string
  store_id?: number
  sku?: string
}

function normalizeBaseUrl(value: string) {
  const url = new URL(value.trim())
  if (url.protocol !== 'https:') throw new Error('Magento writeback vereist een HTTPS basis-URL.')
  return url.toString().replace(/\/$/, '')
}

function normalizedStoreCode(value: string | undefined) {
  const code = (value ?? 'all').trim() || 'all'
  if (!/^[a-zA-Z0-9_]+$/.test(code)) throw new Error('Magento store code bevat ongeldige tekens.')
  return code
}

export function getMagentoPricingConfig(): MagentoConfig | null {
  const rawBaseUrl = process.env.MAGENTO_BASE_URL?.trim()
  const accessToken = process.env.MAGENTO_ACCESS_TOKEN?.trim()
  if (!rawBaseUrl || !accessToken) return null
  const parsedStoreId = Number(process.env.MAGENTO_STORE_ID ?? '0')
  if (!Number.isInteger(parsedStoreId) || parsedStoreId < 0) throw new Error('MAGENTO_STORE_ID moet een geheel getal van 0 of hoger zijn.')
  return {
    baseUrl: normalizeBaseUrl(rawBaseUrl),
    accessToken,
    storeCode: normalizedStoreCode(process.env.MAGENTO_STORE_CODE),
    storeId: parsedStoreId,
  }
}

export function isMagentoPricingConfigured() {
  try {
    return getMagentoPricingConfig() !== null
  } catch {
    return false
  }
}

function endpoint(config: MagentoConfig, path: string) {
  return `${config.baseUrl}/rest/${config.storeCode}/V1/${path.replace(/^\//, '')}`
}

async function request(config: MagentoConfig, path: string, body: unknown) {
  const response = await safeRemoteFetch(endpoint(config, path), {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const raw = await response.text()
  if (!response.ok) {
    const detail = raw.slice(0, 500).replace(/\s+/g, ' ').trim()
    throw new Error(`Magento gaf HTTP ${response.status}${detail ? `: ${detail}` : '.'}`)
  }
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error('Magento gaf een ongeldige JSON response terug.')
  }
}

export function pricesEqual(left: number, right: number, tolerance = 0.01) {
  return Math.abs(left - right) <= tolerance
}

export async function readMagentoBasePrice(sku: string) {
  const config = getMagentoPricingConfig()
  if (!config) throw new Error('Magento writeback is nog niet geconfigureerd.')
  const cleanSku = sku.trim()
  if (!cleanSku) throw new Error('SKU ontbreekt voor Magento writeback.')
  const result = await request(config, 'products/base-prices-information', { skus: [cleanSku] })
  if (!Array.isArray(result)) throw new Error('Magento gaf geen geldige base price lijst terug.')
  const prices = result as MagentoBasePrice[]
  const match = prices.find((item) => item.sku === cleanSku && Number(item.store_id ?? 0) === config.storeId)
    ?? prices.find((item) => item.sku === cleanSku)
  const value = Number(match?.price)
  if (!Number.isFinite(value) || value < 0) throw new Error(`Geen geldige Magento base price gevonden voor SKU ${cleanSku}.`)
  return { price: value, storeId: Number(match?.store_id ?? config.storeId), sku: cleanSku }
}

export async function writeMagentoBasePrice(sku: string, price: number) {
  const config = getMagentoPricingConfig()
  if (!config) throw new Error('Magento writeback is nog niet geconfigureerd.')
  const cleanSku = sku.trim()
  if (!cleanSku) throw new Error('SKU ontbreekt voor Magento writeback.')
  if (!Number.isFinite(price) || price < 0) throw new Error('Nieuwe Magento prijs is ongeldig.')
  await request(config, 'products/base-prices', {
    prices: [{ price: Math.round(price * 100) / 100, store_id: config.storeId, sku: cleanSku }],
  })
  return readMagentoBasePrice(cleanSku)
}
