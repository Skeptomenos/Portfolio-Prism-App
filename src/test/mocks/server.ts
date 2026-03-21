import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)

export function startMswServer() {
  server.listen({ onUnhandledRequest: 'bypass' })
}

export function stopMswServer() {
  server.close()
}

export function resetMswHandlers() {
  server.resetHandlers()
}
