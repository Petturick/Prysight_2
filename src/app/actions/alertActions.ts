'use server'

import { createAuditLog } from '@/lib/audit'
import { requirePermission } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function markAlertReadAction(alertId: string) {
  const actor = await requirePermission('alerts.manage')
  const alert = await prisma.alert.update({ where: { id: alertId, companyId: actor.companyId }, data: { isRead: true } })
  await createAuditLog({ userId: actor.id, action: 'ALERT_MARKED_READ', entityType: 'Alert', entityId: alert.id, newValue: { isRead: true } })
  revalidatePath('/waarschuwingen')
  revalidatePath('/dashboard')
}
