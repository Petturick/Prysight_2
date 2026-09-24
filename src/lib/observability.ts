import { randomUUID } from 'node:crypto'

type LogLevel = 'info' | 'warn' | 'error'

export function createCorrelationId(prefix = 'evt') {
  return `${prefix}_${randomUUID()}`
}

export function logOperationalEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...fields,
  }
  const message = JSON.stringify(payload)
  if (level === 'error') console.error(message)
  else if (level === 'warn') console.warn(message)
  else console.info(message)
}
