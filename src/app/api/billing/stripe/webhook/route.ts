import type Stripe from 'stripe'
import { BillingEnvironment, LicenseSource, LicenseStatus, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { getStripeClient, getStripeMode, getStripeWebhookSecret } from '@/lib/stripe'

export const runtime = 'nodejs'

const STRIPE_STATUS: Record<string, LicenseStatus> = {
  incomplete: LicenseStatus.INCOMPLETE,
  incomplete_expired: LicenseStatus.EXPIRED,
  trialing: LicenseStatus.TRIALING,
  active: LicenseStatus.ACTIVE,
  past_due: LicenseStatus.PAST_DUE,
  paused: LicenseStatus.PAUSED,
  canceled: LicenseStatus.CANCELED,
  unpaid: LicenseStatus.UNPAID,
}

function eventEnvironment(event: Stripe.Event) {
  return event.livemode ? BillingEnvironment.LIVE : BillingEnvironment.TEST
}

function timestamp(value: number | null | undefined) {
  return value ? new Date(value * 1000) : null
}

function objectId(event: Stripe.Event) {
  const object = event.data.object as { id?: string }
  return object.id ?? null
}

async function claimEvent(event: Stripe.Event) {
  try {
    await prisma.billingWebhookEvent.create({
      data: {
        stripeEventId: event.id,
        environment: eventEnvironment(event),
        eventType: event.type,
        payload: {
          id: event.id,
          type: event.type,
          livemode: event.livemode,
          created: event.created,
          objectId: objectId(event),
        },
      },
    })
    return 'PROCESS' as const
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.billingWebhookEvent.findUniqueOrThrow({ where: { stripeEventId: event.id } })
      if (existing.status === 'FAILED') {
        await prisma.billingWebhookEvent.update({
          where: { stripeEventId: event.id },
          data: { status: 'PENDING', errorMessage: null },
        })
        return 'PROCESS' as const
      }
      return existing.status === 'PENDING' ? 'IN_FLIGHT' as const : 'DUPLICATE' as const
    }
    throw error
  }
}

async function syncSubscription(subscription: Stripe.Subscription, event: Stripe.Event) {
  const item = subscription.items.data[0]
  const priceId = item?.price.id
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  if (!priceId || !customerId) return 'IGNORED'

  const [mapping, customer] = await Promise.all([
    prisma.stripePriceMapping.findUnique({ where: { stripePriceId: priceId } }),
    prisma.stripeCustomer.findUnique({ where: { stripeCustomerId: customerId } }),
  ])
  if (!mapping || !customer || mapping.environment !== eventEnvironment(event)) return 'IGNORED'

  const existingLicense = await prisma.companyLicense.findUnique({ where: { companyId: customer.companyId } })
  const eventCreatedAt = timestamp(event.created)
  if (existingLicense?.lastStripeEventAt && eventCreatedAt && existingLicense.lastStripeEventAt > eventCreatedAt) return 'IGNORED_STALE'

  await prisma.companyLicense.upsert({
    where: { companyId: customer.companyId },
    create: {
      companyId: customer.companyId,
      planId: mapping.planId,
      source: LicenseSource.STRIPE,
      status: STRIPE_STATUS[subscription.status] ?? LicenseStatus.INCOMPLETE,
      stripeEnvironment: eventEnvironment(event),
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodStart: timestamp(item?.current_period_start),
      currentPeriodEnd: timestamp(item?.current_period_end),
      trialEndsAt: timestamp(subscription.trial_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastStripeEventAt: eventCreatedAt,
    },
    update: {
      planId: mapping.planId,
      source: LicenseSource.STRIPE,
      status: STRIPE_STATUS[subscription.status] ?? LicenseStatus.INCOMPLETE,
      stripeEnvironment: eventEnvironment(event),
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      currentPeriodStart: timestamp(item?.current_period_start),
      currentPeriodEnd: timestamp(item?.current_period_end),
      trialEndsAt: timestamp(subscription.trial_end),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      lastStripeEventAt: eventCreatedAt,
    },
  })
  return 'PROCESSED'
}

async function processEvent(event: Stripe.Event) {
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    return syncSubscription(event.data.object as Stripe.Subscription, event)
  }
  return 'IGNORED'
}

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) return Response.json({ error: 'Stripe signature ontbreekt.' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = getStripeClient().webhooks.constructEvent(await request.text(), signature, getStripeWebhookSecret())
  } catch {
    return Response.json({ error: 'Ongeldige Stripe webhook.' }, { status: 400 })
  }

  const configuredLivemode = getStripeMode() === 'live'
  if (event.livemode !== configuredLivemode) {
    return Response.json({ error: 'Stripe omgeving komt niet overeen met de runtime.' }, { status: 400 })
  }

  const claim = await claimEvent(event)
  if (claim === 'DUPLICATE') return Response.json({ received: true, duplicate: true })
  if (claim === 'IN_FLIGHT') return Response.json({ error: 'Stripe webhook wordt al verwerkt.' }, { status: 409 })

  try {
    const status = await processEvent(event)
    await prisma.billingWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: { status, processedAt: new Date() },
    })
    return Response.json({ received: true, status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Onbekende webhookfout'
    await prisma.billingWebhookEvent.update({
      where: { stripeEventId: event.id },
      data: { status: 'FAILED', errorMessage: message },
    })
    return Response.json({ error: 'Stripe webhook kon niet worden verwerkt.' }, { status: 500 })
  }
}
