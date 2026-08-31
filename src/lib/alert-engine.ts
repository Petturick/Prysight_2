import { AlertSeverity, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

async function createAlertOnce({ type, productId, competitorOfferId, title, message, severity }: { type: string; productId?: string | null; competitorOfferId?: string | null; title: string; message: string; severity: AlertSeverity }) {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000)
  const existing = await prisma.alert.findFirst({ where: { type, productId: productId ?? undefined, competitorOfferId: competitorOfferId ?? undefined, createdAt: { gte: since }, isRead: false } })
  if (existing) return existing

  const alert = await prisma.alert.create({ data: { type, productId: productId ?? null, competitorOfferId: competitorOfferId ?? null, title, message, severity } })
  const webhookUrl = process.env.ALERT_WEBHOOK_URL
  if (webhookUrl) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      await fetch(webhookUrl, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, title, message, severity, productId, competitorOfferId, createdAt: alert.createdAt }) })
    } catch (error) {
      console.error('Alert webhook failed', error)
    } finally {
      clearTimeout(timer)
    }
  }
  return alert
}

export async function evaluateMonitoringAlerts({ competitorOfferId, competitorId, countryId, productId, productGroupId, competitorName, productName, previousPrice, currentPrice, ownPrice, previousStockStatus, currentStockStatus }: { competitorOfferId: string; competitorId: string; countryId: string; productId?: string | null; productGroupId?: string | null; competitorName: string; productName: string; previousPrice: Prisma.Decimal | number | string | null | undefined; currentPrice: Prisma.Decimal | number | string | null | undefined; ownPrice: Prisma.Decimal | number | string | null | undefined; previousStockStatus?: string | null; currentStockStatus?: string | null }) {
  const previous = toNumber(previousPrice)
  const current = toNumber(currentPrice)
  const own = toNumber(ownPrice)
  const rules = await prisma.alertRule.findMany({ where: { isActive: true } })
  const applicableRules = rules.filter((rule) => (!rule.countryId || rule.countryId === countryId) && (!rule.productGroupId || rule.productGroupId === productGroupId) && (!rule.competitorId || rule.competitorId === competitorId))
  const movementThreshold = toNumber(applicableRules.find((rule) => rule.type === 'PRICE_MOVEMENT')?.threshold) ?? 3

  if (previous && current && previous > 0 && previous !== current) {
    const changePct = ((current - previous) / previous) * 100
    if (Math.abs(changePct) >= movementThreshold) {
      const isDrop = changePct < 0
      await createAlertOnce({ type: isDrop ? 'COMPETITOR_PRICE_DROP' : 'COMPETITOR_PRICE_RISE', productId, competitorOfferId, title: isDrop ? 'Concurrent verlaagt prijs' : 'Concurrent verhoogt prijs', message: `${competitorName} wijzigde ${productName} met ${Math.abs(changePct).toFixed(1)}%.`, severity: isDrop ? AlertSeverity.WARNING : AlertSeverity.INFO })
    }
  }

  if (own && current && current > 0) {
    const priceIndex = (own / current) * 100
    const maxIndex = toNumber(applicableRules.find((rule) => rule.type === 'PRICE_INDEX')?.threshold) ?? 105
    if (priceIndex >= maxIndex) await createAlertOnce({ type: 'PRICE_GAP', productId, competitorOfferId, title: 'Eigen prijs ligt boven de markt', message: `${productName} staat ${Math.abs(priceIndex - 100).toFixed(1)}% boven ${competitorName}.`, severity: priceIndex >= maxIndex + 5 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING })

    const opportunityThreshold = toNumber(applicableRules.find((rule) => rule.type === 'PRICE_OPPORTUNITY')?.threshold) ?? 108
    const competitorIndex = (current / own) * 100
    if (competitorIndex >= opportunityThreshold) await createAlertOnce({ type: 'PRICE_OPPORTUNITY', productId, competitorOfferId, title: 'Mogelijke ruimte voor prijsverhoging', message: `${competitorName} ligt ${Math.abs(competitorIndex - 100).toFixed(1)}% boven de eigen prijs van ${productName}.`, severity: AlertSeverity.INFO })
  }

  if (previousStockStatus && currentStockStatus && previousStockStatus !== currentStockStatus) await createAlertOnce({ type: 'STOCK_CHANGE', productId, competitorOfferId, title: 'Voorraadstatus concurrent gewijzigd', message: `${competitorName} wijzigde de voorraadstatus van ${productName} van ${previousStockStatus} naar ${currentStockStatus}.`, severity: AlertSeverity.INFO })
}
