import { cookies } from 'next/headers'
import { Prisma } from '@/generated/prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

const ACTIVE_COMPANY_COOKIE = 'prysight_active_company'

type AuditInput = {
  companyId?: string
  userId: string
  action: string
  entityType: string
  entityId: string
  oldValue?: Prisma.InputJsonValue | null
  newValue?: Prisma.InputJsonValue | null
  ipAddress?: string
}

function embeddedCompanyId(value: Prisma.InputJsonValue | null | undefined) {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null
  const companyId = (value as Record<string, unknown>).companyId
  return typeof companyId === 'string' && companyId.trim() ? companyId.trim() : null
}

async function resolveAuditCompanyId(input: AuditInput) {
  const explicit = input.companyId?.trim()
  if (explicit) return explicit

  const embedded = embeddedCompanyId(input.newValue) ?? embeddedCompanyId(input.oldValue)
  if (embedded) return embedded

  try {
    const cookieStore = await cookies()
    const requestedCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value?.trim()
    if (requestedCompanyId) {
      const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { isSuperAdmin: true } })
      if (user?.isSuperAdmin) {
        const company = await prisma.company.findFirst({ where: { id: requestedCompanyId, status: 'ACTIVE' }, select: { id: true } })
        if (company) return company.id
      }
      const membership = await prisma.companyMembership.findFirst({
        where: { companyId: requestedCompanyId, userId: input.userId, isActive: true, company: { status: 'ACTIVE' } },
        select: { companyId: true },
      })
      if (membership) return membership.companyId
    }
  } catch {
    // Geen requestcontext, bijvoorbeeld bij een achtergrondproces. Dan is expliciete companyId vereist of gebruiken we de sessie/fallback hieronder.
  }

  try {
    const session = await auth()
    if (session?.user?.id === input.userId && session.user.companyId) return session.user.companyId
  } catch {
    // Geen sessiecontext beschikbaar.
  }

  const memberships = await prisma.companyMembership.findMany({
    where: { userId: input.userId, isActive: true, company: { status: 'ACTIVE' } },
    select: { companyId: true },
    take: 2,
  })
  if (memberships.length === 1) return memberships[0].companyId

  throw new Error('Auditlog kan de actieve organisatie niet eenduidig bepalen. Geef companyId expliciet mee.')
}

export async function getSystemUser() {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@engels.nl' } })
  if (existing) return existing
  return prisma.user.findFirstOrThrow({ orderBy: { createdAt: 'asc' } })
}

export async function createAuditLog(input: AuditInput) {
  const companyId = await resolveAuditCompanyId(input)
  await prisma.auditLog.create({
    data: {
      companyId,
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
