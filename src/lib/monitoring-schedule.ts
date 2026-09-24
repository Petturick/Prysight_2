const FAILURE_BACKOFF_MINUTES = [15, 30, 60, 120, 240, 360] as const

export function failureBackoffMinutes(consecutiveFailures: number) {
  const failures = Math.max(1, Math.floor(consecutiveFailures))
  return FAILURE_BACKOFF_MINUTES[Math.min(failures - 1, FAILURE_BACKOFF_MINUTES.length - 1)]
}

export function nextFailureCheckAt(checkedAt: Date, consecutiveFailures: number) {
  return new Date(checkedAt.getTime() + failureBackoffMinutes(consecutiveFailures) * 60 * 1000)
}

export function nextSuccessfulCheckAt(checkedAt: Date, frequencyHours: number) {
  const hours = Number.isFinite(frequencyHours) ? Math.min(Math.max(frequencyHours, 1), 24 * 30) : 24
  return new Date(checkedAt.getTime() + hours * 60 * 60 * 1000)
}

export function monitoringLockUntil(startedAt: Date, minutes = 5) {
  const safeMinutes = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 1), 30) : 5
  return new Date(startedAt.getTime() + safeMinutes * 60 * 1000)
}
