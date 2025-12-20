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

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ViewType, EngineStatus, SyncProgress, Notification, AuthState, Toast } from '../types';

// =============================================================================
// State Interface
// =============================================================================

interface AppState {
  // Navigation
  currentView: ViewType;
  
  // Engine Status
  engineStatus: EngineStatus;
  syncProgress: SyncProgress | null;
  lastSyncTime: Date | null;
  
  // Notifications
  notifications: Notification[];
  
  // Portfolio Context
  activePortfolioId: number;
  
  // Auth State
  authState: AuthState;
  isAuthPanelOpen: boolean;
  authError: string | null;
  savedPhone: string | null;
  rememberMe: boolean;
  
  // Toast Notifications
  toasts: Toast[];
  
  // Editing state (for unsaved changes warning)
  hasUnsavedChanges: boolean;
  
  // Pipeline
  lastPipelineRun: number | null;

  // Telemetry
  autoReportErrors: boolean;
}

interface AppActions {
  // Navigation
  setCurrentView: (view: ViewType) => void;
  
  // Engine Status
  setEngineStatus: (status: EngineStatus) => void;
  setSyncProgress: (progress: SyncProgress | null) => void;
  setLastSyncTime: (time: Date | null) => void;
  setLastPipelineRun: (timestamp: number | null) => void;
  
  // Telemetry
  setAutoReportErrors: (enabled: boolean) => void;
  
  // Notifications
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
  
  // Portfolio
  setActivePortfolioId: (id: number) => void;
  
  // Auth Actions
  openAuthPanel: () => void;
  closeAuthPanel: () => void;
  setAuthState: (state: AuthState) => void;
  setAuthError: (error: string | null) => void;
  setSavedPhone: (phone: string | null) => void;
  setRememberMe: (remember: boolean) => void;
  
  // Compound Actions
  startSync: () => void;
  completeSync: () => void;
  failSync: (error: string) => void;
  
  // Toast Actions
  addToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
  
  // Editing state
  setHasUnsavedChanges: (hasChanges: boolean) => void;
}

type AppStore = AppState & AppActions;

// =============================================================================
// Initial State
// =============================================================================

const initialState: AppState = {
  currentView: 'dashboard',
  engineStatus: 'disconnected',
  syncProgress: null,
  lastSyncTime: null,
  notifications: [],
  activePortfolioId: 1, // Default portfolio
  
  // Auth State
  authState: 'idle',
  isAuthPanelOpen: false,
  authError: null,
  savedPhone: null,
  rememberMe: false,
  
  // Toast Notifications
  toasts: [],
  
  // Editing state
  hasUnsavedChanges: false,
  
  // Pipeline
  lastPipelineRun: null,

  // Telemetry
  autoReportErrors: true,
};

// =============================================================================
// Store Implementation
// =============================================================================

