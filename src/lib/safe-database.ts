export type DatabaseResult<T> = {
  data: T
  available: boolean
}

export async function safeDatabaseQuery<T>(query: () => Promise<T>, fallback: T): Promise<DatabaseResult<T>> {
  try {
    return { data: await query(), available: true }
  } catch (error) {
    console.error('Database query failed', error)
    return { data: fallback, available: false }
  }
}
