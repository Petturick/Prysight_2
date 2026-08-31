import 'server-only'
import { randomBytes } from 'node:crypto'
import { BillingEnvironment } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { getStripeAccountId, getStripeClient, getStripeMode } from '@/lib/stripe'

function integrationIdentifier() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  const suffix = Array.from(randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join('')
  return `prysight_checkout_${suffix}`
}

function billingEnvironment(): BillingEnvironment {
  return getStripeMode() === 'live' ? BillingEnvironment.LIVE : BillingEnvironment.TEST
}

async function getOrCreateStripeCustomer(companyId: string) {
  const environment = billingEnvironment()
  const existing = await prisma.stripeCustomer.findUnique({
    where: { companyId_environment: { companyId, environment } },
  })
  if (existing) return existing

  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
  const stripe = getStripeClient()
  const customer = await stripe.customers.create({
    name: company.name,
    email: company.billingEmail ?? undefined,
    metadata: { company_id: company.id, company_slug: company.slug },
  })

  return prisma.stripeCustomer.create({
    data: {
      companyId,
      environment,
      stripeAccountId: getStripeAccountId(),
      stripeCustomerId: customer.id,
    },
  })
}

export async function createSubscriptionCheckout(input: {
  companyId: string
  stripePriceId: string
  successUrl: string
  cancelUrl: string
}) {
  const environment = billingEnvironment()
  const mapping = await prisma.stripePriceMapping.findFirstOrThrow({
    where: { stripePriceId: input.stripePriceId, environment, isActive: true, plan: { isActive: true, isPublic: true } },
    include: { plan: true },
  })
  const customer = await getOrCreateStripeCustomer(input.companyId)

  return getStripeClient().checkout.sessions.create({
    mode: 'subscription',
    customer: customer.stripeCustomerId,
    client_reference_id: input.companyId,
    integration_identifier: integrationIdentifier(),
    line_items: [{ price: mapping.stripePriceId, quantity: 1 }],
    allow_promotion_codes: true,
    metadata: { company_id: input.companyId, plan_id: mapping.planId },
    subscription_data: { metadata: { company_id: input.companyId, plan_id: mapping.planId } },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
  })
}

export async function createCustomerPortalSession(companyId: string, returnUrl: string) {
  const customer = await getOrCreateStripeCustomer(companyId)
  return getStripeClient().billingPortal.sessions.create({
    customer: customer.stripeCustomerId,
    return_url: returnUrl,
  })
}
