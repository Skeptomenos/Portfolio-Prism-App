import { AsyncLocalStorage } from 'node:async_hooks'
import type { SessionVault } from './broker-contract'
/** Async context binds a capability use to the operation that scheduled it.
 * A later operation cannot accidentally renew an older continuation's lease. */
const operation = new AsyncLocalStorage<AbortSignal>()
export const credentialSignal = () => operation.getStore()
export function inCredentialScope<T>(signal: AbortSignal, work: () => T): T { return operation.run(signal,work) }
export function scopedVault(vault: SessionVault): SessionVault {
  const guard = () => { const signal = operation.getStore(); if (!signal) throw Error('Credential operation unavailable'); signal.throwIfAborted() }
  return { getPassword: () => { guard(); return vault.getPassword() }, setPassword: value => { guard(); vault.setPassword(value) }, deleteCredential: () => { guard(); return vault.deleteCredential() } }
}
export function credentialCleanup(work: () => void) {
  const controller = new AbortController()
  try { return inCredentialScope(controller.signal,work) }
  finally { controller.abort() }
}
