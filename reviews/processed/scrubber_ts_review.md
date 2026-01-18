# Review: src/lib/scrubber.ts

**Date**: 2026-01-18  
**Reviewer**: Automated  
**Result**: PASSED (0 Critical, 0 High, 3 Medium, 2 Low, 2 Info)

---

## Summary

The PII scrubber provides a frontend defense layer for sanitizing sensitive data before error reporting. The implementation correctly mirrors the Python backend's `Scrubber` class but has a critical hash algorithm mismatch that could cause data correlation issues. No blocking issues found.

---

## [MEDIUM] Hash Algorithm Mismatch Between Frontend and Backend

> Frontend and backend produce different hashes for the same ISIN

**File**: `src/lib/scrubber.ts:17-25`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The frontend uses a simple djb2-style hash while the Python backend uses SHA-256. This means the same ISIN will produce different hash outputs between frontend and backend error reports, making it impossible to correlate assets across reports.

While not a security vulnerability (both approaches anonymize the data), it reduces the usefulness of error reports for debugging portfolio-specific issues.

### Current Code

```typescript
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}
```

### Suggested Fix

```typescript
async function sha256Hash(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 8);
}

// Note: This makes scrubText async, which may require refactoring callers
// Alternative: Use a synchronous SHA-256 implementation or accept the mismatch
```

### Verification

1. Compare hash output for test ISIN "US0378331005" (Apple Inc)
2. Verify frontend hash matches Python `Scrubber.hash_isin()` output
3. Update callers if async version is adopted

---

## [MEDIUM] Missing PII Patterns

> Some common PII types are not covered by the scrubber

**File**: `src/lib/scrubber.ts:7-13`  
**Category**: Security  
**Severity**: Medium  

### Description

The scrubber covers common patterns but misses several PII types that may appear in error contexts:

- Credit card numbers (16 digits with optional separators)
- German tax IDs (Steuer-ID, 11 digits)
- Social Security Numbers (XXX-XX-XXXX format)
- IP addresses (could reveal user network info)
- File paths (could contain usernames)

### Current Code

```typescript
export const PII_PATTERNS = [
  { pattern: /[A-Z]{2}[0-9]{2}(?:\s?[A-Z0-9]){12,30}/g, replacement: '[IBAN]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
  { pattern: /\+?[0-9]{1,4}[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}/g, replacement: '[PHONE]' },
  { pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, replacement: '[TOKEN]' },
  { pattern: /(?:key|secret|password|token|auth|bearer)\s*[:=]\s*['"]?[A-Za-z0-9-_]{16,}['"]?/gi, replacement: '[SENSITIVE_DATA]' },
];
```

### Suggested Fix

```typescript
export const PII_PATTERNS = [
  // Existing patterns...
  { pattern: /[A-Z]{2}[0-9]{2}(?:\s?[A-Z0-9]){12,30}/g, replacement: '[IBAN]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
  { pattern: /\+?[0-9]{1,4}[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}/g, replacement: '[PHONE]' },
  { pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, replacement: '[TOKEN]' },
  { pattern: /(?:key|secret|password|token|auth|bearer)\s*[:=]\s*['"]?[A-Za-z0-9-_]{16,}['"]?/gi, replacement: '[SENSITIVE_DATA]' },
  
  // Additional patterns for comprehensive coverage
  { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[CARD_NUMBER]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_ADDRESS]' },
  { pattern: /(?:\/Users\/|\/home\/|C:\\Users\\)[^\s:'"]+/g, replacement: '[FILE_PATH]' },
];
```

### Verification

1. Test with sample data containing credit card numbers
2. Test with file paths containing usernames
3. Ensure no false positives in normal portfolio data

---

## [MEDIUM] Potential ReDoS Vulnerability in Phone Pattern

> Complex phone regex may be vulnerable to catastrophic backtracking

**File**: `src/lib/scrubber.ts:10`  
**Category**: Security  
**Severity**: Medium  

### Description

The phone number regex uses multiple optional groups with greedy quantifiers. On maliciously crafted input, this could cause exponential backtracking (ReDoS), potentially freezing the UI during error reporting.

```typescript
/\+?[0-9]{1,4}[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}/g
```

### Impact

- Low probability in practice (requires malicious input in error context)
- If triggered, would freeze error reporting UI
- No security breach, just availability impact

### Suggested Fix

Consider using possessive quantifiers or atomic groups (not natively supported in JS), or add input length limits before regex processing:

```typescript
export function scrubText(text: string): string {
  if (!text) return '';
  
  // Limit input length to prevent ReDoS on absurdly long strings
  const MAX_LENGTH = 100000;
  let scrubbed = text.length > MAX_LENGTH ? text.substring(0, MAX_LENGTH) + '[TRUNCATED]' : text;
  
  for (const { pattern, replacement } of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  // ...
}
```

### Verification

1. Test with crafted input: `"+" + "0".repeat(10000)`
2. Measure execution time, should complete in <100ms

---

## [LOW] No Tests for Scrubber Module

