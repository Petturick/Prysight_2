export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FeedSourceType } from '@/generated/prisma/client'
import { ingestCanonicalProducts, type CanonicalFeedProduct } from '@/lib/feed-ingestion'
import { DEFAULT_COMPANY_ID } from '@/lib/company'

const SYNTRX_URL = process.env.SYNTRX_SUPABASE_URL ?? 'https://cieqifmizthutfvfgfny.supabase.co'
const SYNTRX_PUBLISHABLE_KEY = process.env.SYNTRX_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_TMhAYLP5vYiChEbZyhBcvw__tGpowal'
const ENGELS_ORGANIZATION_ID = process.env.SYNTRX_ENGELS_ORGANIZATION_ID ?? '4cd85d1b-f834-4e68-b26d-1eae649b4c1f'
const ALLOWED_ROLES = new Set(['admin', 'manager', 'import_manager'])

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, x-syntrx-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, { ...init, headers: { ...corsHeaders, ...(init?.headers ?? {}) } })
}

function getSyntrxAuthorization(request: Request) {
  const forwardedToken = request.headers.get('x-syntrx-access-token')?.trim()
  if (forwardedToken) return `Bearer ${forwardedToken}`

  const authorization = request.headers.get('authorization')?.trim() ?? ''
  return authorization.toLowerCase().startsWith('bearer ') ? authorization : ''
}

async function validateSyntrxSession(request: Request) {
  const authorization = getSyntrxAuthorization(request)
  if (!authorization) return { ok: false as const, status: 401, message: 'Syntrx sessie ontbreekt.' }

  const userResponse = await fetch(`${SYNTRX_URL}/auth/v1/user`, {
    headers: { apikey: SYNTRX_PUBLISHABLE_KEY, Authorization: authorization },
    signal: AbortSignal.timeout(10_000),
  })
  if (!userResponse.ok) return { ok: false as const, status: 401, message: 'Syntrx sessie is ongeldig of verlopen.' }
  const user = await userResponse.json() as { id?: string; email?: string }
  if (!user.id) return { ok: false as const, status: 401, message: 'Syntrx gebruiker kon niet worden vastgesteld.' }

  const commonHeaders = { apikey: SYNTRX_PUBLISHABLE_KEY, Authorization: authorization, Accept: 'application/json' }
  const membershipUrl = new URL(`${SYNTRX_URL}/rest/v1/organization_members`)
  membershipUrl.searchParams.set('select', 'organization_id,is_active,functional_role')
  membershipUrl.searchParams.set('user_id', `eq.${user.id}`)
  membershipUrl.searchParams.set('organization_id', `eq.${ENGELS_ORGANIZATION_ID}`)
  membershipUrl.searchParams.set('is_active', 'eq.true')
  const membershipResponse = await fetch(membershipUrl, { headers: commonHeaders, signal: AbortSignal.timeout(10_000) })
  const memberships = membershipResponse.ok ? await membershipResponse.json() as Array<{ functional_role?: string }> : []
  const roleAllowed = memberships.some((membership) => ALLOWED_ROLES.has(String(membership.functional_role ?? '').toLowerCase()))

  if (!roleAllowed) {
    const profileUrl = new URL(`${SYNTRX_URL}/rest/v1/user_profiles`)
    profileUrl.searchParams.set('select', 'is_super_admin')
    profileUrl.searchParams.set('id', `eq.${user.id}`)
    const profileResponse = await fetch(profileUrl, { headers: commonHeaders, signal: AbortSignal.timeout(10_000) })
    const profiles = profileResponse.ok ? await profileResponse.json() as Array<{ is_super_admin?: boolean }> : []
    if (!profiles.some((profile) => profile.is_super_admin === true)) return { ok: false as const, status: 403, message: 'Geen bevoegdheid om Syntrx producten te synchroniseren.' }
  }

  return { ok: true as const, user }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: Request) {
  const access = await validateSyntrxSession(request)
  if (!access.ok) return json({ error: access.message }, { status: access.status })

  const body = await request.json().catch(() => null) as { organizationId?: string; products?: CanonicalFeedProduct[]; sourceName?: string } | null
  if (!body?.products || !Array.isArray(body.products)) return json({ error: 'Products array ontbreekt.' }, { status: 400 })
  if (body.organizationId !== ENGELS_ORGANIZATION_ID) return json({ error: 'Alleen de actieve Engels Group organisatie kan naar PricingTool synchroniseren.' }, { status: 403 })
  if (body.products.length > 5000) return json({ error: 'Maximaal 5000 producten per synchronisatiebatch.' }, { status: 413 })

  const result = await ingestCanonicalProducts({
    companyId: DEFAULT_COMPANY_ID,
    sourceKey: `syntrx:cieqifmizthutfvfgfny:${ENGELS_ORGANIZATION_ID}`,
    sourceName: body.sourceName?.trim() || 'Syntrx PIM · Engels Group',
    sourceType: FeedSourceType.SYNTRX,
    products: body.products,
    config: { projectId: 'cieqifmizthutfvfgfny', organizationId: ENGELS_ORGANIZATION_ID, syncedBy: access.user.email ?? access.user.id },
  })

  return json(result)
}
