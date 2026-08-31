import { Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

export async function getSystemUser() {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@engels.nl' } })
  if (existing) return existing
  return prisma.user.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
}

export async function createAuditLog(input: {
  userId: string
  action: string
  entityType: string
  entityId: string
  oldValue?: Prisma.InputJsonValue | null
  newValue?: Prisma.InputJsonValue | null
  ipAddress?: string
}) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValue: input.oldValue ?? Prisma.JsonNull,
      newValue: input.newValue ?? Prisma.JsonNull,
      ipAddress: input.ipAddress ?? '127.0.0.1',
    },
  })
}
