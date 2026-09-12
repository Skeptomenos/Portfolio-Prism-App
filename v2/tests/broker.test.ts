import { it, expect } from 'vitest'
import { TradeRepublicBroker, type SessionVault } from '../server/broker'

it('cancels an in-flight SDK session refresh at the HTTP transport without persisting late results', async () => {
  const now = Math.floor(Date.now() / 1000)
  const claims = Buffer.from(JSON.stringify({ iat: now, exp: now + 3600 })).toString('base64url')
  const saved = JSON.stringify({
    version: 1,
    cookies: [`tr_session=header.${claims}.synthetic; Path=/`, 'tr_refresh=synthetic; Path=/'],
  })
  let writes = 0
  let aborted = false
  const vault: SessionVault = {
    getPassword: () => saved,
    setPassword: () => {
      writes++
    },
    deleteCredential: () => true,
  }
  const transport: typeof fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => {
          aborted = true
          reject(new DOMException('Aborted', 'AbortError'))
        },
        { once: true }
      )
    })
  const broker = new TradeRepublicBroker(vault, transport)
  const controller = new AbortController()
  const restore = broker.restore(controller.signal)
  controller.abort()
  await expect(restore).rejects.toThrow()
  expect(aborted).toBe(true)
  expect(writes).toBe(0)
  broker.logout()
})

it('records safe HTTP diagnostics without provider bodies or login credentials', async () => {
  const events: unknown[] = []
  const vault: SessionVault = {
    getPassword: () => null,
    setPassword: () => {},
    deleteCredential: () => true,
  }
  const broker = new TradeRepublicBroker(
    vault,
    async () =>
      new Response('sensitive-provider-body', {
        status: 429,
        headers: { 'set-cookie': 'secret-cookie' },
      })
  )
  broker.observe((event) => events.push(event))
  await expect(
    broker.login('+49123456789', '8765', new AbortController().signal, () => {})
  ).rejects.toThrow()
  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ stage: 'login_request', event: 'failed', httpStatus: 429 }),
    ])
  )
  const serialized = JSON.stringify(events)
  for (const secret of ['sensitive-provider-body', 'secret-cookie', '+49123456789', '8765']) {
    expect(serialized).not.toContain(secret)
  }
  broker.logout()
})
