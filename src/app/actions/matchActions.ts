'use server'

import { MatchStatus } from '@/generated/prisma/client'
import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { runDuePriceChecks } from '@/lib/price-monitoring'
import { matchActionSchema } from '@/lib/validators'
import { revalidatePath } from 'next/cache'

async function updateMatchStatus(payload: unknown) {
  const actor = await requirePermission('competitors.write')
  const parsed = matchActionSchema.parse(payload)
  const previous = await prisma.productMatch.findFirstOrThrow({ where: { id: parsed.matchId, companyId: actor.companyId }, select: { id: true, productId: true, competitorOfferId: true, matchStatus: true } })
  const updated = await prisma.productMatch.update({
    where: { id: parsed.matchId, companyId: actor.companyId },
    data: {
      matchStatus: parsed.nextStatus,
      approvedBy: parsed.nextStatus === MatchStatus.CERTAIN ? actor.id : null,
      approvedAt: parsed.nextStatus === MatchStatus.CERTAIN ? new Date() : null,
    },
  })

  await createAuditLog({
    companyId: actor.companyId,
    userId: actor.id,
    action: 'MATCH_STATUS_UPDATED',
    entityType: 'ProductMatch',
    entityId: updated.id,
    oldValue: { matchStatus: previous.matchStatus },
    newValue: { matchStatus: updated.matchStatus },
  })

  revalidatePath('/productmatches')
  revalidatePath('/dashboard')
  revalidatePath('/producten')
  revalidatePath(`/producten/${previous.productId}`)
  return { actor, previous, updated }
}

export async function approveMatchAction(matchId: string) {
  const result = await updateMatchStatus({ matchId, nextStatus: MatchStatus.CERTAIN })
  try {
    await runDuePriceChecks({ companyId: result.actor.companyId, competitorOfferId: result.previous.competitorOfferId, limit: 1, force: true })
  } catch (error) {
    console.error('Approved competitor source could not be measured immediately', { matchId, error })
  }
  revalidatePath(`/producten/${result.previous.productId}`)
}

export async function rejectMatchAction(matchId: string) {
  await updateMatchStatus({ matchId, nextStatus: MatchStatus.UNRELIABLE })
}

export async function setReviewMatchAction(matchId: string) {
  await updateMatchStatus({ matchId, nextStatus: MatchStatus.REVIEW })
}
