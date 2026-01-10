import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { useAppStore } from './useAppStore'

describe('useAppStore', () => {
  beforeEach(() => {
    useAppStore.setState({
      currentView: 'dashboard',
      engineStatus: 'disconnected',
      syncProgress: null,
      lastSyncTime: null,
      notifications: [],
      activePortfolioId: 1,
      authState: 'idle',
      isAuthPanelOpen: false,
      authError: null,
      savedPhone: null,
      rememberMe: false,
      toasts: [],
      hasUnsavedChanges: false,
      lastPipelineRun: null,
      telemetryMode: 'auto',
      sessionId: null,
      hiveContributionEnabled: false,
      isFeedbackOpen: false,
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Navigation', () => {
    it('sets current view', () => {
      const { setCurrentView } = useAppStore.getState()

      act(() => {
        setCurrentView('holdings')
      })

      expect(useAppStore.getState().currentView).toBe('holdings')
    })
  })

  describe('Engine Status', () => {
    it('sets engine status', () => {
      const { setEngineStatus } = useAppStore.getState()

      act(() => {
        setEngineStatus('idle')
      })

      expect(useAppStore.getState().engineStatus).toBe('idle')
    })

    it('sets sync progress', () => {
      const { setSyncProgress } = useAppStore.getState()
      const progress = { status: 'syncing' as const, progress: 50, message: 'Syncing...' }

      act(() => {
        setSyncProgress(progress)
      })

      expect(useAppStore.getState().syncProgress).toEqual(progress)
    })

    it('sets last sync time', () => {
      const { setLastSyncTime } = useAppStore.getState()
      const time = new Date()

      act(() => {
        setLastSyncTime(time)
      })

      expect(useAppStore.getState().lastSyncTime).toEqual(time)
    })

    it('sets last pipeline run', () => {
      const { setLastPipelineRun } = useAppStore.getState()

      act(() => {
        setLastPipelineRun(1234567890)
      })

      expect(useAppStore.getState().lastPipelineRun).toBe(1234567890)
    })
  })

  describe('Compound Sync Actions', () => {
    it('startSync sets processing state', () => {
      const { startSync } = useAppStore.getState()

      act(() => {
        startSync()
      })

      const state = useAppStore.getState()
      expect(state.engineStatus).toBe('processing')
      expect(state.syncProgress?.status).toBe('syncing')
      expect(state.syncProgress?.progress).toBe(0)
    })

    it('completeSync sets idle state and updates time', () => {
      const { completeSync } = useAppStore.getState()

      act(() => {
        completeSync()
      })

      const state = useAppStore.getState()
      expect(state.engineStatus).toBe('idle')
      expect(state.syncProgress?.status).toBe('complete')
      expect(state.syncProgress?.progress).toBe(100)
      expect(state.lastSyncTime).toBeInstanceOf(Date)
    })

    it('failSync sets error state', () => {
      const { failSync } = useAppStore.getState()

      act(() => {
        failSync('Connection failed')
      })

      const state = useAppStore.getState()
      expect(state.engineStatus).toBe('error')
      expect(state.syncProgress?.status).toBe('error')
      expect(state.syncProgress?.message).toBe('Connection failed')
    })
  })

  describe('Notifications', () => {
    it('adds notification', () => {
      const { addNotification } = useAppStore.getState()

      act(() => {
        addNotification({ type: 'info', title: 'Test', message: 'Test notification' })
      })

      const notifications = useAppStore.getState().notifications
      expect(notifications).toHaveLength(1)
      expect(notifications[0].message).toBe('Test notification')
      expect(notifications[0].id).toBeDefined()
    })

    it('dismisses notification by id', () => {
      const { addNotification, dismissNotification } = useAppStore.getState()

      act(() => {
        addNotification({ type: 'info', title: 'Test', message: 'Test' })
      })

      const id = useAppStore.getState().notifications[0].id

      act(() => {
        dismissNotification(id)
      })

      expect(useAppStore.getState().notifications).toHaveLength(0)
    })

    it('clears all notifications', () => {
      const { addNotification, clearNotifications } = useAppStore.getState()

      act(() => {
        addNotification({ type: 'info', title: 'Test 1', message: 'Test 1' })
        addNotification({ type: 'info', title: 'Test 2', message: 'Test 2' })
      })

      expect(useAppStore.getState().notifications).toHaveLength(2)

      act(() => {
        clearNotifications()
      })

      expect(useAppStore.getState().notifications).toHaveLength(0)
    })

    it('auto-dismisses notification after duration', () => {
      const { addNotification } = useAppStore.getState()

      act(() => {
        addNotification({ type: 'info', title: 'Auto', message: 'Auto dismiss', duration: 1000 })
      })

      expect(useAppStore.getState().notifications).toHaveLength(1)

      act(() => {
        vi.advanceTimersByTime(1000)
      })

      expect(useAppStore.getState().notifications).toHaveLength(0)
    })
  })

  describe('Portfolio', () => {
    it('sets active portfolio id', () => {
      const { setActivePortfolioId } = useAppStore.getState()

      act(() => {
        setActivePortfolioId(2)
      })

      expect(useAppStore.getState().activePortfolioId).toBe(2)
    })
  })

  describe('Auth State', () => {
    it('opens auth panel', () => {
      const { openAuthPanel } = useAppStore.getState()

      act(() => {
        openAuthPanel()
      })

      expect(useAppStore.getState().isAuthPanelOpen).toBe(true)
    })

    it('closes auth panel and clears error', () => {
      useAppStore.setState({ isAuthPanelOpen: true, authError: 'Some error' })
      const { closeAuthPanel } = useAppStore.getState()

      act(() => {
        closeAuthPanel()
      })

      const state = useAppStore.getState()
      expect(state.isAuthPanelOpen).toBe(false)
      expect(state.authError).toBeNull()
    })

    it('sets auth state', () => {
      const { setAuthState } = useAppStore.getState()

      act(() => {
        setAuthState('authenticated')
      })

      expect(useAppStore.getState().authState).toBe('authenticated')
    })

    it('sets auth error', () => {
      const { setAuthError } = useAppStore.getState()

      act(() => {
        setAuthError('Invalid credentials')
      })

      expect(useAppStore.getState().authError).toBe('Invalid credentials')
    })

    it('sets saved phone', () => {
      const { setSavedPhone } = useAppStore.getState()

      act(() => {
        setSavedPhone('+4917612345678')
      })

      expect(useAppStore.getState().savedPhone).toBe('+4917612345678')
    })

    it('sets remember me', () => {
      const { setRememberMe } = useAppStore.getState()

      act(() => {
        setRememberMe(true)
      })

      expect(useAppStore.getState().rememberMe).toBe(true)
    })
  })

  describe('Toasts', () => {
    it('adds toast', () => {
      const { addToast } = useAppStore.getState()

      act(() => {
        addToast({ type: 'success', title: 'Success!' })
      })

      const toasts = useAppStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].title).toBe('Success!')
      expect(toasts[0].id).toBeDefined()
    })

    it('dismisses toast by id', () => {
      const { addToast, dismissToast } = useAppStore.getState()

      act(() => {
        addToast({ type: 'info', title: 'Test', duration: 0 })
      })

      const id = useAppStore.getState().toasts[0].id

      act(() => {
        dismissToast(id)
      })

      expect(useAppStore.getState().toasts).toHaveLength(0)
    })

    it('clears all toasts', () => {
      const { addToast, clearToasts } = useAppStore.getState()

      act(() => {
        addToast({ type: 'info', title: 'Test 1', duration: 0 })
        addToast({ type: 'info', title: 'Test 2', duration: 0 })
      })

      expect(useAppStore.getState().toasts).toHaveLength(2)

      act(() => {
        clearToasts()
      })

      expect(useAppStore.getState().toasts).toHaveLength(0)
    })

    it('auto-dismisses toast after default duration', () => {
      const { addToast } = useAppStore.getState()

      act(() => {
        addToast({ type: 'success', title: 'Auto dismiss' })
      })

      expect(useAppStore.getState().toasts).toHaveLength(1)

      act(() => {
        vi.advanceTimersByTime(4000)
      })

      expect(useAppStore.getState().toasts).toHaveLength(0)
    })
  })

  describe('Editing State', () => {
    it('sets has unsaved changes', () => {
      const { setHasUnsavedChanges } = useAppStore.getState()

      act(() => {
        setHasUnsavedChanges(true)
      })

      expect(useAppStore.getState().hasUnsavedChanges).toBe(true)
    })
  })

  describe('Telemetry', () => {
    it('sets telemetry mode', () => {
      const { setTelemetryMode } = useAppStore.getState()

      act(() => {
        setTelemetryMode('off')
      })

      expect(useAppStore.getState().telemetryMode).toBe('off')
    })

    it('sets session id', () => {
      const { setSessionId } = useAppStore.getState()

      act(() => {
        setSessionId('session-123')
      })

      expect(useAppStore.getState().sessionId).toBe('session-123')
    })
  })

  describe('Hive', () => {
    it('sets hive contribution enabled', () => {
      const { setHiveContributionEnabled } = useAppStore.getState()

      act(() => {
        setHiveContributionEnabled(true)
      })

      expect(useAppStore.getState().hiveContributionEnabled).toBe(true)
    })
  })

  describe('Feedback', () => {
    it('opens feedback dialog', () => {
      const { openFeedback } = useAppStore.getState()

      act(() => {
        openFeedback()
      })

      expect(useAppStore.getState().isFeedbackOpen).toBe(true)
    })

    it('closes feedback dialog', () => {
      useAppStore.setState({ isFeedbackOpen: true })
      const { closeFeedback } = useAppStore.getState()

      act(() => {
        closeFeedback()
      })

      expect(useAppStore.getState().isFeedbackOpen).toBe(false)
    })
  })
})
