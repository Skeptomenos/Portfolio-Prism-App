/**
 * Tauri Event Listener Hooks
 *
 * React hooks for subscribing to Tauri events and syncing with app state.
 */

import { useEffect, useRef } from 'react'
import { listen, isTauri } from '../lib/tauri'
import { useAppStore } from '../store/useAppStore'
import { invalidatePortfolioQueries } from '../lib/queryClient'
import { logger } from '../lib/logger'
import type { EngineStatusEvent, PortfolioUpdatedEvent, SyncProgress } from '../types'

// =============================================================================
// Main Event Listener Hook
// =============================================================================

/**
 * Initialize all Tauri event listeners.
 * Call this once in your root component (App.tsx).
 */
export function useTauriEvents() {
  const setEngineStatus = useAppStore((state) => state.setEngineStatus)
  const setSyncProgress = useAppStore((state) => state.setSyncProgress)
  const setLastSyncTime = useAppStore((state) => state.setLastSyncTime)
  const addNotification = useAppStore((state) => state.addNotification)

  // Track if we've already initialized listeners
  const initialized = useRef(false)

  useEffect(() => {
    if (!isTauri() || initialized.current) {
      if (!isTauri()) {
        logger.info('[Events] Not in Tauri environment, skipping event listeners')
        setEngineStatus('idle')
      }
      return
    }

    initialized.current = true
    logger.info('[Events] Initializing Tauri event listeners')

    const unlistenFns: Array<() => void> = []

    // Setup all listeners
    const setupListeners = async () => {
      const unlistenEngineStatus = await listen('engine-status', (payload: EngineStatusEvent) => {
        logger.debug('[Event] engine-status', payload)
        setEngineStatus(payload.status)

        if (payload.progress !== undefined) {
          setSyncProgress({
            status: payload.status === 'processing' ? 'syncing' : 'idle',
            progress: payload.progress,
            message: payload.message,
          })
        }
      })
      unlistenFns.push(unlistenEngineStatus)

      const unlistenPortfolioUpdated = await listen(
        'portfolio-updated',
        (payload: PortfolioUpdatedEvent) => {
          logger.debug('[Event] portfolio-updated', payload)
          setLastSyncTime(new Date(payload.timestamp))
          invalidatePortfolioQueries(payload.portfolioId)
          addNotification({
            type: 'success',
            title: 'Portfolio Updated',
            message: 'Your portfolio data has been refreshed.',
            duration: 3000,
          })
        }
      )
      unlistenFns.push(unlistenPortfolioUpdated)

      const unlistenSyncProgress = await listen('sync-progress', (payload: SyncProgress) => {
        logger.debug('[Event] sync-progress', payload)
        setSyncProgress(payload)

        if (payload.status === 'syncing') {
          setEngineStatus('processing')
        } else if (payload.status === 'complete') {
          setEngineStatus('idle')
          setLastSyncTime(new Date())
        } else if (payload.status === 'error') {
          setEngineStatus('error')
          addNotification({
            type: 'error',
            title: 'Sync Failed',
            message: payload.message,
            duration: 5000,
          })
        }
      })
      unlistenFns.push(unlistenSyncProgress)

      const unlistenPythonReady = await listen('python-ready', (payload) => {
        logger.debug('[Event] python-ready', payload)
        setEngineStatus('idle')
        addNotification({
          type: 'info',
          title: 'Engine Ready',
          message: 'Python analytics engine is connected.',
          duration: 2000,
        })
      })
      unlistenFns.push(unlistenPythonReady)

      logger.info('[Events] All listeners initialized')
    }

    setupListeners()

    return () => {
      logger.info('[Events] Cleaning up event listeners')
      unlistenFns.forEach((unlisten) => unlisten())
    }
  }, [setEngineStatus, setSyncProgress, setLastSyncTime, addNotification])
}

// =============================================================================
// Individual Event Hooks (for specific use cases)
// =============================================================================

/**
 * Subscribe to engine status changes
 */
export function useEngineStatusListener(callback: (status: EngineStatusEvent) => void) {
  useEffect(() => {
    if (!isTauri()) return

    let unlisten: (() => void) | null = null

    listen('engine-status', callback).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [callback])
}

/**
 * Subscribe to portfolio update events
 */
export function usePortfolioUpdateListener(callback: (event: PortfolioUpdatedEvent) => void) {
  useEffect(() => {
    if (!isTauri()) return

    let unlisten: (() => void) | null = null

    listen('portfolio-updated', callback).then((fn) => {
      unlisten = fn
    })

    return () => {
      unlisten?.()
    }
  }, [callback])
}
