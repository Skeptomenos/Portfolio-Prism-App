/**
 * Tests for error message sanitization
 */

import { describe, it, expect } from 'vitest'
import { sanitizeErrorMessage } from './errors'

describe('sanitizeErrorMessage', () => {
  describe('basic functionality', () => {
    it('returns default message for empty input', () => {
      expect(sanitizeErrorMessage('')).toBe('An error occurred')
    })

    it('returns default message for null/undefined input', () => {
      // @ts-expect-error - testing edge case
      expect(sanitizeErrorMessage(null)).toBe('An error occurred')
      // @ts-expect-error - testing edge case
      expect(sanitizeErrorMessage(undefined)).toBe('An error occurred')
    })

    it('passes through clean error messages unchanged', () => {
      expect(sanitizeErrorMessage('Connection failed')).toBe('Connection failed')
      expect(sanitizeErrorMessage('Invalid credentials')).toBe('Invalid credentials')
    })
  })

  describe('removes bracketed codes', () => {
    it('removes single bracketed code', () => {
      expect(sanitizeErrorMessage('[ERR_001] Connection failed')).toBe('Connection failed')
    })

    it('removes multiple bracketed codes', () => {
      expect(sanitizeErrorMessage('[AUTH] [ERR_002] Login failed')).toBe('Login failed')
    })

    it('removes mixed case bracketed codes', () => {
      expect(sanitizeErrorMessage('[Internal_Error] Something broke')).toBe('Something broke')
    })
  })

  describe('removes session identifiers', () => {
    it('removes session_id with equals sign', () => {
      expect(sanitizeErrorMessage('Error session_id=abc123xyz')).toBe('Error')
    })

    it('removes session_id with colon', () => {
      expect(sanitizeErrorMessage('Failed session_id: xyz789')).toBe('Failed')
    })

    it('handles session_id in middle of message', () => {
      expect(sanitizeErrorMessage('Request failed session_id=test123 try again')).toBe(
        'Request failed try again'
      )
    })
  })

  describe('removes token values', () => {
    it('removes token with equals sign', () => {
      expect(sanitizeErrorMessage('Auth token=eyJhbGciOiJIUzI1NiJ9 expired')).toBe('Auth expired')
    })

    it('removes token with colon', () => {
      expect(sanitizeErrorMessage('Invalid token: abc123')).toBe('Invalid')
    })
  })

  describe('masks long numeric IDs', () => {
    it('masks 10+ digit numbers', () => {
      expect(sanitizeErrorMessage('User 1234567890 not found')).toBe('User [ID] not found')
    })

    it('masks very long numeric IDs', () => {
      expect(sanitizeErrorMessage('Transaction 123456789012345 failed')).toBe(
        'Transaction [ID] failed'
      )
    })

    it('preserves shorter numbers', () => {
      expect(sanitizeErrorMessage('Error code 500')).toBe('Error code 500')
      expect(sanitizeErrorMessage('Retry in 30 seconds')).toBe('Retry in 30 seconds')
    })
  })

  describe('removes file paths', () => {
    it('removes Unix-style paths', () => {
      expect(sanitizeErrorMessage('Error in /Users/john/app/src/module.ts')).toBe('Error in [PATH]')
    })

    it('removes nested Unix paths', () => {
      expect(sanitizeErrorMessage('Failed at /var/log/app/error.log line 42')).toBe(
        'Failed at [PATH] line 42'
      )
    })
  })

  describe('cleans up whitespace', () => {
    it('collapses multiple spaces', () => {
      expect(sanitizeErrorMessage('Error   with   spaces')).toBe('Error with spaces')
    })

    it('trims leading and trailing whitespace', () => {
      expect(sanitizeErrorMessage('  Error message  ')).toBe('Error message')
    })

    it('handles whitespace after removal', () => {
      expect(sanitizeErrorMessage('[ERR]   Connection   failed')).toBe('Connection failed')
    })
  })

  describe('complex error messages', () => {
    it('sanitizes message with multiple sensitive patterns', () => {
      const input = '[AUTH_FAIL] User 1234567890123 session_id=xyz token=abc failed at /app/auth.ts'
      const result = sanitizeErrorMessage(input)
      expect(result).toBe('User [ID] failed at [PATH]')
    })

    it('returns user-friendly message when all content removed', () => {
      const input = '[ERROR] session_id=test token=abc 1234567890123'
      const result = sanitizeErrorMessage(input)
      // After removing all sensitive data, should fall back to default
      expect(result).toBe('[ID]')
    })
  })
})
