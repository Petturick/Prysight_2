import { FeedSourceType, FeedSyncStatus, Prisma } from '@/generated/prisma/client'
import { decryptIntegrationSecret, encryptIntegrationSecret } from '@/lib/integration-secrets'
import { prisma } from '@/lib/prisma'
import { safeRemoteFetch } from '@/lib/safe-remote-url'

const MAGENTO_SOURCE_KEY = 'integration:magento2'

export type MagentoConfig = {
  baseUrl: string
  accessToken: string
  companyId: string
  currency: string
  storeCode: string
  storeId: number
  pricesIncludeTax: boolean
}

export type MagentoIntegrationInput = {
  baseUrl: string
  accessToken?: string
  currency: string
  storeCode?: string
  storeId?: number | string
  pricesIncludeTax: boolean
}

export type MagentoIntegrationSummary = {
  configured: boolean
  ready: boolean
  source: 'database' | 'environment' | 'none'
  baseUrl: string
  currency: string
  storeCode: string
  storeId: number
  pricesIncludeTax: boolean
  hasCredential: boolean
  lastTestedAt: string | null
  status: string
  error: string | null
}

type MagentoStoredConfig = {
  version: 1
  baseUrl: string
  accessTokenEncrypted: string
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
  const trimmed = value.trim().replace(/\/rest(?:\/[^/]+)?\/V1\/?$/i, '')
  const url = new URL(trimmed)
  if (url.protocol !== 'https:') throw new Error('Magento 2 vereist een HTTPS basis URL.')
  url.hash = ''
  url.search = ''
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
  if (!code || !/^[A-Z]{3}$/.test(code)) throw new Error('Gebruik een geldige ISO valutacode, bijvoorbeeld EUR.')
  return code
}

function storeId(value: number | string | undefined) {
  const parsed = Number(value ?? 0)
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error('Magento store ID moet een geheel getal van 0 of hoger zijn.')
  return parsed
}

