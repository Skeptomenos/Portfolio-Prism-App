/**
 * Auth Feature Types
 *
 * Type definitions for Trade Republic authentication.
 * Re-exported from the central types for feature-local imports.
 */

// Re-export auth types from central types file
// This allows feature-local imports while maintaining single source of truth
export type {
  AuthState,
  AuthStatus,
  SessionCheck,
  AuthResponse,
  LogoutResponse,
  TRErrorCode,
} from '../../types'
