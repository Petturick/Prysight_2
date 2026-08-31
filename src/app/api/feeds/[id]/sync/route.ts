export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { syncFeedSource } from '@/lib/feed-ingestion'

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  try {
    const result = await syncFeedSource(id)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Synchronisatie mislukt.' }, { status: 422 })
  }
}
