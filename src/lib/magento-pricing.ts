import { safeRemoteFetch } from '@/lib/safe-remote-url'

type MagentoConfig = {
  baseUrl: string
  accessToken: string
  companyId: string
  currency: string
  storeCode: string
  storeId: number
  pricesIncludeTax: boolean
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

function taxMode(value: string | undefined) {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  throw new Error('Stel MAGENTO_PRICES_INCLUDE_TAX expliciet in op true of false voordat writeback wordt gebruikt.')
}

function currency(value: string | undefined) {
  const code = value?.trim().toUpperCase()
  if (!code || !/^[A-Z]{3}$/.test(code)) throw new Error('Stel MAGENTO_CURRENCY expliciet in op een geldige ISO valutacode.')
  return code
}

export function getMagentoPricingConfig(companyId?: string): MagentoConfig | null {
  const rawBaseUrl = process.env.MAGENTO_BASE_URL?.trim()
  const accessToken = process.env.MAGENTO_ACCESS_TOKEN?.trim()
  if (!rawBaseUrl || !accessToken) return null
  const configuredCompanyId = process.env.MAGENTO_COMPANY_ID?.trim()
  if (!configuredCompanyId) throw new Error('Stel MAGENTO_COMPANY_ID in voordat Magento writeback wordt gebruikt.')
  if (companyId && configuredCompanyId !== companyId) throw new Error('Magento writeback is niet geconfigureerd voor deze organisatie.')
  const parsedStoreId = Number(process.env.MAGENTO_STORE_ID ?? '0')
  if (!Number.isInteger(parsedStoreId) || parsedStoreId < 0) throw new Error('MAGENTO_STORE_ID moet een geheel getal van 0 of hoger zijn.')
  return {
    baseUrl: normalizeBaseUrl(rawBaseUrl),
    accessToken,
    companyId: configuredCompanyId,
    currency: currency(process.env.MAGENTO_CURRENCY),
    storeCode: normalizedStoreCode(process.env.MAGENTO_STORE_CODE),
    storeId: parsedStoreId,
    pricesIncludeTax: taxMode(process.env.MAGENTO_PRICES_INCLUDE_TAX),
  }
}

export function isMagentoPricingConfigured(companyId?: string) {
  try {
    return getMagentoPricingConfig(companyId) !== null
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

export function convertPriceTaxMode(price: number, fromIncludesTax: boolean, toIncludesTax: boolean, vatRate: number | null) {
  if (fromIncludesTax === toIncludesTax) return Math.round(price * 100) / 100
  if (vatRate === null || !Number.isFinite(vatRate) || vatRate < 0) throw new Error('Btw-percentage ontbreekt voor veilige Magento prijsconversie.')
  const factor = 1 + vatRate / 100
  const converted = fromIncludesTax ? price / factor : price * factor
  return Math.round(converted * 100) / 100
}

export async function readMagentoBasePrice(sku: string, companyId: string) {
  const config = getMagentoPricingConfig(companyId)
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
  return { price: value, storeId: Number(match?.store_id ?? config.storeId), sku: cleanSku, pricesIncludeTax: config.pricesIncludeTax, currency: config.currency }
}

export async function writeMagentoBasePrice(sku: string, price: number, companyId: string) {
  const config = getMagentoPricingConfig(companyId)
  if (!config) throw new Error('Magento writeback is nog niet geconfigureerd.')
  const cleanSku = sku.trim()
  if (!cleanSku) throw new Error('SKU ontbreekt voor Magento writeback.')
  if (!Number.isFinite(price) || price < 0) throw new Error('Nieuwe Magento prijs is ongeldig.')
  await request(config, 'products/base-prices', {
    prices: [{ price: Math.round(price * 100) / 100, store_id: config.storeId, sku: cleanSku }],
  })
  return readMagentoBasePrice(cleanSku, companyId)
}
