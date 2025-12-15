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
import type { ViewType, EngineStatus, SyncProgress, Notification } from '../types';

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
}

interface AppActions {
  // Navigation
  setCurrentView: (view: ViewType) => void;
  
  // Engine Status
  setEngineStatus: (status: EngineStatus) => void;
  setSyncProgress: (progress: SyncProgress | null) => void;
  setLastSyncTime: (time: Date | null) => void;
  
  // Notifications
  addNotification: (notification: Omit<Notification, 'id'>) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
  
  // Portfolio
  setActivePortfolioId: (id: number) => void;
  
  // Compound Actions
  startSync: () => void;
  completeSync: () => void;
  failSync: (error: string) => void;
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
