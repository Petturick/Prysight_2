const DIRECT_SUPABASE_HOST = /^db\.([a-z0-9]+)\.supabase\.co$/i
const SUPABASE_POOLER_HOST = /\.pooler\.supabase\.com$/i

const DEFAULT_SUPABASE_PROJECT_ID = 'xmedaatjwxkmwkjmwuuz'
const DEFAULT_SUPABASE_REGION = 'eu-west-2'
const DEFAULT_SUPAVISOR_PORT = '5432'

export type DatabaseConnectionInfo = {
  connectionString: string
  configured: boolean
  mode: 'missing' | 'direct' | 'supavisor' | 'custom'
  host: string | null
}

function normalizePoolerPort(value: string) {
  return value.trim() === '6543' ? '6543' : DEFAULT_SUPAVISOR_PORT
}

function enforceSupabasePoolerTls(url: URL) {
  if (!SUPABASE_POOLER_HOST.test(url.hostname)) return

  const sslMode = (url.searchParams.get('sslmode') ?? '').toLowerCase()
  if (!sslMode) url.searchParams.set('sslmode', 'require')

  const effectiveMode = sslMode || 'require'
  if (effectiveMode === 'require') {
    url.searchParams.set('uselibpqcompat', 'true')
  }
}

function buildSupavisorConnection(projectId: string, password: string, region: string, poolerPort: string): DatabaseConnectionInfo {
  const username = encodeURIComponent(`postgres.${projectId}`)
  const encodedPassword = encodeURIComponent(password)
  const host = `aws-0-${region}.pooler.supabase.com`
  const port = normalizePoolerPort(poolerPort)
  const params = new URLSearchParams({ sslmode: 'require', uselibpqcompat: 'true' })
  if (port === '6543') params.set('pgbouncer', 'true')
  const connectionString = `postgresql://${username}:${encodedPassword}@${host}:${port}/postgres?${params.toString()}`
  return { connectionString, configured: true, mode: 'supavisor', host }
}

/**
 * PricingTool uses Supabase Supavisor because Bolt hosting may not have IPv6
 * access to the direct db.<project>.supabase.co hostname. Session pooling on
 * port 5432 is the most compatible default for Prisma + node-postgres. Set
 * PRICING_DB_POOLER_PORT=6543 only when transaction pooling is explicitly
 * required. Bolt-safe PRICING_DB_* names take precedence over legacy names.
 *
 * node-postgres does not use libpq SSL semantics by default. For Supabase
 * pooler URLs using sslmode=require we explicitly enable uselibpqcompat so
 * require means encrypted transport without unexpectedly switching to full
 * CA verification. This prevents the Prisma/pg TLS regression that previously
 * made production unreachable while preserving encrypted database traffic.
 */
export function resolveDatabaseConnection(
  rawConnectionString = process.env.DATABASE_URL ?? '',
  region = process.env.PRICING_DB_REGION ?? process.env.SUPABASE_DB_REGION ?? DEFAULT_SUPABASE_REGION,
  projectId = process.env.PRICING_DB_PROJECT_ID ?? process.env.SUPABASE_PROJECT_ID ?? DEFAULT_SUPABASE_PROJECT_ID,
  dbPassword = process.env.PRICING_DB_PASSWORD ?? process.env.SUPABASE_DB_PASSWORD ?? '',
  poolerPort = process.env.PRICING_DB_POOLER_PORT ?? process.env.SUPABASE_DB_POOLER_PORT ?? DEFAULT_SUPAVISOR_PORT,
): DatabaseConnectionInfo {
  const cleanProjectId = projectId.trim()
  const cleanPassword = dbPassword.trim()
  const cleanRegion = region.trim() || DEFAULT_SUPABASE_REGION
  if (cleanProjectId && cleanPassword) {
    return buildSupavisorConnection(cleanProjectId, cleanPassword, cleanRegion, poolerPort)
  }

  const value = rawConnectionString.trim()
  if (!value) return { connectionString: '', configured: false, mode: 'missing', host: null }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { connectionString: value, configured: true, mode: 'custom', host: null }
  }

  const directMatch = url.hostname.match(DIRECT_SUPABASE_HOST)
  if (!directMatch) {
    if (SUPABASE_POOLER_HOST.test(url.hostname)) {
      enforceSupabasePoolerTls(url)
      return {
        connectionString: url.toString(),
        configured: true,
        mode: 'supavisor',
        host: url.hostname,
      }
    }

    return {
      connectionString: value,
      configured: true,
      mode: 'custom',
      host: url.hostname,
    }
  }

  const projectRef = directMatch[1]
  const baseUsername = decodeURIComponent(url.username).split('.')[0] || 'postgres'
  const port = normalizePoolerPort(poolerPort)
  url.hostname = `aws-0-${cleanRegion}.pooler.supabase.com`
  url.port = port
  url.username = `${baseUsername}.${projectRef}`
  url.searchParams.set('sslmode', 'require')
  url.searchParams.set('uselibpqcompat', 'true')
  if (port === '6543') url.searchParams.set('pgbouncer', 'true')
  else url.searchParams.delete('pgbouncer')
  url.searchParams.delete('connection_limit')
  url.searchParams.delete('connect_timeout')
  url.searchParams.delete('pool_timeout')

  return { connectionString: url.toString(), configured: true, mode: 'supavisor', host: url.hostname }
}

export function getSafeDatabaseStatus() {
  const resolved = resolveDatabaseConnection()
  let port: string | null = null
  try {
    port = resolved.connectionString ? new URL(resolved.connectionString).port || null : null
  } catch {
    port = null
  }
  return { configured: resolved.configured, mode: resolved.mode, host: resolved.host, port }
}
