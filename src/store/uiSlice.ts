import type { StateCreator } from 'zustand'
import type { ViewType, Notification, Toast } from '../types'

// =============================================================================
// Slice Interface
// =============================================================================

export interface UiSliceState {
  currentView: ViewType
  notifications: Notification[]
  activePortfolioId: number
  toasts: Toast[]
  hasUnsavedChanges: boolean
  telemetryMode: 'auto' | 'review' | 'off'
  sessionId: string | null
  hiveContributionEnabled: boolean
  isFeedbackOpen: boolean
}

export interface UiSliceActions {
  setCurrentView: (view: ViewType) => void
  addNotification: (notification: Omit<Notification, 'id'>) => void
  dismissNotification: (id: string) => void
  clearNotifications: () => void
  setActivePortfolioId: (id: number) => void
  addToast: (toast: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  clearToasts: () => void
  setHasUnsavedChanges: (hasChanges: boolean) => void
  setTelemetryMode: (mode: 'auto' | 'review' | 'off') => void
  setSessionId: (id: string) => void
  setHiveContributionEnabled: (enabled: boolean) => void
  openFeedback: () => void
  closeFeedback: () => void
}

export type UiSlice = UiSliceState & UiSliceActions

// =============================================================================
// Initial State
// =============================================================================

export const uiInitialState: UiSliceState = {
  currentView: 'dashboard',
  notifications: [],
  activePortfolioId: 1,
  toasts: [],
  hasUnsavedChanges: false,
  telemetryMode: 'auto',
  sessionId: null,
  hiveContributionEnabled: false,
  isFeedbackOpen: false,
}

// =============================================================================
// Slice Creator
// =============================================================================

export const createUiSlice: StateCreator<UiSlice, [], [], UiSlice> = (set, get) => ({
  ...uiInitialState,

  setCurrentView: (view) => set({ currentView: view }),

  addNotification: (notification) => {
    const id = `notification-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }],
    }))

    if (notification.duration) {
      setTimeout(() => {
        const exists = get().notifications.some((n) => n.id === id)
        if (exists) {
          get().dismissNotification(id)
        }
      }, notification.duration)
    }
  },

  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),

  setActivePortfolioId: (id) => set({ activePortfolioId: id }),

  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    const duration = toast.duration ?? 4000

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))

    if (duration > 0) {
      setTimeout(() => {
        const exists = get().toasts.some((t) => t.id === id)
        if (exists) {
          get().dismissToast(id)
        }
      }, duration)
    }
  },

  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  clearToasts: () => set({ toasts: [] }),

  setHasUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),

  setTelemetryMode: (mode) => set({ telemetryMode: mode }),

  setSessionId: (id) => set({ sessionId: id }),

  setHiveContributionEnabled: (enabled) => set({ hiveContributionEnabled: enabled }),

  openFeedback: () => set({ isFeedbackOpen: true }),

  closeFeedback: () => set({ isFeedbackOpen: false }),
})
