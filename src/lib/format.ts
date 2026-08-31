import { Prisma } from '@/generated/prisma/client'

export function decimalToNumber(value: Prisma.Decimal | number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)
  return Number(value.toString())
}

export function formatCurrency(value: Prisma.Decimal | number | string | null | undefined, currency = 'EUR') {
  const numeric = decimalToNumber(value)
  if (numeric === null || Number.isNaN(numeric)) return '—'

  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric)
}

export function formatPercentage(value: number | null | undefined, fractionDigits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('nl-NL', {
    style: 'percent',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value / 100)
}

export function formatNumber(value: number | null | undefined, fractionDigits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatDate(value: Date | string | null | undefined, withTime = true) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('nl-NL', {
    dateStyle: 'medium',
    timeStyle: withTime ? 'short' : undefined,
  }).format(date)
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}
