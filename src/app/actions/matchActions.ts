'use server'

import { MatchStatus } from '@/generated/prisma/client'
import { createAuditLog, getSystemUser } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { matchActionSchema } from '@/lib/validators'
import { revalidatePath } from 'next/cache'

async function updateMatchStatus(payload: unknown) {
  const parsed = matchActionSchema.parse(payload)
  const systemUser = await getSystemUser()
  const previous = await prisma.productMatch.findUniqueOrThrow({ where: { id: parsed.matchId } })
  const updated = await prisma.productMatch.update({
    where: { id: parsed.matchId },
    data: {
      matchStatus: parsed.nextStatus,
      approvedBy: parsed.nextStatus === MatchStatus.CERTAIN ? systemUser.id : null,
      approvedAt: parsed.nextStatus === MatchStatus.CERTAIN ? new Date() : null,
    },
  })

  await createAuditLog({
    userId: systemUser.id,
    action: 'MATCH_STATUS_UPDATED',
    entityType: 'ProductMatch',
    entityId: updated.id,
    oldValue: { matchStatus: previous.matchStatus },
    newValue: { matchStatus: updated.matchStatus },
  })

  revalidatePath('/productmatches')
  revalidatePath('/dashboard')
  revalidatePath('/producten')
}

export async function approveMatchAction(matchId: string) {
  await updateMatchStatus({ matchId, nextStatus: MatchStatus.CERTAIN })
}

export async function rejectMatchAction(matchId: string) {
  await updateMatchStatus({ matchId, nextStatus: MatchStatus.UNRELIABLE })
}

export async function setReviewMatchAction(matchId: string) {
  await updateMatchStatus({ matchId, nextStatus: MatchStatus.REVIEW })
}
