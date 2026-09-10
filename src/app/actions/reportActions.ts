'use server'

import { Prisma, ReportStatus } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { getDashboardSnapshot } from '@/lib/dashboard'
import { decimalToNumber } from '@/lib/format'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

function startOfWeek(date: Date) {
  const copy = new Date(date)
  const day = copy.getDay() || 7
  copy.setDate(copy.getDate() - day + 1)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfWeek(date: Date) {
  const copy = startOfWeek(date)
  copy.setDate(copy.getDate() + 6)
  copy.setHours(23, 59, 59, 999)
  return copy
}

export async function buildWeeklyReportPayload(companyId: string) {
  const snapshot = await getDashboardSnapshot({}, companyId)
  return {
    samenvatting: snapshot.kpis,
    topStijgers: snapshot.biggestIncreases,
    topDalers: snapshot.biggestDecreases,
    mislukteControles: snapshot.failedChecks.map((check) => ({
      concurrent: check.competitorOffer.competitor.name,
      product: check.competitorOffer.productMatch?.product.name ?? 'Ongekoppeld',
      fout: check.errorMessage,
      tijd: check.checkedAt,
    })),
    verouderdeData: snapshot.staleOffers.map((offer) => ({
      concurrent: offer.competitor.name,
      product: offer.productMatch?.product.name ?? 'Ongekoppeld',
      laatstGecontroleerd: offer.lastCheckedAt,
      prijs: decimalToNumber(offer.normalizedPrice),
    })),
  }
}

export async function generateWeeklyReportAction() {
  const actor = await requirePermission('reports.read')
  const today = new Date()
  const weekStart = startOfWeek(today)
  const weekEnd = endOfWeek(today)
  const content = await buildWeeklyReportPayload(actor.companyId)

  const report = await prisma.report.create({
    data: {
      companyId: actor.companyId,
      title: `Weekrapport ${weekStart.toLocaleDateString('nl-NL')}`,
      weekStart,
      weekEnd,
      status: ReportStatus.GENERATED,
      content: content as Prisma.InputJsonValue,
      generatedAt: new Date(),
    },
  })

  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'REPORT_GENERATED',
    entityType: 'Report',
    entityId: report.id,
    newValue: { title: report.title },
  })

  revalidatePath('/rapportages')
  revalidatePath('/dashboard')
}
