import assert from 'node:assert/strict'
import test from 'node:test'
import { failureBackoffMinutes, monitoringLockUntil, nextFailureCheckAt, nextSuccessfulCheckAt } from '@/lib/monitoring-schedule'

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

test('failure and lock timestamps are deterministic', () => {
  const now = new Date('2026-09-24T12:00:00.000Z')
  assert.equal(nextFailureCheckAt(now, 2).toISOString(), '2026-09-24T12:30:00.000Z')
  assert.equal(monitoringLockUntil(now).toISOString(), '2026-09-24T12:05:00.000Z')
})
