import { vi } from 'vitest'
import type {
  ViewType,
  AuthState,
  EngineStatus,
  SyncProgress,
  Toast,
  Notification,
} from '../../types'

interface MockStoreState {
  currentView: ViewType
  engineStatus: EngineStatus
  syncProgress: SyncProgress | null
  lastSyncTime: Date | null
  notifications: Notification[]
  activePortfolioId: number
  authState: AuthState
  isAuthPanelOpen: boolean
  authError: string | null
  savedPhone: string | null
  rememberMe: boolean
  toasts: Toast[]
  hasUnsavedChanges: boolean
  lastPipelineRun: number | null
  telemetryMode: 'auto' | 'review' | 'off'
  sessionId: string | null
  hiveContributionEnabled: boolean
  isFeedbackOpen: boolean
}

const defaultState: MockStoreState = {
  currentView: 'dashboard',
  engineStatus: 'idle',
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
  sessionId: 'test-session',
  hiveContributionEnabled: false,
  isFeedbackOpen: false,
}

let mockState = { ...defaultState }

export function setMockStoreState(partial: Partial<MockStoreState>) {
  mockState = { ...mockState, ...partial }
}

export function resetMockStoreState() {
  mockState = { ...defaultState }
}

export const mockStoreActions = {
  setCurrentView: vi.fn((view: ViewType) => {
    mockState.currentView = view
  }),
  setEngineStatus: vi.fn((status: EngineStatus) => {
    mockState.engineStatus = status
  }),
  setSyncProgress: vi.fn((progress: SyncProgress | null) => {
    mockState.syncProgress = progress
  }),
  setLastSyncTime: vi.fn((time: Date | null) => {
    mockState.lastSyncTime = time
  }),
  setLastPipelineRun: vi.fn((timestamp: number | null) => {
    mockState.lastPipelineRun = timestamp
  }),
  setTelemetryMode: vi.fn(),
  setSessionId: vi.fn(),
  setHiveContributionEnabled: vi.fn(),
  openFeedback: vi.fn(() => {
    mockState.isFeedbackOpen = true
  }),
  closeFeedback: vi.fn(() => {
    mockState.isFeedbackOpen = false
  }),
  addNotification: vi.fn(),
  dismissNotification: vi.fn(),
  clearNotifications: vi.fn(),
  setActivePortfolioId: vi.fn(),
  openAuthPanel: vi.fn(() => {
    mockState.isAuthPanelOpen = true
  }),
  closeAuthPanel: vi.fn(() => {
    mockState.isAuthPanelOpen = false
  }),
  setAuthState: vi.fn((state: AuthState) => {
    mockState.authState = state
  }),
  setAuthError: vi.fn((error: string | null) => {
    mockState.authError = error
  }),
  setSavedPhone: vi.fn((phone: string | null) => {
    mockState.savedPhone = phone
  }),
  setRememberMe: vi.fn(),
  startSync: vi.fn(),
  completeSync: vi.fn(),
  failSync: vi.fn(),
  addToast: vi.fn(),
  dismissToast: vi.fn(),
  clearToasts: vi.fn(),
  setHasUnsavedChanges: vi.fn(),
}

export function createMockStore() {
  return {
    ...mockState,
    ...mockStoreActions,
  }
}

export function getMockState() {
  return mockState
}
