import { parse } from 'csv-parse/sync'
import { readSheet } from 'read-excel-file/node'

export type ParsedFeedFormat = 'CSV' | 'XLSX' | 'XLS' | 'JSON' | 'XML'

export type ParsedFeed = {
  headers: string[]
  rows: Record<string, string>[]
  format: ParsedFeedFormat
}

const MAX_FEED_BYTES = 15 * 1024 * 1024
const MAX_ROWS = 20_000

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).trim()
}

function normalizeRows(rows: Record<string, unknown>[]) {
  return rows
    .slice(0, MAX_ROWS)
    .map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim(), normalizeCell(value)])))
    .filter((row) => Object.values(row).some(Boolean))
}

function parseCsv(buffer: ArrayBuffer) {
  const rows = parse(Buffer.from(buffer), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[]
  const normalized = normalizeRows(rows)
  return { headers: normalized[0] ? Object.keys(normalized[0]) : [], rows: normalized }
}

async function parseExcel(buffer: ArrayBuffer) {
  const sheet = await readSheet(Buffer.from(new Uint8Array(buffer)))
  const [headerRow, ...bodyRows] = sheet
  const headers = (headerRow ?? []).map(normalizeCell).filter(Boolean)
  const rows = bodyRows
    .slice(0, MAX_ROWS)
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])])))
    .filter((row) => Object.values(row).some(Boolean))
  return { headers, rows }
}

function firstArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return null
  const object = value as Record<string, unknown>
  for (const preferred of ['products', 'items', 'data', 'rows', 'records']) {
    if (Array.isArray(object[preferred])) return object[preferred] as unknown[]
  }
  return Object.values(object).find(Array.isArray) as unknown[] | undefined ?? null
}

function parseJson(buffer: ArrayBuffer) {
  const parsed = JSON.parse(Buffer.from(buffer).toString('utf8')) as unknown
  const items = firstArray(parsed)
  if (!items) throw new Error('JSON-feed bevat geen productarray.')
  const rows = normalizeRows(items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item)))
  return { headers: rows[0] ? Object.keys(rows[0]) : [], rows }
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function parseXml(buffer: ArrayBuffer) {
  const xml = Buffer.from(buffer).toString('utf8').replace(/^\uFEFF/, '')
  const candidates = ['item', 'product', 'entry', 'record', 'row']
  let selected: string | null = null
  let blocks: string[] = []

  for (const tag of candidates) {
    const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi')
    const matches = [...xml.matchAll(regex)].map((match) => match[1])
    if (matches.length > blocks.length) {
      selected = tag
      blocks = matches
    }
  }

  if (!selected || blocks.length === 0) throw new Error('XML-feed bevat geen herkenbare productregels.')

  const rows = blocks.slice(0, MAX_ROWS).map((block) => {
    const row: Record<string, string> = {}
    const childRegex = /<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g
    for (const match of block.matchAll(childRegex)) {
      const key = match[1].replace(/^.*:/, '')
      if (!(key in row)) row[key] = decodeXml(match[2])
    }
    return row
  }).filter((row) => Object.keys(row).length > 0)

  return { headers: rows[0] ? Object.keys(rows[0]) : [], rows }
}

function detectFormat(name: string, contentType: string | null): ParsedFeedFormat {
  const value = name.toLowerCase()
  const type = (contentType ?? '').toLowerCase()
  if (value.includes('.xlsx') || type.includes('spreadsheetml')) return 'XLSX'
  if (value.includes('.xls') || type.includes('ms-excel')) return 'XLS'
  if (value.includes('.json') || type.includes('json')) return 'JSON'
  if (value.includes('.xml') || type.includes('xml')) return 'XML'
  return 'CSV'
}

export async function parseFeedBuffer(name: string, contentType: string | null, buffer: ArrayBuffer): Promise<ParsedFeed> {
  if (buffer.byteLength > MAX_FEED_BYTES) throw new Error('Feed is groter dan 15 MB.')
  const format = detectFormat(name, contentType)
  const parsed = format === 'CSV'
    ? parseCsv(buffer)
    : format === 'JSON'
      ? parseJson(buffer)
      : format === 'XML'
        ? parseXml(buffer)
        : await parseExcel(buffer)

  if (parsed.rows.length === 0) throw new Error('De feed bevat geen productregels.')
  return { ...parsed, format }
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local')) return true
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true
  const match = host.match(/^172\.(\d+)\./)
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd')) return true
  return false
}

export function validateFeedUrl(value: string) {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('De feed URL is ongeldig.') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Alleen HTTP en HTTPS feeds zijn toegestaan.')
  if (isPrivateHostname(url.hostname)) throw new Error('Lokale en private netwerkadressen zijn niet toegestaan als feedbron.')
  const searchable = `${url.pathname}${url.search}`.toLowerCase()
  if (searchable.includes('sitemap') || searchable.endsWith('/robots.txt')) throw new Error('Een sitemap of robots.txt is geen productfeed.')
  return url
}

export function normalizeGoogleDriveUrl(input: URL) {
  if (!['drive.google.com', 'docs.google.com'].includes(input.hostname.toLowerCase())) return input
  const fileMatch = input.pathname.match(/\/file\/d\/([^/]+)/)
  if (fileMatch) return new URL(`https://drive.google.com/uc?export=download&id=${fileMatch[1]}`)
  const sheetMatch = input.pathname.match(/\/spreadsheets\/d\/([^/]+)/)
  if (sheetMatch) return new URL(`https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/export?format=xlsx`)
  return input
}

export async function fetchAndParseFeed(value: string) {
  const requested = normalizeGoogleDriveUrl(validateFeedUrl(value))
  const response = await fetch(requested, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'PricingTool Feed Importer/1.0' },
  })
  if (!response.ok) throw new Error(`Feed ophalen mislukt met HTTP ${response.status}.`)
  validateFeedUrl(response.url)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_FEED_BYTES) throw new Error('Feed is groter dan 15 MB.')
  const buffer = await response.arrayBuffer()
  return parseFeedBuffer(response.url || requested.toString(), response.headers.get('content-type'), buffer)
}
