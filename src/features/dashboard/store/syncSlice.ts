import type { StateCreator } from 'zustand'
import type { EngineStatus, SyncProgress } from '../../../types'

// =============================================================================
// Slice Interface
// =============================================================================

export interface SyncSliceState {
  engineStatus: EngineStatus
  syncProgress: SyncProgress | null
  lastSyncTime: Date | null
  lastPipelineRun: number | null
}

export interface SyncSliceActions {
  setEngineStatus: (status: EngineStatus) => void
  setSyncProgress: (progress: SyncProgress | null) => void
  setLastSyncTime: (time: Date | null) => void
  setLastPipelineRun: (timestamp: number | null) => void
  startSync: () => void
  completeSync: () => void
  failSync: (error: string) => void
}

export type SyncSlice = SyncSliceState & SyncSliceActions

// =============================================================================
// Initial State
// =============================================================================

export const syncInitialState: SyncSliceState = {
  engineStatus: 'disconnected',
  syncProgress: null,
  lastSyncTime: null,
  lastPipelineRun: null,
}

// =============================================================================
// Slice Creator
// =============================================================================

export const createSyncSlice: StateCreator<SyncSlice, [], [], SyncSlice> = (set) => ({
  ...syncInitialState,

  setEngineStatus: (status) => set({ engineStatus: status }),

  setSyncProgress: (progress) => set({ syncProgress: progress }),

  setLastSyncTime: (time) => set({ lastSyncTime: time }),

  setLastPipelineRun: (timestamp) => set({ lastPipelineRun: timestamp }),

  startSync: () =>
    set({
      engineStatus: 'processing',
      syncProgress: { status: 'syncing', progress: 0, message: 'Starting sync...' },
    }),

  completeSync: () =>
    set({
      engineStatus: 'idle',
      syncProgress: { status: 'complete', progress: 100, message: 'Sync complete!' },
      lastSyncTime: new Date(),
    }),

  failSync: (error) =>
    set({
      engineStatus: 'error',
      syncProgress: { status: 'error', progress: 0, message: error },
    }),
})
