/** A successful fetch alone does not validate the product or refresh an old price. */
export type SourceVerificationStatus =
  | 'not-linked' | 'failed' | 'not-checked' | 'match-review'
  | 'stale' | 'verified' | 'unverified'

type SourcePriceCheck = {
  checkedAt: Date
  isSuccess: boolean
  foundPrice: unknown
  checkMethod: string
  sourceUrl: string
}

export type SourceVerificationInput = {
  linked: boolean
  matchStatus: string | null | undefined
  price: unknown
  url: string | null | undefined
  lastCheckedAt: Date | null | undefined
  check: SourcePriceCheck | null | undefined
}

function positiveAmount(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === '') return false
  const number = Number(value)
  return Number.isFinite(number) && number > 0
}

export function evaluateSourceVerification(
  input: SourceVerificationInput,
  now = Date.now(),
): { verified: boolean; status: SourceVerificationStatus } {
  if (!input.linked || !input.url) return { verified: false, status: 'not-linked' }
  const check = input.check
  if (check && !check.isSuccess) return { verified: false, status: 'failed' }
  if (!check) return { verified: false, status: 'not-checked' }
  if (input.matchStatus !== 'CERTAIN') return { verified: false, status: 'match-review' }
  if (!Number.isFinite(check.checkedAt.getTime()) || now - check.checkedAt.getTime() > 24 * 60 * 60 * 1000 ||
      check.checkedAt.getTime() > now + 60 * 1000) return { verified: false, status: 'stale' }

  const trusted = check.isSuccess &&
    check.checkMethod !== 'MANUAL' &&
    !check.checkMethod.endsWith('|REJECTED') &&
    check.sourceUrl === input.url &&
    positiveAmount(check.foundPrice) &&
    positiveAmount(input.price) &&
    input.lastCheckedAt?.getTime() === check.checkedAt.getTime()

  return { verified: trusted, status: trusted ? 'verified' : 'unverified' }
}
