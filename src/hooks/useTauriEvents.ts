/**
 * Tauri Event Listener Hooks
 * 
 * React hooks for subscribing to Tauri events and syncing with app state.
 */

import { useEffect, useRef } from 'react';
import { listen, isTauri } from '../lib/tauri';
import { useAppStore } from '../store/useAppStore';
import { invalidatePortfolioQueries } from '../lib/queryClient';
import type { EngineStatusEvent, PortfolioUpdatedEvent, SyncProgress } from '../types';

// =============================================================================
// Main Event Listener Hook
// =============================================================================

/**
 * Initialize all Tauri event listeners.
 * Call this once in your root component (App.tsx).
 */
export function useTauriEvents() {
  const setEngineStatus = useAppStore((state) => state.setEngineStatus);
  const setSyncProgress = useAppStore((state) => state.setSyncProgress);
  const setLastSyncTime = useAppStore((state) => state.setLastSyncTime);
  const addNotification = useAppStore((state) => state.addNotification);

  // Track if we've already initialized listeners
  const initialized = useRef(false);

  useEffect(() => {
    // Skip if not in Tauri or already initialized
    if (!isTauri() || initialized.current) {
      if (!isTauri()) {
        console.log('[Events] Not in Tauri environment, skipping event listeners');
        // Set status to idle for browser development
        setEngineStatus('idle');
      }
      return;
    }

    initialized.current = true;
    console.log('[Events] Initializing Tauri event listeners');

    const unlistenFns: Array<() => void> = [];

    // Setup all listeners
    const setupListeners = async () => {
      // Engine Status Events
      const unlistenEngineStatus = await listen('engine-status', (payload: EngineStatusEvent) => {
        console.log('[Event] engine-status:', payload);
        setEngineStatus(payload.status);
        
        if (payload.progress !== undefined) {
          setSyncProgress({
            status: payload.status === 'processing' ? 'syncing' : 'idle',
            progress: payload.progress,
            message: payload.message,
          });
        }
      });
      unlistenFns.push(unlistenEngineStatus);

      // Portfolio Updated Events
      const unlistenPortfolioUpdated = await listen('portfolio-updated', (payload: PortfolioUpdatedEvent) => {
        console.log('[Event] portfolio-updated:', payload);
        
        // Update last sync time
        setLastSyncTime(new Date(payload.timestamp));
        
        // Invalidate query cache to refetch data
        invalidatePortfolioQueries(payload.portfolioId);
        
        // Show notification
        addNotification({
          type: 'success',
          title: 'Portfolio Updated',
          message: 'Your portfolio data has been refreshed.',
          duration: 3000,
        });
      });
      unlistenFns.push(unlistenPortfolioUpdated);

      // Sync Progress Events
      const unlistenSyncProgress = await listen('sync-progress', (payload: SyncProgress) => {
        console.log('[Event] sync-progress:', payload);
        setSyncProgress(payload);
        
        // Update engine status based on sync status
        if (payload.status === 'syncing') {
          setEngineStatus('processing');
        } else if (payload.status === 'complete') {
          setEngineStatus('idle');
          setLastSyncTime(new Date());
        } else if (payload.status === 'error') {
          setEngineStatus('error');
          addNotification({
            type: 'error',
            title: 'Sync Failed',
            message: payload.message,
            duration: 5000,
          });
        }
      });
      unlistenFns.push(unlistenSyncProgress);

      // Python Ready Event (from sidecar startup)
      const unlistenPythonReady = await listen('python-ready', (payload) => {
        console.log('[Event] python-ready:', payload);
        setEngineStatus('idle');
        addNotification({
          type: 'info',
          title: 'Engine Ready',
          message: 'Python analytics engine is connected.',
          duration: 2000,
        });
      });
      unlistenFns.push(unlistenPythonReady);

      console.log('[Events] All listeners initialized');
    };

    setupListeners();

    // Cleanup on unmount
    return () => {
      console.log('[Events] Cleaning up event listeners');
      unlistenFns.forEach((unlisten) => unlisten());
    };
  }, [setEngineStatus, setSyncProgress, setLastSyncTime, addNotification]);
}

// =============================================================================
// Individual Event Hooks (for specific use cases)
// =============================================================================

/**
 * Subscribe to engine status changes
 */
export function useEngineStatusListener(
  callback: (status: EngineStatusEvent) => void
) {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | null = null;

    listen('engine-status', callback).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [callback]);
}

/**
 * Subscribe to portfolio update events
 */
export function usePortfolioUpdateListener(
  callback: (event: PortfolioUpdatedEvent) => void
) {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | null = null;

    listen('portfolio-updated', callback).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [callback]);
}
