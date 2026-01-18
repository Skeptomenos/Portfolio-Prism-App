/**
 * Error Message Sanitization
 *
 * Provides utilities for sanitizing error messages before display to users.
 * Removes internal codes, session identifiers, tokens, and other sensitive
 * information that could leak implementation details or security-sensitive data.
 *
 * WHY: Backend error messages may contain:
 * - Session IDs that reveal timing information
 * - Internal error codes that expose architecture
 * - Long numeric IDs (user IDs, transaction IDs)
 * - Token fragments from auth failures
 * - Stack traces or file paths
 *
 * This provides defense-in-depth by sanitizing before UI display.
 */

/**
 * Sanitizes an error message for safe display to users.
 *
 * Removes:
 * - Bracketed codes like [ERR_001] or [INTERNAL]
 * - Session identifiers (session_id=xxx)
 * - Token values (token=xxx)
 * - Long numeric IDs (10+ digits) - likely internal IDs
 * - Stack trace patterns
 * - File paths
 *
 * @param message - Raw error message from backend or caught exception
 * @returns Sanitized message safe for user display
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message) return 'An error occurred'

  return (
    message
      // Remove bracketed codes like [ERR_001], [INTERNAL], [AUTH_FAILED]
      .replace(/\[[A-Z0-9_-]+\]/gi, '')
      // Remove session identifiers
      .replace(/session_id\s*[=:]\s*\S+/gi, '')
      // Remove token values
      .replace(/token\s*[=:]\s*\S+/gi, '')
      // Mask long numeric IDs (10+ digits) - likely internal identifiers
      .replace(/\b\d{10,}\b/g, '[ID]')
      // Remove stack trace patterns (at Module.xxx, at file:line)
      .replace(/\bat\s+\S+:\d+/gi, '')
      .replace(/\bat\s+[A-Za-z_$][\w$]*\s*\(/gi, '')
      // Remove file paths (Unix and Windows style)
      .replace(/(?:\/[\w.-]+)+\.\w+/g, '[PATH]')
      .replace(/(?:[A-Za-z]:\\[\w\\.-]+)+/g, '[PATH]')
      // Clean up extra whitespace
      .replace(/\s{2,}/g, ' ')
      .trim() || 'An error occurred'
  )
}
