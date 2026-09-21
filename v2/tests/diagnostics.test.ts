import { decodeSnapshot } from '../server/model'
import { it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TRHttpError } from 'trade-republic-sdk'
import { SnapshotStore } from '../server/store'
import { PortfolioService } from '../server/service'
import { classifyError } from '../server/diagnostics'
import { httpStage } from '../server/trade-republic-errors'
import { BrokerFailure } from '../server/broker-contract'
import type { Broker } from '../server/broker'

it('persists correlated failures across restart without credentials, raw messages or payloads', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prism-diagnostics-'))
  const path = join(directory, 'db.sqlite')
  const secret = 'DO_NOT_RECORD_PIN_COOKIE_PHONE'
  const broker: Broker = {
    authenticate: async () => {
      throw new BrokerFailure({ category: 'http', httpStatus: 429 })
    },
    restore: async () => false,
    fetch: async () => {
      throw new Error(secret)
    },
    logout() {},
    close() {},
    warning: () => null,
  }
  const service = new PortfolioService(broker, new SnapshotStore(path))
  service.login('+49123456789', '1234')
  await service.settled()
  const events = service.diagnostics()
  expect(events).toHaveLength(2)
  expect(events[0]).toMatchObject({
    operation: 'login',
    stage: 'connecting',
    event: 'failed',
    category: 'http',
    httpStatus: 429,
  })
  expect(events[0].attemptId).toBe(events[1].attemptId)
  expect(service.status().error).toContain(events[0].attemptId)
  expect(JSON.stringify(events)).not.toContain(secret)
  await service.close()
  const reopened = new SnapshotStore(path)
  expect(reopened.diagnostics()).toEqual(events)
  reopened.close()
  rmSync(directory, { recursive: true })
})
it('retains only allowlisted network codes and maps login URLs without process identifiers', () => {
  const error = new Error('private payload', {
    cause: Object.assign(new Error('secret'), { code: 'ENOTFOUND' }),
  })
  expect(classifyError(error)).toEqual({ category: 'connection', networkCode: 'ENOTFOUND' })
  expect(classifyError(Object.assign(new Error('secret'), { code: 'PRIVATE_ACCOUNT' }))).toEqual({
    category: 'unexpected',
  })
  expect(
    httpStage(
      'https://api.traderepublic.com/api/v2/auth/web/login/processes/private-process?token=secret'
    )
  ).toBe('login_approval')
})
it('bounds diagnostic retention and explicitly projects fields before persistence', () => {
  const store = new SnapshotStore(':memory:')
  for (let i = 0; i < 1005; i++)
    store.recordDiagnostic({
      attemptId: String(i),
      operation: 'login',
      stage: 'connecting',
      event: 'started',
      category: 'none',
      at: new Date().toISOString(),
      durationMs: 0,
      ...{ password: 'NEVER_PERSIST' },
    })
  expect(store.diagnostics()).toHaveLength(100)
  expect(store.diagnostics()[0].attemptId).toBe('1004')
  expect(JSON.stringify(store.diagnostics())).not.toContain('NEVER_PERSIST')
  store.close()
})

it('classifies schema failures without recording the rejected payload', () => {
  try {
    decodeSnapshot({ positions: 'PRIVATE_PAYLOAD' })
  } catch (error) {
    expect(classifyError(error)).toEqual({ category: 'validation' })
    return
  }
  throw new Error('Expected schema rejection')
})
