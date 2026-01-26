/**
 * Frontend PII Scrubber
 *
 * Mirrors the logic in portfolio_src/core/reporter.py for frontend-only crashes.
 *
 * SECURITY: All patterns designed to avoid ReDoS (no nested quantifiers).
 * Patterns use possessive-style matching where possible by limiting repetition bounds.
 */

import { sha256 } from 'js-sha256'

// Maximum input length to prevent DoS attacks via extremely long strings
const MAX_INPUT_LENGTH = 100_000

/**
 * PII_PATTERNS order is critical!
 *
 * Patterns are applied in order. More specific patterns (credit cards, SSN, IP)
 * MUST come before the general PHONE pattern which could otherwise match them.
 */
export const PII_PATTERNS = [
  // === HIGH SPECIFICITY PATTERNS (order independent) ===

  // IBAN: Country code (2 letters) + check digits (2 numbers) + BBAN (up to 30 alphanumeric)
  { pattern: /[A-Z]{2}[0-9]{2}[A-Z0-9 ]{12,30}/g, replacement: '[IBAN]' },

  // Email: Simplified pattern avoiding ReDoS-prone nested quantifiers
  {
    pattern: /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,10}\b/g,
    replacement: '[EMAIL]',
  },

  // JWT Token: Base64url encoded header.payload.signature
  {
    pattern: /eyJ[A-Za-z0-9_-]{10,500}\.[A-Za-z0-9_-]{10,1000}\.?[A-Za-z0-9_+/=-]{0,500}/g,
    replacement: '[TOKEN]',
  },

  // Sensitive key-value pairs (API keys, passwords, etc.)
  {
    pattern:
      /(?:key|secret|password|token|auth|bearer|api[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,128}['"]?/gi,
    replacement: '[SENSITIVE_DATA]',
  },

  // === NUMERIC PATTERNS - Order matters! More specific before general ===

  // Credit Cards: Major card networks (Visa, MC, Amex, Discover)
  // MUST come before PHONE - these look like phone numbers but are card numbers
  // Visa: 4xxx, MC: 51-55xx, Amex: 34/37xx, Discover: 6011/65xx
  {
    pattern:
      /\b(?:4[0-9]{3}|5[1-5][0-9]{2}|6(?:011|5[0-9]{2})|3[47][0-9]{2}|3(?:0[0-5]|[68][0-9])[0-9])[ -]?[0-9]{4}[ -]?[0-9]{4}[ -]?[0-9]{1,7}\b/g,
    replacement: '[CREDIT_CARD]',
  },

  // IPv4 Address: MUST come before PHONE - dots distinguish from phone numbers
  {
    pattern:
      /\b(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    replacement: '[IP_ADDRESS]',
  },

  // IPv6 Address: Simplified pattern for common formats
  { pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, replacement: '[IP_ADDRESS]' },
  { pattern: /\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b/g, replacement: '[IP_ADDRESS]' },
  { pattern: /\b::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}\b/g, replacement: '[IP_ADDRESS]' },

  // US Social Security Number: XXX-XX-XXXX (requires dashes or spaces for specificity)
  // Without separators, it's too ambiguous with other 9-digit numbers
  { pattern: /\b[0-9]{3}[- ][0-9]{2}[- ][0-9]{4}\b/g, replacement: '[SSN]' },

  // Phone Numbers: MUST come LAST among numeric patterns (most general)
  // Requires at least one separator (space, dash, dot, or parens) to distinguish from other numbers
  // Matches: +1-234-567-8900, (123) 456-7890, 123.456.7890, +49 123 456 7890
  {
    pattern:
      /(?:\+[0-9]{1,3}[ -]?)?(?:\([0-9]{1,4}\)[ -]?|[0-9]{1,4}[ .-])[0-9]{1,4}[ .-][0-9]{1,4}(?:[ .-][0-9]{1,6})?/g,
    replacement: '[PHONE]',
  },

  // === PATH PATTERNS ===

  // File Paths (Unix): /home/user/documents, /etc/passwd, etc.
  // Excludes common safe paths like /api, /v1, etc.
  {
    pattern:
      /(?:^|[\s"'`])(?:\/(?:home|Users|tmp|var|etc|root|opt|private)[/][A-Za-z0-9._/-]{1,200})/g,
    replacement: ' [FILE_PATH]',
  },

  // File Paths (Windows): C:\Users\..., D:\Documents\..., etc.
  {
    pattern:
      /\b[A-Za-z]:\\(?:Users|Documents|Desktop|AppData|Windows|Program Files)[\\A-Za-z0-9._ -]{1,200}/gi,
    replacement: '[FILE_PATH]',
  },
]

export const ISIN_PATTERN = /\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g

/**
 * Scrub PII patterns from text.
 *
 * SECURITY: Input is truncated at MAX_INPUT_LENGTH to prevent DoS attacks.
 * All regex patterns are designed to avoid catastrophic backtracking (ReDoS).
 */
export function scrubText(text: string): string {
  if (!text) return ''

  // Truncate extremely long inputs to prevent DoS via regex processing
  let scrubbed =
    text.length > MAX_INPUT_LENGTH ? text.slice(0, MAX_INPUT_LENGTH) + '[TRUNCATED]' : text

  for (const { pattern, replacement } of PII_PATTERNS) {
    // Reset lastIndex for global patterns to ensure clean matching
    pattern.lastIndex = 0
    scrubbed = scrubbed.replace(pattern, replacement)
  }

  // Reset lastIndex for ISIN pattern
  ISIN_PATTERN.lastIndex = 0
  scrubbed = scrubbed.replace(ISIN_PATTERN, (match) => {
    // Use first 8 characters of hex digest to match backend format
    return `[ASSET_HASH_${sha256(match).substring(0, 8)}]`
  })

  return scrubbed
}

export function scrubObject(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? scrubText(obj) : obj
  }

  if (Array.isArray(obj)) {
    return obj.map(scrubObject)
  }

  const scrubbed: Record<string, unknown> = {}
  const SENSITIVE_KEYS = ['quantity', 'value', 'price', 'cost', 'pnl', 'amount', 'balance']

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
      scrubbed[key] = '[REDACTED_VALUE]'
      continue
    }

    scrubbed[key] = scrubObject(value)
  }

  return scrubbed
}
