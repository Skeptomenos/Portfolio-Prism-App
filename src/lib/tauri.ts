/**
 * Tauri API Wrapper
 * 
 * Provides type-safe access to Tauri's invoke and listen APIs.
 * Falls back gracefully when running in a browser (not Tauri).
 */

import type { 
  TauriCommands,
  TauriEvents
} from '../types';

/**
 * Check if we're running inside Tauri
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
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
    throw new Error(`Tauri not available. Cannot invoke command: ${command}`);
  }

  // Dynamic import to avoid issues in non-Tauri environments
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke(command, args);
}

// =============================================================================
// Typed Listen Wrapper
// =============================================================================

type UnlistenFn = () => void;

/**
 * Type-safe listen wrapper for Tauri events
 */
export async function listen<K extends keyof TauriEvents>(
  event: K,
  handler: (payload: TauriEvents[K]) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    console.warn(`Tauri not available. Cannot listen for event: ${event}`);
    // Return no-op unlisten function
    return () => {};
  }

  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  return tauriListen(event, (e) => handler(e.payload as TauriEvents[K]));
}

/**
 * Listen for an event once
 */
export async function once<K extends keyof TauriEvents>(
  event: K,
  handler: (payload: TauriEvents[K]) => void
): Promise<UnlistenFn> {
  if (!isTauri()) {
    console.warn(`Tauri not available. Cannot listen for event: ${event}`);
    return () => {};
  }

  const { once: tauriOnce } = await import('@tauri-apps/api/event');
  return tauriOnce(event, (e) => handler(e.payload as TauriEvents[K]));
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
    console.warn(`Tauri not available. Cannot emit event: ${event}`);
    return;
  }

  const { emit: tauriEmit } = await import('@tauri-apps/api/event');
  return tauriEmit(event, payload);
}
