import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'

const RESET_WINDOW_MS = 30 * 60 * 1000

type ResetPayload = {
  email: string
  expiresAt: number
  passwordVersion: string
}

function getResetSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET of NEXTAUTH_SECRET ontbreekt.')
  return secret
}

function passwordVersion(passwordHash: string) {
  return createHash('sha256').update(passwordHash).digest('base64url').slice(0, 24)
}

function sign(payload: string) {
  return createHmac('sha256', getResetSecret()).update(payload).digest('base64url')
}

export function createPasswordResetToken(email: string, currentPasswordHash: string) {
  const payload: ResetPayload = {
    email: email.trim().toLowerCase(),
    expiresAt: Date.now() + RESET_WINDOW_MS,
    passwordVersion: passwordVersion(currentPasswordHash),
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  return `${encodedPayload}.${sign(encodedPayload)}`
}

export async function verifyPasswordResetToken(token: string) {
  const [encodedPayload, providedSignature] = token.split('.')
  if (!encodedPayload || !providedSignature) return null

  const expectedSignature = sign(encodedPayload)
  const expectedBuffer = Buffer.from(expectedSignature)
  const providedBuffer = Buffer.from(providedSignature)
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) return null

  let payload: ResetPayload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as ResetPayload
  } catch {
    return null
  }

  if (!payload.email || !payload.expiresAt || payload.expiresAt < Date.now() || !payload.passwordVersion) return null

  const user = await prisma.user.findUnique({
    where: { email: payload.email.trim().toLowerCase() },
    include: {
      memberships: {
        where: { isActive: true, company: { status: 'ACTIVE' } },
        take: 1,
      },
    },
  })

  if (!user || user.memberships.length === 0) return null
  if (passwordVersion(user.passwordHash) !== payload.passwordVersion) return null

  return user
}
