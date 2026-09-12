import { it, expect } from 'vitest'
import WebSocket, { WebSocketServer } from 'ws'
import type { AddressInfo } from 'node:net'
import { readPublicData } from '../server/public-data'
it('reads only the allowlisted public topic without credentials and closes after a response', async () => {
  const server = new WebSocketServer({ port: 0 })
  await new Promise<void>((r) => server.on('listening', r))
  const frames: string[] = []
  let cookie: unknown
  server.on('connection', (socket, request) => {
    cookie = request.headers.cookie
    socket.on('message', (m) => {
      const frame = m.toString()
      frames.push(frame)
      if (frame.startsWith('connect ')) socket.send('connected')
      if (frame.startsWith('sub ')) socket.send('1 A {"isin":"US0378331005","priceFactor":1}')
    })
  })
  try {
    const result = await readPublicData(
      'instrument',
      'US0378331005',
      new AbortController().signal,
      () => new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}`)
    )
    expect(result).toEqual({ isin: 'US0378331005', priceFactor: 1 })
    expect(cookie).toBeUndefined()
    expect(frames.some((f) => f === 'sub 1 {"type":"instrument","id":"US0378331005"}')).toBe(true)
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})
it('rejects an invalid instrument before opening a connection', async () => {
  let opened = false
  await expect(
    readPublicData('instrument', 'invalid', new AbortController().signal, () => {
      opened = true
      throw Error()
    })
  ).rejects.toThrow()
  expect(opened).toBe(false)
})
it('cancels a pending public response without returning late data', async () => {
  const server = new WebSocketServer({ port: 0 })
  await new Promise<void>((r) => server.on('listening', r))
  const controller = new AbortController()
  server.on('connection', () => controller.abort())
  try {
    await expect(
      readPublicData(
        'instrument',
        'US0378331005',
        controller.signal,
        () => new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}`)
      )
    ).rejects.toThrow()
  } finally {
    await new Promise<void>((r) => server.close(() => r()))
  }
})
