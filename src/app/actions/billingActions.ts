'use server'

import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/authz'
import { createCustomerPortalSession, createSubscriptionCheckout } from '@/lib/stripe-billing'

function appOrigin() {
  const raw = process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? process.env.URL
  if (!raw) throw new Error('De publieke Prysight URL ontbreekt.')
  return raw.replace(/\/$/, '')
}

export async function startSubscriptionCheckoutAction(formData: FormData) {
  const actor = await requirePermission('billing.manage')
  const stripePriceId = String(formData.get('stripePriceId') ?? '')
  if (!stripePriceId) throw new Error('Kies eerst een geldig plan.')
  const origin = appOrigin()
  const session = await createSubscriptionCheckout({ companyId: actor.companyId, stripePriceId, successUrl: `${origin}/instellingen/licentie?betaling=geslaagd`, cancelUrl: `${origin}/instellingen/licentie?betaling=geannuleerd` })
  if (!session.url) throw new Error('Stripe heeft geen checkout URL teruggegeven.')
  redirect(session.url)
}

export async function openBillingPortalAction() {
  const actor = await requirePermission('billing.manage')
  const session = await createCustomerPortalSession(actor.companyId, `${appOrigin()}/instellingen/licentie`)
  redirect(session.url)
}
