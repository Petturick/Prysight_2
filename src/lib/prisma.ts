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

  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
