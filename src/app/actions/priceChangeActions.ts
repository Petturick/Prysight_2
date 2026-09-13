'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/authz'
import {
  applyApprovedPriceChange,
  approvePriceChangeRequest,
  createPriceChangeRequest,
  rejectPriceChangeRequest,
  rollbackAppliedPriceChange,
} from '@/lib/price-change-workflow'

function optionalNumber(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = Number(raw.replace(',', '.'))
  if (!Number.isFinite(parsed)) throw new Error('Vul een geldige prijs in.')
  return parsed
}

function requiredText(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim()
  if (!value) throw new Error(`${key} ontbreekt.`)
  return value
}

function refreshPricingViews() {
  revalidatePath('/prijswijzigingen')
  revalidatePath('/prijsstrategie')
  revalidatePath('/acties')
  revalidatePath('/dashboard')
}

export async function createPriceChangeRequestAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const productId = requiredText(formData, 'productId')
  const countryId = String(formData.get('countryId') ?? '').trim() || null
  const recommendedPrice = optionalNumber(formData.get('recommendedPrice'))
  if (recommendedPrice === null) throw new Error('Prijsadvies ontbreekt.')
  const reason = String(formData.get('reason') ?? '').trim() || null
  await createPriceChangeRequest({ companyId: actor.companyId, userId: actor.id, productId, countryId, recommendedPrice, reason })
  refreshPricingViews()
}

export async function approvePriceChangeRequestAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const requestId = requiredText(formData, 'requestId')
  await approvePriceChangeRequest({ companyId: actor.companyId, userId: actor.id, requestId, approvedPrice: optionalNumber(formData.get('approvedPrice')) })
  refreshPricingViews()
}

export async function rejectPriceChangeRequestAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const requestId = requiredText(formData, 'requestId')
  const reason = String(formData.get('reason') ?? '').trim() || null
  await rejectPriceChangeRequest({ companyId: actor.companyId, userId: actor.id, requestId, reason })
  refreshPricingViews()
}

export async function applyApprovedPriceChangeAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const requestId = requiredText(formData, 'requestId')
  await applyApprovedPriceChange({ companyId: actor.companyId, userId: actor.id, requestId })
  refreshPricingViews()
}

export async function rollbackAppliedPriceChangeAction(formData: FormData) {
  const actor = await requirePermission('pricing.manage')
  const requestId = requiredText(formData, 'requestId')
  await rollbackAppliedPriceChange({ companyId: actor.companyId, userId: actor.id, requestId })
  refreshPricingViews()
}
