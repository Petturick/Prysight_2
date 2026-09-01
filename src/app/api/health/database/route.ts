import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSafeDatabaseStatus } from '@/lib/database-url'

export const dynamic = 'force-dynamic'

function classifyDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('password authentication failed') || message.includes('authentication failed')) return 'AUTHENTICATION'
  if (message.includes('timeout') || message.includes('timed out')) return 'TIMEOUT'
  if (message.includes('enotfound') || message.includes('getaddrinfo') || message.includes('dns')) return 'DNS'
  if (message.includes('connection') || message.includes('connect')) return 'CONNECTION'
  return 'QUERY'
}

export async function GET() {
  const startedAt = Date.now()
  const connection = getSafeDatabaseStatus()

  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({
      ok: true,
      latencyMs: Date.now() - startedAt,
      connection,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      latencyMs: Date.now() - startedAt,
      connection,
      errorType: classifyDatabaseError(error),
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