> Critical security module lacks test coverage

**File**: `src/lib/scrubber.ts`  
**Category**: Testing  
**Severity**: Low  

### Description

The scrubber is a critical privacy component used in error reporting. It should have comprehensive tests covering:

- All PII pattern types (IBAN, email, phone, JWT, secrets)
- ISIN hashing
- Object recursion
- Edge cases (null, undefined, empty strings, deeply nested objects)
- The SENSITIVE_KEYS redaction

### Suggested Fix

Create `src/lib/scrubber.test.ts`:

```typescript
import { scrubText, scrubObject, PII_PATTERNS, ISIN_PATTERN } from './scrubber';

describe('scrubText', () => {
  it('should scrub IBAN numbers', () => {
    expect(scrubText('My IBAN is DE89370400440532013000')).toContain('[IBAN]');
  });

  it('should scrub email addresses', () => {
    expect(scrubText('Contact me at user@example.com')).toContain('[EMAIL]');
  });

  it('should scrub JWTs', () => {
    expect(scrubText('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'))
      .toContain('[TOKEN]');
  });

  it('should hash ISINs', () => {
    const result = scrubText('Asset ISIN: US0378331005');
    expect(result).toMatch(/\[ASSET_HASH_[a-f0-9]+\]/);
    expect(result).not.toContain('US0378331005');
  });
});

describe('scrubObject', () => {
  it('should redact sensitive keys', () => {
    const obj = { name: 'ETF', quantity: 100, price: 50.5 };
    const scrubbed = scrubObject(obj);
    expect(scrubbed.name).toBe('ETF');
    expect(scrubbed.quantity).toBe('[REDACTED_VALUE]');
    expect(scrubbed.price).toBe('[REDACTED_VALUE]');
  });

  it('should handle nested objects', () => {
    const obj = { user: { email: 'test@example.com' } };
    const scrubbed = scrubObject(obj);
    expect(scrubbed.user.email).toBe('[EMAIL]');
  });
});
```

### Verification

1. Run `npm test scrubber`
2. Verify all tests pass
3. Check coverage report

---

## [LOW] SENSITIVE_KEYS Uses Array Instead of Set

> Minor performance and consistency issue with Python implementation

**File**: `src/lib/scrubber.ts:53`  
**Category**: Maintainability  
**Severity**: Low  

### Description

Python uses a `set` for O(1) lookup, TypeScript uses an array with `includes()` for O(n) lookup. While functionally equivalent for small lists, this is a minor inconsistency.

### Current Code

```typescript
const SENSITIVE_KEYS = ['quantity', 'value', 'price', 'cost', 'pnl', 'amount', 'balance'];
// ...
if (SENSITIVE_KEYS.some(s => key.toLowerCase().includes(s))) {
```

### Suggested Fix

```typescript
const SENSITIVE_KEYS = new Set(['quantity', 'value', 'price', 'cost', 'pnl', 'amount', 'balance']);
// ...
const lowerKey = key.toLowerCase();
if ([...SENSITIVE_KEYS].some(s => lowerKey.includes(s))) {
```

### Verification

No functional change expected. Run existing tests.

---

## [INFO] Patterns Compiled Inline

> Regex patterns are recompiled on each function call

**File**: `src/lib/scrubber.ts:32-34`  
**Category**: Performance  
**Severity**: Info  

### Description

The regex patterns in `PII_PATTERNS` are defined at module level (good), but because they use the `g` flag, each call to `replace()` modifies the `lastIndex` property. This is fine for single-pass replace, but could cause subtle bugs if patterns were reused across calls without resetting.

Currently not a bug because `replace()` handles this correctly, but worth noting for maintainers.

### Observation

No action required. Just documenting for awareness.

---

## [INFO] Good Practice: Module Comment Explains Sync Requirement

> Positive finding

**File**: `src/lib/scrubber.ts:1-5`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The module header correctly documents that this code mirrors the Python `reporter.py` scrubber. This is good practice for maintaining consistency between frontend and backend sanitization.

```typescript
/**
 * Frontend PII Scrubber
 * 
 * Mirrors the logic in portfolio_src/core/reporter.py for frontend-only crashes.
 */
```

### Observation

Good documentation practice. No action required.

---

## Usage Review

The scrubber is correctly imported and used in `ErrorBoundary.tsx`:

1. Error metadata is scrubbed before sending to feedback API
2. User can preview scrubbed data before reporting
3. Auto-report mode respects telemetry settings

**Note**: `FeedbackDialog.tsx` does NOT use the scrubber for user-submitted feedback. This is acceptable because user feedback is intentional and users control what they write. However, the `metadata` object includes `lastSync` timestamp and `view` name which could be considered low-sensitivity context.

---

## Conclusion

The scrubber implementation is solid with no critical or high-severity issues. The hash algorithm mismatch (Medium) should be addressed for consistency, and the missing PII patterns (Medium) would strengthen privacy protection. The module would benefit from test coverage (Low).

**Verdict**: PASSED - No blocking issues
