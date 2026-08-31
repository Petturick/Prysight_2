export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSafeDatabaseStatus } from '@/lib/database-url'

type ConnectionFailureReason =
  | 'authentication_failed'
  | 'pooler_tenant_not_found'
  | 'dns_failed'
  | 'connection_refused'
  | 'connection_timeout'
  | 'tls_failed'
  | 'connection_failed'

function readErrorChain(error: unknown) {
  const messages: string[] = []
  const codes: string[] = []
  let current: unknown = error
  const seen = new Set<unknown>()

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const value = current as { message?: unknown; code?: unknown; cause?: unknown }
    if (typeof value.message === 'string') messages.push(value.message)
    if (typeof value.code === 'string') codes.push(value.code)
    current = value.cause
  }

  return {
    message: messages.join(' | ').toLowerCase(),
    code: codes.find(Boolean) ?? null,
  }
}

function classifyConnectionFailure(error: unknown): { reason: ConnectionFailureReason; errorCode: string | null } {
  const { message, code } = readErrorChain(error)

  if (code === '28P01' || message.includes('password authentication failed') || message.includes('authentication failed')) {
    return { reason: 'authentication_failed', errorCode: code }
  }

  if (message.includes('tenant or user not found') || message.includes('tenant not found')) {
    return { reason: 'pooler_tenant_not_found', errorCode: code }
  }

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || message.includes('getaddrinfo')) {
    return { reason: 'dns_failed', errorCode: code }
  }

  if (code === 'ECONNREFUSED' || message.includes('connection refused')) {
    return { reason: 'connection_refused', errorCode: code }
  }

  if (code === 'ETIMEDOUT' || message.includes('timeout') || message.includes('timed out')) {
    return { reason: 'connection_timeout', errorCode: code }
  }

  if (message.includes('certificate') || message.includes('tls') || message.includes('ssl')) {
    return { reason: 'tls_failed', errorCode: code }
  }

  return { reason: 'connection_failed', errorCode: code }
}

export async function GET() {
  const database = getSafeDatabaseStatus()

  if (!database.configured) {
    return NextResponse.json({
      status: 'ok',
      app: true,
      database: {
        ...database,
        reachable: false,
        reason: 'not_configured',
      },
    })
  }

  try {
    const { prisma } = await import('@/lib/prisma')
    await prisma.$queryRawUnsafe('SELECT 1')

    return NextResponse.json({
      status: 'ok',
      app: true,
      database: {
        ...database,
        reachable: true,
      },
    })
  } catch (error) {
    console.error('Database healthcheck failed', error)
    const failure = classifyConnectionFailure(error)

    return NextResponse.json({
      status: 'degraded',
      app: true,
      database: {
        ...database,
        reachable: false,
        ...failure,
      },
    })
  }
}
