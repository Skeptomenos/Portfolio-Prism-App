/**
 * Auth Feature API
 *
 * Re-exports auth-related IPC functions from the central IPC module.
 * Follows FSD pattern where each feature owns its API surface.
 */

export {
  trGetAuthStatus,
  trCheckSavedSession,
  trGetStoredCredentials,
  trLogin,
  trLoginWithStoredCredentials,
  trSubmit2FA,
  trLogout,
} from '../../lib/ipc'
