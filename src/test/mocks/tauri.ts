import { vi } from 'vitest'

type InvokeHandler = (cmd: string, args?: Record<string, unknown>) => unknown
type ListenHandler = (event: string, handler: (payload: unknown) => void) => () => void

let invokeHandler: InvokeHandler = () => Promise.resolve({})
let listenHandler: ListenHandler = () => () => {}

export function setInvokeHandler(handler: InvokeHandler) {
  invokeHandler = handler
}

export function setListenHandler(handler: ListenHandler) {
  listenHandler = handler
}

export function resetTauriMocks() {
  invokeHandler = () => Promise.resolve({})
  listenHandler = () => () => {}
}

export const mockTauriInvoke = vi.fn((cmd: string, args?: Record<string, unknown>) => {
  return invokeHandler(cmd, args)
})

export const mockTauriListen = vi.fn((event: string, handler: (payload: unknown) => void) => {
  return listenHandler(event, handler)
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockTauriInvoke,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: mockTauriListen,
  emit: vi.fn(),
}))

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown
  }
}

export function mockTauriEnvironment(isTauri: boolean) {
  if (isTauri) {
    window.__TAURI_INTERNALS__ = {}
  } else {
    delete window.__TAURI_INTERNALS__
  }
}
