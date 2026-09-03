type ProfileMeta = Record<string, string | number | boolean | null | undefined>
const DEFAULT_BUDGET_MS = 450
export async function profileStep<T>(route: string, step: string, work: () => Promise<T>, meta: ProfileMeta = {}, budgetMs = DEFAULT_BUDGET_MS): Promise<T> {
  const startedAt = performance.now()
  try { return await work() } finally {
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10
    const payload = { type: 'prysight_performance', route, step, durationMs, budgetMs, slow: durationMs > budgetMs, ...meta }
    if (durationMs > budgetMs) console.warn(JSON.stringify(payload))
    else if (process.env.PRYSIGHT_PERFORMANCE_LOG === '1') console.info(JSON.stringify(payload))
  }
}
