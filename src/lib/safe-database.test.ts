import assert from 'node:assert/strict'
import test from 'node:test'
import { isTransientDatabaseError, retryTransientDatabaseRead, safeDatabaseQuery } from './safe-database'

test('retries a temporary connection error once and returns real data', async () => {
  let attempts = 0
  const result = await safeDatabaseQuery(async () => {
    attempts += 1
    if (attempts === 1) throw Object.assign(new Error('Database temporarily unreachable'), { code: 'P1001' })
    return ['competitor']
  }, [] as string[])
  assert.deepEqual(result, { data: ['competitor'], available: true })
  assert.equal(attempts, 2)
})

test('does not retry authentication, permissions or ordinary query failures', async () => {
  let attempts = 0
  const invalidCredentials = Object.assign(new Error('password authentication failed'), { code: '28P01' })
  assert.equal(isTransientDatabaseError(invalidCredentials), false)
  await assert.rejects(() => retryTransientDatabaseRead(async () => {
    attempts += 1
    throw invalidCredentials
  }), invalidCredentials)
  assert.equal(attempts, 1)
})

test('recognizes connection errors wrapped in a driver cause', () => {
  const inner = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' })
  assert.equal(isTransientDatabaseError(Object.assign(new Error('read failed'), { cause: inner })), true)
})

test('never treats an unavailable database as successfully loaded empty data', async () => {
  const previousError = console.error
  console.error = () => undefined
  try {
    const result = await safeDatabaseQuery(async () => {
      throw new Error('schema mismatch')
    }, [] as string[])
    assert.equal(result.available, false)
    assert.deepEqual(result.data, [])
  } finally {
    console.error = previousError
  }
})
