import type { StateCreator } from 'zustand'
import type { AuthState } from '../../../types'

// =============================================================================
// Slice Interface
// =============================================================================

export interface AuthSliceState {
  authState: AuthState
  isAuthPanelOpen: boolean
  authError: string | null
  savedPhone: string | null
  rememberMe: boolean
}

export interface AuthSliceActions {
  openAuthPanel: () => void
  closeAuthPanel: () => void
  setAuthState: (state: AuthState) => void
  setAuthError: (error: string | null) => void
  setSavedPhone: (phone: string | null) => void
  setRememberMe: (remember: boolean) => void
}

export type AuthSlice = AuthSliceState & AuthSliceActions

// =============================================================================
// Initial State
// =============================================================================

export const authInitialState: AuthSliceState = {
  authState: 'idle',
  isAuthPanelOpen: false,
  authError: null,
  savedPhone: null,
  rememberMe: false,
}

// =============================================================================
// Slice Creator
// =============================================================================

export const createAuthSlice: StateCreator<AuthSlice, [], [], AuthSlice> = (set) => ({
  ...authInitialState,

  openAuthPanel: () => set({ isAuthPanelOpen: true }),

  closeAuthPanel: () =>
    set({
      isAuthPanelOpen: false,
      authError: null,
    }),

  setAuthState: (state) => set({ authState: state }),

  setAuthError: (error) => set({ authError: error }),

  setSavedPhone: (phone) => set({ savedPhone: phone }),

  setRememberMe: (remember) => set({ rememberMe: remember }),
})
