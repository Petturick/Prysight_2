export const MANUAL_CHECK_FREQUENCY_HOURS = 876000

const FAILURE_BACKOFF_MINUTES = [15, 30, 60, 120, 240, 360] as const

function normalizedFrequencyHours(value: number) {
  if (!Number.isFinite(value)) return 24
  return Math.max(1, Math.round(value))
}

export function isManualMonitoringFrequency(frequencyHours: number) {
  return normalizedFrequencyHours(frequencyHours) >= MANUAL_CHECK_FREQUENCY_HOURS
}

export function failureBackoffMinutes(consecutiveFailures: number) {
  const failures = Math.max(1, Math.floor(consecutiveFailures))
  return FAILURE_BACKOFF_MINUTES[Math.min(failures - 1, FAILURE_BACKOFF_MINUTES.length - 1)]
}

export function nextFailureCheckAt(checkedAt: Date, consecutiveFailures: number) {
  return new Date(checkedAt.getTime() + failureBackoffMinutes(consecutiveFailures) * 60 * 1000)
}

export function nextSuccessfulCheckAt(checkedAt: Date, frequencyHours: number) {
  const hours = normalizedFrequencyHours(frequencyHours)
  return new Date(checkedAt.getTime() + hours * 60 * 60 * 1000)
}

export function rescheduledCheckAt({
  now,
  lastSuccessfulCheckAt,
  lastAttemptAt,
  frequencyHours,
}: {
  now: Date
  lastSuccessfulCheckAt?: Date | null
  lastAttemptAt?: Date | null
  frequencyHours: number
}) {
  const base = lastSuccessfulCheckAt ?? lastAttemptAt
  if (!base) {
    return isManualMonitoringFrequency(frequencyHours)
      ? nextSuccessfulCheckAt(now, frequencyHours)
      : now
  }

  const candidate = nextSuccessfulCheckAt(base, frequencyHours)
  if (!isManualMonitoringFrequency(frequencyHours) && candidate.getTime() <= now.getTime()) return now
  return candidate
}

export function monitoringLockUntil(startedAt: Date, minutes = 5) {
  const safeMinutes = Number.isFinite(minutes) ? Math.min(Math.max(minutes, 1), 30) : 5
  return new Date(startedAt.getTime() + safeMinutes * 60 * 1000)
}
