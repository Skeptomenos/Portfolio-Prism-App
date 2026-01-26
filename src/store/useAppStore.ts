/**
 * Global App State Store (Zustand)
 *
 * Manages UI state that needs to be shared across components:
 * - Navigation (current view)
 * - Engine status (connection, sync progress)
 * - Notifications
 *
 * For async data (portfolio, holdings), use TanStack Query instead.
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

import { createAuthSlice, type AuthSlice } from '../features/auth/store/authSlice'
import { createSyncSlice, type SyncSlice } from '../features/dashboard/store/syncSlice'
import { createUiSlice, type UiSlice } from './uiSlice'

// =============================================================================
// Combined Store Type
// =============================================================================

type AppStore = AuthSlice & SyncSlice & UiSlice

// =============================================================================
// Store Implementation (Slice Composition)
// =============================================================================

export const useAppStore = create<AppStore>()(
  devtools(
    (...a) => ({
      ...createAuthSlice(...a),
      ...createSyncSlice(...a),
      ...createUiSlice(...a),
    }),
    { name: 'AppStore' }
  )
)

// =============================================================================
// Selector Hooks (for optimized re-renders)
// =============================================================================

export const useCurrentView = () => useAppStore((state) => state.currentView)
export const useEngineStatus = () => useAppStore((state) => state.engineStatus)
export const useSyncProgress = () => useAppStore((state) => state.syncProgress)
export const useNotifications = () => useAppStore((state) => state.notifications)
export const useActivePortfolioId = () => useAppStore((state) => state.activePortfolioId)

// Auth selectors
export const useAuthState = () => useAppStore((state) => state.authState)
export const useIsAuthPanelOpen = () => useAppStore((state) => state.isAuthPanelOpen)
export const useAuthError = () => useAppStore((state) => state.authError)
export const useSavedPhone = () => useAppStore((state) => state.savedPhone)
export const useRememberMe = () => useAppStore((state) => state.rememberMe)

// Auth actions
export const useOpenAuthPanel = () => useAppStore((state) => state.openAuthPanel)
export const useCloseAuthPanel = () => useAppStore((state) => state.closeAuthPanel)
export const useSetAuthState = () => useAppStore((state) => state.setAuthState)

// Toast selectors and actions
export const useToasts = () => useAppStore((state) => state.toasts)
export const useAddToast = () => useAppStore((state) => state.addToast)
export const useDismissToast = () => useAppStore((state) => state.dismissToast)

// Telemetry
export const useTelemetryMode = () => useAppStore((state) => state.telemetryMode)
export const useSetTelemetryMode = () => useAppStore((state) => state.setTelemetryMode)
export const useSessionId = () => useAppStore((state) => state.sessionId)
export const useSetSessionId = () => useAppStore((state) => state.setSessionId)

// Hive
export const useHiveContributionEnabled = () =>
  useAppStore((state) => state.hiveContributionEnabled)
export const useSetHiveContributionEnabled = () =>
  useAppStore((state) => state.setHiveContributionEnabled)

// Feedback selectors and actions
export const useIsFeedbackOpen = () => useAppStore((state) => state.isFeedbackOpen)
export const useOpenFeedback = () => useAppStore((state) => state.openFeedback)
export const useCloseFeedback = () => useAppStore((state) => state.closeFeedback)
