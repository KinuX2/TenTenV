// Structured JSON logging for production/container log collectors.
import { randomUUID } from 'node:crypto'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { message: String(error) }
}

function write(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: 'tentenv-server',
    event,
    ...fields,
  }
  const line = JSON.stringify(record)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => write('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, error?: unknown, fields: Record<string, unknown> = {}) =>
    write('error', event, { ...fields, ...(error === undefined ? {} : { error: normalizeError(error) }) }),
}

export const requestId = () => randomUUID()