export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Navigation
      setCurrentView: (view) => set({ currentView: view }, false, 'setCurrentView'),

      // Engine Status
      setEngineStatus: (status) => set({ engineStatus: status }, false, 'setEngineStatus'),
      
      setSyncProgress: (progress) => set({ syncProgress: progress }, false, 'setSyncProgress'),
      
      setLastSyncTime: (time) => set({ lastSyncTime: time }, false, 'setLastSyncTime'),

      setLastPipelineRun: (timestamp) => set({ lastPipelineRun: timestamp }, false, 'setLastPipelineRun'),

      // Telemetry
      setAutoReportErrors: (enabled) => set({ autoReportErrors: enabled }, false, 'setAutoReportErrors'),

      // Notifications
      addNotification: (notification) => {
        const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        set(
          (state) => ({
            notifications: [...state.notifications, { ...notification, id }],
          }),
          false,
          'addNotification'
        );
        
        // Auto-dismiss if duration is set
        if (notification.duration) {
          setTimeout(() => {
            get().dismissNotification(id);
          }, notification.duration);
        }
      },
      
      dismissNotification: (id) =>
        set(
          (state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
          }),
          false,
          'dismissNotification'
        ),
      
      clearNotifications: () => set({ notifications: [] }, false, 'clearNotifications'),

      // Portfolio
      setActivePortfolioId: (id) => set({ activePortfolioId: id }, false, 'setActivePortfolioId'),

      // Auth Actions
      openAuthPanel: () => set({ isAuthPanelOpen: true }, false, 'openAuthPanel'),
      
      closeAuthPanel: () => set({ 
        isAuthPanelOpen: false, 
        authError: null 
      }, false, 'closeAuthPanel'),
      
      setAuthState: (state) => set({ authState: state }, false, 'setAuthState'),
      
      setAuthError: (error) => set({ authError: error }, false, 'setAuthError'),
      
      setSavedPhone: (phone) => set({ savedPhone: phone }, false, 'setSavedPhone'),
      
      setRememberMe: (remember) => set({ rememberMe: remember }, false, 'setRememberMe'),

      // Compound Actions
      startSync: () =>
        set(
          {
            engineStatus: 'processing',
            syncProgress: { status: 'syncing', progress: 0, message: 'Starting sync...' },
          },
          false,
          'startSync'
        ),

      completeSync: () =>
        set(
          {
            engineStatus: 'idle',
            syncProgress: { status: 'complete', progress: 100, message: 'Sync complete!' },
            lastSyncTime: new Date(),
          },
          false,
          'completeSync'
        ),

      failSync: (error) =>
        set(
          {
            engineStatus: 'error',
            syncProgress: { status: 'error', progress: 0, message: error },
          },
          false,
          'failSync'
        ),

      // Toast Actions
      addToast: (toast) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const duration = toast.duration ?? 4000;
        
        set(
          (state) => ({
            toasts: [...state.toasts, { ...toast, id }],
          }),
          false,
          'addToast'
        );
        
        // Auto-dismiss after duration
        if (duration > 0) {
          setTimeout(() => {
            get().dismissToast(id);
          }, duration);
        }
      },
      
      dismissToast: (id) =>
        set(
          (state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
          }),
          false,
          'dismissToast'
        ),
      
      clearToasts: () => set({ toasts: [] }, false, 'clearToasts'),
      
      // Editing state
      setHasUnsavedChanges: (hasChanges) => 
        set({ hasUnsavedChanges: hasChanges }, false, 'setHasUnsavedChanges'),
    }),
    { name: 'AppStore' }
  )
);

// =============================================================================
// Selector Hooks (for optimized re-renders)
// =============================================================================

export const useCurrentView = () => useAppStore((state) => state.currentView);
export const useEngineStatus = () => useAppStore((state) => state.engineStatus);
export const useSyncProgress = () => useAppStore((state) => state.syncProgress);
export const useNotifications = () => useAppStore((state) => state.notifications);
export const useActivePortfolioId = () => useAppStore((state) => state.activePortfolioId);

// Auth selectors
export const useAuthState = () => useAppStore((state) => state.authState);
export const useIsAuthPanelOpen = () => useAppStore((state) => state.isAuthPanelOpen);
export const useAuthError = () => useAppStore((state) => state.authError);
export const useSavedPhone = () => useAppStore((state) => state.savedPhone);
export const useRememberMe = () => useAppStore((state) => state.rememberMe);

// Auth actions
export const useOpenAuthPanel = () => useAppStore((state) => state.openAuthPanel);
export const useCloseAuthPanel = () => useAppStore((state) => state.closeAuthPanel);
export const useSetAuthState = () => useAppStore((state) => state.setAuthState);

// Toast selectors and actions
export const useToasts = () => useAppStore((state) => state.toasts);
export const useAddToast = () => useAppStore((state) => state.addToast);
export const useDismissToast = () => useAppStore((state) => state.dismissToast);

// Telemetry
export const useAutoReportErrors = () => useAppStore((state) => state.autoReportErrors);
export const useSetAutoReportErrors = () => useAppStore((state) => state.setAutoReportErrors);
