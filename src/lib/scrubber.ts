/**
 * Frontend PII Scrubber
 *
 * Mirrors the logic in portfolio_src/core/reporter.py for frontend-only crashes.
 *
 * SECURITY: All patterns designed to avoid ReDoS (no nested quantifiers).
 * Patterns use possessive-style matching where possible by limiting repetition bounds.
 */

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
 * SHA-256 hash function (synchronous, pure JS implementation).
 * Aligned with backend hashlib.sha256() for consistent ISIN hashing.
 *
 * Returns first 8 characters of hex digest to match backend format.
 */
function sha256Hash(str: string): string {
  // SHA-256 constants: first 32 bits of fractional parts of cube roots of first 64 primes
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]

  // Initial hash values: first 32 bits of fractional parts of square roots of first 8 primes
  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  // Pre-processing: convert string to bytes and add padding
  const utf8 = new TextEncoder().encode(str)
  const msgLen = utf8.length
  const bitLen = msgLen * 8

  // Padding: 1 bit, then zeros, then 64-bit length
  // Total length must be multiple of 64 bytes (512 bits)
  const totalLen = Math.ceil((msgLen + 9) / 64) * 64
  const padded = new Uint8Array(totalLen)
  padded.set(utf8)
  padded[msgLen] = 0x80
  // Write bit length as big-endian 64-bit at end (only lower 32 bits needed for reasonable inputs)
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength)
  view.setUint32(totalLen - 4, bitLen, false)

  // Process each 512-bit (64-byte) chunk
  const rotr = (n: number, x: number) => ((x >>> n) | (x << (32 - n))) >>> 0
  const ch = (x: number, y: number, z: number) => ((x & y) ^ (~x & z)) >>> 0
  const maj = (x: number, y: number, z: number) => ((x & y) ^ (x & z) ^ (y & z)) >>> 0
  const sigma0 = (x: number) => (rotr(2, x) ^ rotr(13, x) ^ rotr(22, x)) >>> 0
  const sigma1 = (x: number) => (rotr(6, x) ^ rotr(11, x) ^ rotr(25, x)) >>> 0
  const gamma0 = (x: number) => (rotr(7, x) ^ rotr(18, x) ^ (x >>> 3)) >>> 0
  const gamma1 = (x: number) => (rotr(17, x) ^ rotr(19, x) ^ (x >>> 10)) >>> 0

  for (let i = 0; i < padded.length; i += 64) {
    const w = new Uint32Array(64)

    // Copy chunk into first 16 words
    for (let j = 0; j < 16; j++) {
      w[j] = view.getUint32(i + j * 4, false)
    }

    // Extend to 64 words
    for (let j = 16; j < 64; j++) {
      w[j] = (gamma1(w[j - 2]) + w[j - 7] + gamma0(w[j - 15]) + w[j - 16]) >>> 0
    }

    // Initialize working variables
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7

    // Main loop
    for (let j = 0; j < 64; j++) {
      const t1 = (h + sigma1(e) + ch(e, f, g) + K[j] + w[j]) >>> 0
      const t2 = (sigma0(a) + maj(a, b, c)) >>> 0
      h = g
      g = f
      f = e
      e = (d + t1) >>> 0
      d = c
      c = b
      b = a
      a = (t1 + t2) >>> 0
    }

    // Add compressed chunk to hash
    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  // Return first 8 hex chars (matches backend: hexdigest()[:8])
  return h0.toString(16).padStart(8, '0')
}

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
    return `[ASSET_HASH_${sha256Hash(match)}]`
  })

  return scrubbed
}

export function scrubObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return typeof obj === 'string' ? scrubText(obj) : obj
  }

  if (Array.isArray(obj)) {
    return obj.map(scrubObject)
  }

  const scrubbed: any = {}
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