function objectConfig(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function parseStoredConfig(value: Prisma.JsonValue | null): MagentoStoredConfig | null {
  const config = objectConfig(value)
  if (!config) return null
  if (config.version !== 1 || typeof config.baseUrl !== 'string' || typeof config.accessTokenEncrypted !== 'string') return null
  return {
    version: 1,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    accessTokenEncrypted: config.accessTokenEncrypted,
    currency: currency(String(config.currency ?? '')),
    storeCode: normalizedStoreCode(String(config.storeCode ?? 'all')),
    storeId: storeId(Number(config.storeId ?? 0)),
    pricesIncludeTax: config.pricesIncludeTax === true,
  }
}

function envMagentoConfig(companyId?: string): MagentoConfig | null {
  const rawBaseUrl = process.env.MAGENTO_BASE_URL?.trim()
  const accessToken = process.env.MAGENTO_ACCESS_TOKEN?.trim()
  if (!rawBaseUrl || !accessToken) return null
  const configuredCompanyId = process.env.MAGENTO_COMPANY_ID?.trim()
  if (!configuredCompanyId) throw new Error('Stel MAGENTO_COMPANY_ID in voordat Magento writeback wordt gebruikt.')
  if (companyId && configuredCompanyId !== companyId) throw new Error('Magento writeback is niet geconfigureerd voor deze organisatie.')
  return {
    baseUrl: normalizeBaseUrl(rawBaseUrl),
    accessToken,
    companyId: configuredCompanyId,
    currency: currency(process.env.MAGENTO_CURRENCY),
    storeCode: normalizedStoreCode(process.env.MAGENTO_STORE_CODE),
    storeId: storeId(process.env.MAGENTO_STORE_ID ?? '0'),
    pricesIncludeTax: taxMode(process.env.MAGENTO_PRICES_INCLUDE_TAX),
  }
}

async function storedSource(companyId: string) {
  return prisma.feedSource.findUnique({
    where: { companyId_sourceKey: { companyId, sourceKey: MAGENTO_SOURCE_KEY } },
    select: {
      id: true,
      companyId: true,
      isActive: true,
      config: true,
      lastRunAt: true,
      lastRunStatus: true,
      syncError: true,
      url: true,
    },
  })
}

async function storedMagentoConfig(companyId: string, requireReady = true): Promise<MagentoConfig | null> {
  const source = await storedSource(companyId)
  if (!source || !source.isActive) return null
  if (requireReady && source.lastRunStatus !== FeedSyncStatus.COMPLETED) return null
  const config = parseStoredConfig(source.config)
  if (!config) return null
  return {
    baseUrl: config.baseUrl,
    accessToken: decryptIntegrationSecret(config.accessTokenEncrypted),
    companyId,
    currency: config.currency,
    storeCode: config.storeCode,
    storeId: config.storeId,
    pricesIncludeTax: config.pricesIncludeTax,
  }
}

export async function getMagentoPricingConfig(companyId?: string): Promise<MagentoConfig | null> {
  if (companyId) {
    const stored = await storedMagentoConfig(companyId)
    if (stored) return stored
  }
  return envMagentoConfig(companyId)
}

export async function isMagentoPricingConfigured(companyId?: string) {
  try {
    return (await getMagentoPricingConfig(companyId)) !== null
  } catch {
    return false
  }
}

function endpoint(config: MagentoConfig, path: string) {
  return `${config.baseUrl}/rest/${config.storeCode}/V1/${path.replace(/^\//, '')}`
}

async function request(config: MagentoConfig, path: string, options?: { method?: 'GET' | 'POST'; body?: unknown }) {
  const method = options?.method ?? 'POST'
  const response = await safeRemoteFetch(endpoint(config, path), {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: 'application/json',
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(options?.body ?? {}) } : {}),
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

async function resolveConnectionInput(companyId: string, input: MagentoIntegrationInput) {
  let accessToken = input.accessToken?.trim() ?? ''
  if (!accessToken) {
    const stored = await storedMagentoConfig(companyId, false).catch(() => null)
    accessToken = stored?.accessToken ?? envMagentoConfig(companyId)?.accessToken ?? ''
  }
  if (!accessToken) throw new Error('Vul een Magento access token in.')
  return {
    baseUrl: normalizeBaseUrl(input.baseUrl),
    accessToken,
    companyId,
    currency: currency(input.currency),
    storeCode: normalizedStoreCode(input.storeCode),
    storeId: storeId(input.storeId),
    pricesIncludeTax: Boolean(input.pricesIncludeTax),
  } satisfies MagentoConfig
}

async function testMagentoConfig(config: MagentoConfig) {
  const result = await request(config, 'store/storeViews', { method: 'GET' })
  if (!Array.isArray(result)) throw new Error('Magento antwoordt, maar store views konden niet worden gelezen.')
  const storeViews = result as Array<{ id?: number; code?: string; name?: string }>
  return {
    storeViews: storeViews.length,
    matchedStore: storeViews.some((item) => item.code === config.storeCode || Number(item.id) === config.storeId),
  }
}

export async function testMagentoIntegrationInput(companyId: string, input: MagentoIntegrationInput) {
  const config = await resolveConnectionInput(companyId, input)
  const test = await testMagentoConfig(config)
  return {
    ok: true,
    baseUrl: config.baseUrl,
    currency: config.currency,
    storeCode: config.storeCode,
    storeId: config.storeId,
    pricesIncludeTax: config.pricesIncludeTax,
    ...test,
  }
}

export async function saveMagentoIntegrationConfig(companyId: string, input: MagentoIntegrationInput) {
  const config = await resolveConnectionInput(companyId, input)
  const test = await testMagentoConfig(config)
  const now = new Date()
  const stored: MagentoStoredConfig = {
    version: 1,
    baseUrl: config.baseUrl,
    accessTokenEncrypted: encryptIntegrationSecret(config.accessToken),
    currency: config.currency,
    storeCode: config.storeCode,
    storeId: config.storeId,
    pricesIncludeTax: config.pricesIncludeTax,
  }
  await prisma.feedSource.upsert({
    where: { companyId_sourceKey: { companyId, sourceKey: MAGENTO_SOURCE_KEY } },
    update: {
      name: 'Magento 2',
      sourceType: FeedSourceType.API,
      url: config.baseUrl,
      isActive: true,
      lastRunAt: now,
      lastRunStatus: FeedSyncStatus.COMPLETED,
      lastItemCount: test.storeViews,
      lastErrorCount: 0,
      syncError: null,
      config: stored as unknown as Prisma.InputJsonValue,
    },
    create: {
      companyId,
      sourceKey: MAGENTO_SOURCE_KEY,
      name: 'Magento 2',
      sourceType: FeedSourceType.API,
      url: config.baseUrl,
      countryCode: 'GLOBAL',
      isActive: true,
      lastRunAt: now,
      lastRunStatus: FeedSyncStatus.COMPLETED,
      lastItemCount: test.storeViews,
      config: stored as unknown as Prisma.InputJsonValue,
    },
  })
  return { ok: true, ...test }
}

export async function disconnectMagentoIntegration(companyId: string) {
  await prisma.feedSource.updateMany({
    where: { companyId, sourceKey: MAGENTO_SOURCE_KEY },
    data: { isActive: false, lastRunStatus: FeedSyncStatus.IDLE, syncError: null },
  })
}

export async function getMagentoIntegrationSummary(companyId: string): Promise<MagentoIntegrationSummary> {
  const source = await storedSource(companyId)
  if (source) {
    const parsed = (() => {
      try { return parseStoredConfig(source.config) } catch { return null }
    })()
    return {
      configured: Boolean(parsed),
      ready: Boolean(parsed && source.isActive && source.lastRunStatus === FeedSyncStatus.COMPLETED),
      source: 'database',
      baseUrl: parsed?.baseUrl ?? source.url ?? '',
      currency: parsed?.currency ?? 'EUR',
      storeCode: parsed?.storeCode ?? 'all',
      storeId: parsed?.storeId ?? 0,
      pricesIncludeTax: parsed?.pricesIncludeTax ?? false,
      hasCredential: Boolean(parsed?.accessTokenEncrypted),
      lastTestedAt: source.lastRunAt?.toISOString() ?? null,
      status: source.isActive ? source.lastRunStatus : 'DISCONNECTED',
      error: source.syncError,
    }
  }

  try {
    const env = envMagentoConfig(companyId)
    if (env) {
      return {
        configured: true,
        ready: true,
        source: 'environment',
        baseUrl: env.baseUrl,
        currency: env.currency,
        storeCode: env.storeCode,
        storeId: env.storeId,
        pricesIncludeTax: env.pricesIncludeTax,
        hasCredential: true,
        lastTestedAt: null,
        status: 'ENVIRONMENT',
        error: null,
      }
    }
  } catch (error) {
    return {
      configured: true,
      ready: false,
      source: 'environment',
      baseUrl: '',
      currency: 'EUR',
      storeCode: 'all',
      storeId: 0,
      pricesIncludeTax: false,
      hasCredential: Boolean(process.env.MAGENTO_ACCESS_TOKEN),
      lastTestedAt: null,
      status: 'ERROR',
      error: error instanceof Error ? error.message : 'Magento omgevingsconfiguratie is ongeldig.',
    }
  }

  return {
    configured: false,
    ready: false,
    source: 'none',
    baseUrl: '',
    currency: 'EUR',
    storeCode: 'all',
    storeId: 0,
    pricesIncludeTax: false,
    hasCredential: false,
    lastTestedAt: null,
    status: 'NOT_CONFIGURED',
    error: null,
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
  const config = await getMagentoPricingConfig(companyId)
  if (!config) throw new Error('Magento writeback is nog niet geconfigureerd.')
  const cleanSku = sku.trim()
  if (!cleanSku) throw new Error('SKU ontbreekt voor Magento writeback.')
  const result = await request(config, 'products/base-prices-information', { body: { skus: [cleanSku] } })
  if (!Array.isArray(result)) throw new Error('Magento gaf geen geldige base price lijst terug.')
  const prices = result as MagentoBasePrice[]
  const match = prices.find((item) => item.sku === cleanSku && Number(item.store_id ?? 0) === config.storeId)
    ?? prices.find((item) => item.sku === cleanSku)
  const value = Number(match?.price)
  if (!Number.isFinite(value) || value < 0) throw new Error(`Geen geldige Magento base price gevonden voor SKU ${cleanSku}.`)
  return { price: value, storeId: Number(match?.store_id ?? config.storeId), sku: cleanSku, pricesIncludeTax: config.pricesIncludeTax, currency: config.currency }
}

export async function writeMagentoBasePrice(sku: string, price: number, companyId: string) {
  const config = await getMagentoPricingConfig(companyId)
  if (!config) throw new Error('Magento writeback is nog niet geconfigureerd.')
  const cleanSku = sku.trim()
  if (!cleanSku) throw new Error('SKU ontbreekt voor Magento writeback.')
  if (!Number.isFinite(price) || price < 0) throw new Error('Nieuwe Magento prijs is ongeldig.')
  await request(config, 'products/base-prices', {
    body: {
      prices: [{ price: Math.round(price * 100) / 100, store_id: config.storeId, sku: cleanSku }],
    },
  })
  return readMagentoBasePrice(cleanSku, companyId)
}
