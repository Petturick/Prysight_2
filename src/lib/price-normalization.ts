import { Prisma } from '@/generated/prisma/client'

const vatMap: Record<string, string> = {
  NL: '21',
  BE: '21',
  FR: '20',
  DE: '19',
  PT: '23',
  GB: '20',
  ES: '21',
  DK: '25',
}

const currencyToEur: Record<string, number> = {
  EUR: 1,
  GBP: 1.17,
  DKK: 0.134,
}

function toDecimal(value: Prisma.Decimal | number | string) {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value)
}

function convertCurrency(amount: Prisma.Decimal, fromCurrency: string, toCurrency: string) {
  const fromRate = currencyToEur[fromCurrency] ?? 1
  const toRate = currencyToEur[toCurrency] ?? 1
  return amount.mul(fromRate).div(toRate)
}

export function getVatRate(countryCode: string) {
  return new Prisma.Decimal(vatMap[countryCode] ?? '21')
}

export function normalizePrice(
  price: Prisma.Decimal | number | string,
  vatIncluded: boolean,
  vatRate: Prisma.Decimal | number | string,
  currency: string,
  packagingUnit: string | null | undefined,
  packagingQty: number | null | undefined,
  targetVatIncluded = true,
  targetCurrency = 'EUR',
) {
  const amount = toDecimal(price)
  const rate = toDecimal(vatRate)
  const quantity = packagingQty && packagingQty > 0 ? new Prisma.Decimal(packagingQty) : new Prisma.Decimal(1)
  const withoutVat = vatIncluded ? amount.div(rate.div(100).add(1)) : amount
  const vatAdjusted = targetVatIncluded ? withoutVat.mul(rate.div(100).add(1)) : withoutVat
  const currencyAdjusted = convertCurrency(vatAdjusted, currency, targetCurrency)
  const normalized = currencyAdjusted.div(quantity)

  return {
    amount: normalized,
    packagingUnit: packagingUnit ?? 'stuks',
    packagingQty: quantity.toNumber(),
    currency: targetCurrency,
    vatIncluded: targetVatIncluded,
  }
}

export function calculatePriceDifference(ownPrice: Prisma.Decimal | number | string | null | undefined, competitorPrice: Prisma.Decimal | number | string | null | undefined) {
  if (ownPrice === null || ownPrice === undefined || competitorPrice === null || competitorPrice === undefined) {
    return { diff: null, pctDiff: null, position: 'GEEN_DATA' as const }
  }

  const own = toDecimal(ownPrice)
  const competitor = toDecimal(competitorPrice)
  const diff = own.sub(competitor)
  const pctDiff = competitor.eq(0) ? null : diff.div(competitor).mul(100)

  let position: 'LAAGSTE' | 'DUURDER' | 'GELIJK' = 'GELIJK'
  if (own.lt(competitor)) position = 'LAAGSTE'
  if (own.gt(competitor)) position = 'DUURDER'

  return {
    diff,
    pctDiff,
    position,
  }
}
