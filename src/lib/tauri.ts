/**
 * Tauri API Wrapper
 *
 * Provides type-safe access to Tauri's invoke and listen APIs.
 * Falls back gracefully when running in a browser (not Tauri).
 *
 * Module imports are cached after first load to avoid repeated dynamic imports.
 */

import type { TauriCommands, TauriEvents } from '../types'

// =============================================================================
// Module Cache
// =============================================================================
// Cache Tauri API modules after first import to avoid repeated dynamic imports.
// This provides a performance benefit since import() is async and has overhead.

let coreModulePromise: Promise<typeof import('@tauri-apps/api/core')> | null = null
let eventModulePromise: Promise<typeof import('@tauri-apps/api/event')> | null = null

/**
 * Get cached core module (invoke)
 */
async function getCoreModule() {
  if (!coreModulePromise) {
    coreModulePromise = import('@tauri-apps/api/core')
  }
  return coreModulePromise
}

/**
 * Get cached event module (listen, once, emit)
 */
async function getEventModule() {
  if (!eventModulePromise) {
    eventModulePromise = import('@tauri-apps/api/event')
  }
  return eventModulePromise
}

/**
 * Check if we're running inside Tauri
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

// =============================================================================
// Typed Invoke Wrapper
// =============================================================================

/**
 * Type-safe invoke wrapper for Tauri commands
 */
export async function invoke<K extends keyof TauriCommands>(
  command: K,
  args?: TauriCommands[K]['args']
): Promise<TauriCommands[K]['returns']> {
  if (!isTauri()) {
    throw new Error(`Tauri not available. Cannot invoke command: ${command}`)
  }

  // Use cached module import for performance
  const { invoke: tauriInvoke } = await getCoreModule()
  return tauriInvoke(command, args)
}

// =============================================================================
// Typed Listen Wrapper
// =============================================================================

type UnlistenFn = () => void

/**
 * Type-safe listen wrapper for Tauri events
 */
export async function listen<K extends keyof TauriEvents>(
  event: K,
  handler: (payload: TauriEvents[K]) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    console.warn(`Tauri not available. Cannot listen for event: ${event}`)
    // Return no-op unlisten function
    return () => {}
  }

  // Use cached module import for performance
  const { listen: tauriListen } = await getEventModule()
  return tauriListen(event, (e) => handler(e.payload as TauriEvents[K]))
}

/**
 * Listen for an event once
 */
export async function once<K extends keyof TauriEvents>(
  event: K,
  handler: (payload: TauriEvents[K]) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    console.warn(`Tauri not available. Cannot listen for event: ${event}`)
    return () => {}
  }

  // Use cached module import for performance
  const { once: tauriOnce } = await getEventModule()
  return tauriOnce(event, (e) => handler(e.payload as TauriEvents[K]))
}

// =============================================================================
// Emit Events (for testing/debugging)
// =============================================================================

/**
 * Emit an event (useful for testing without Rust backend)
 */
export async function emit<K extends keyof TauriEvents>(
  event: K,
  payload: TauriEvents[K]
): Promise<void> {
  if (!isTauri()) {
    console.warn(`Tauri not available. Cannot emit event: ${event}`)
    return
  }

  // Use cached module import for performance
  const { emit: tauriEmit } = await getEventModule()
  return tauriEmit(event, payload)
}
