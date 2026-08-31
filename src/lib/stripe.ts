import 'server-only'
import Stripe from 'stripe'

export type StripeMode = 'test' | 'live'

let stripeClient: Stripe | null = null

export function getStripeMode(): StripeMode {
  const mode = process.env.STRIPE_MODE
  if (mode !== 'test' && mode !== 'live') {
    throw new Error('STRIPE_MODE moet expliciet test of live zijn.')
  }
  return mode
}

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY ontbreekt.')

  const mode = getStripeMode()
  const keyMode = secretKey.includes('_live_') ? 'live' : secretKey.includes('_test_') ? 'test' : null
  if (!keyMode || keyMode !== mode) {
    throw new Error('STRIPE_SECRET_KEY komt niet overeen met STRIPE_MODE.')
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: '2026-07-29.dahlia',
    appInfo: { name: 'Prysight', version: '0.1.0' },
  })
  return stripeClient
}

export function getStripeAccountId(): string {
  const accountId = process.env.STRIPE_ACCOUNT_ID
  if (!accountId) throw new Error('STRIPE_ACCOUNT_ID ontbreekt.')
  return accountId
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET ontbreekt.')
  return secret
}
