import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { resolveDatabaseConnection } from '@/lib/database-url'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('Database is not configured. Add PRICING_DB_PASSWORD with PRICING_DB_PROJECT_ID, or DATABASE_URL, to the runtime environment.')
    this.name = 'DatabaseNotConfiguredError'
  }
}

function createUnavailableClient(): PrismaClient {
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      if (property === '$disconnect') return async () => undefined
      if (property === '$connect') {
        return async () => {
          throw new DatabaseNotConfiguredError()
        }
      }
      if (property === Symbol.toStringTag) return 'PrismaClient'
      throw new DatabaseNotConfiguredError()
    },
  })
}

function createPrismaClient() {
  const { connectionString, configured } = resolveDatabaseConnection()
  if (!configured) return createUnavailableClient()

  const adapter = new PrismaPg({
    connectionString,
    max: 3,
    connectionTimeoutMillis: 4_000,
    idleTimeoutMillis: 10_000,
    maxLifetimeSeconds: 300,
  })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

// Reuse one pool in warm runtimes as well as local development. This avoids
// creating a fresh PostgreSQL pool during ordinary server navigations.
globalForPrisma.prisma = prisma
