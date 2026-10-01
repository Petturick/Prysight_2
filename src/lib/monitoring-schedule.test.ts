import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MANUAL_CHECK_FREQUENCY_HOURS,
  failureBackoffMinutes,
  monitoringLockUntil,
  nextFailureCheckAt,
  nextSuccessfulCheckAt,
  rescheduledCheckAt,
} from '@/lib/monitoring-schedule'

test('failed monitoring retries quickly with capped exponential backoff', () => {
  assert.equal(failureBackoffMinutes(1), 15)
  assert.equal(failureBackoffMinutes(2), 30)
  assert.equal(failureBackoffMinutes(3), 60)
  assert.equal(failureBackoffMinutes(6), 360)
  assert.equal(failureBackoffMinutes(20), 360)
})

test('successful monitoring respects configured frequency', () => {
  const now = new Date('2026-09-24T12:00:00.000Z')
  assert.equal(nextSuccessfulCheckAt(now, 24).toISOString(), '2026-09-25T12:00:00.000Z')
  assert.equal(nextSuccessfulCheckAt(now, 0).toISOString(), '2026-09-24T13:00:00.000Z')
})

test('manual monitoring is never silently reduced to a 30 day automatic cadence', () => {
  const now = new Date('2026-10-01T12:00:00.000Z')
  const next = nextSuccessfulCheckAt(now, MANUAL_CHECK_FREQUENCY_HOURS)
  assert.ok(next.getTime() - now.getTime() > 365 * 24 * 60 * 60 * 1000)
})

test('changing to a shorter cadence makes overdue monitoring due immediately', () => {
  const now = new Date('2026-10-01T12:00:00.000Z')
  const lastSuccessfulCheckAt = new Date('2026-10-01T02:00:00.000Z')
  assert.equal(
    rescheduledCheckAt({ now, lastSuccessfulCheckAt, frequencyHours: 6 }).toISOString(),
    now.toISOString(),
  )
})

test('changing to a longer cadence keeps the last successful check as the anchor', () => {
  const now = new Date('2026-10-01T12:00:00.000Z')
  const lastSuccessfulCheckAt = new Date('2026-10-01T02:00:00.000Z')
  assert.equal(
    rescheduledCheckAt({ now, lastSuccessfulCheckAt, frequencyHours: 24 }).toISOString(),
    '2026-10-02T02:00:00.000Z',
  )
})

test('new automatic sources are due immediately while manual sources remain manual', () => {
  const now = new Date('2026-10-01T12:00:00.000Z')
  assert.equal(rescheduledCheckAt({ now, frequencyHours: 24 }).toISOString(), now.toISOString())
  assert.ok(
    rescheduledCheckAt({ now, frequencyHours: MANUAL_CHECK_FREQUENCY_HOURS }).getTime() > now.getTime(),
  )
})

test('failure and lock timestamps are deterministic', () => {
  const now = new Date('2026-09-24T12:00:00.000Z')
  assert.equal(nextFailureCheckAt(now, 2).toISOString(), '2026-09-24T12:30:00.000Z')
  assert.equal(monitoringLockUntil(now).toISOString(), '2026-09-24T12:05:00.000Z')
})
