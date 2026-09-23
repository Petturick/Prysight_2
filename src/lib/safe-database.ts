export type DatabaseResult<T> = {
  data: T
  available: boolean
}

const TRANSIENT_ERROR_CODES = new Set([
  'P1001', 'P1002', 'P1017', 'P2024',
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
  '08000', '08001', '08003', '08006', '08007', '08P01', '53300', '57P03',
])

/** Only retry connection and capacity failures. Never retry permission or data errors. */
export function isTransientDatabaseError(error: unknown): boolean {
  const seen = new Set<unknown>()
  let current = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const value = current as { code?: unknown; message?: unknown; cause?: unknown }
    if (typeof value.code === 'string' && TRANSIENT_ERROR_CODES.has(value.code.toUpperCase())) return true
    if (typeof value.message === 'string' && /connection (?:terminated|closed|refused|reset|timed out)|server closed the connection|remaining connection slots|too many (?:clients|connections)|(?:pool|connection|query) timeout|can't reach database server|cannot reach database server/i.test(value.message)) return true
    current = value.cause
  }
  return false
}

/** Retry short-lived database outages without repeating writes or masking permanent errors. */
export async function retryTransientDatabaseRead<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (!isTransientDatabaseError(error)) throw error
    await new Promise<void>((resolve) => setTimeout(resolve, 180))
    return read()
  }
}

export async function safeDatabaseQuery<T>(query: () => Promise<T>, fallback: T): Promise<DatabaseResult<T>> {
  try {
    return { data: await retryTransientDatabaseRead(query), available: true }
  } catch (error) {
    console.error('Database read failed after retry or non-transient error', error)
    return { data: fallback, available: false }
  }
}
