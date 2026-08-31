'use server'

import { createAuditLog, getSystemUser } from '@/lib/audit'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function markAlertReadAction(alertId: string) {
  const systemUser = await getSystemUser()
  const alert = await prisma.alert.update({ where: { id: alertId }, data: { isRead: true } })
  await createAuditLog({
    userId: systemUser.id,
    action: 'ALERT_MARKED_READ',
    entityType: 'Alert',
    entityId: alert.id,
    newValue: { isRead: true },
  })
  revalidatePath('/waarschuwingen')
  revalidatePath('/dashboard')
}
