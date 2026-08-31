import { parse } from 'csv-parse/sync'
import { readSheet } from 'read-excel-file/node'

export type ParsedImportResult = {
  headers: string[]
  rows: Record<string, string>[]
  format: 'CSV' | 'XLSX'
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

function parseCsv(buffer: ArrayBuffer) {
  const records = parse(Buffer.from(buffer), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[]

  const headers = records.length > 0 ? Object.keys(records[0]) : []
  return {
    headers,
    rows: records.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeCell(value)]))),
  }
}

async function parseXlsx(buffer: ArrayBuffer) {
  const data = await readSheet(Buffer.from(new Uint8Array(buffer)))
  const [headerRow, ...bodyRows] = data
  const headers = (headerRow ?? []).map((value) => normalizeCell(value)).filter(Boolean)
  const rows = bodyRows
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, normalizeCell(row[index])])))
    .filter((row) => Object.values(row).some(Boolean))

  return { headers, rows }
}

export async function parseImportFile(name: string, buffer: ArrayBuffer): Promise<ParsedImportResult> {
  const format = name.toLowerCase().endsWith('.csv') ? 'CSV' : 'XLSX'
  const parsed = format === 'CSV' ? parseCsv(buffer) : await parseXlsx(buffer)
  return { ...parsed, format }
}
