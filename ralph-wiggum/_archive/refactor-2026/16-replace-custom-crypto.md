# Spec: Replace Custom Crypto with Web Crypto API

> **Goal**: Replace the custom, pure-JS SHA-256 implementation with the browser-native Web Crypto API to ensure security and performance.
> **Estimated Time**: 15 minutes.
> **Priority**: LOW

## 1. Overview

`src/lib/scrubber.ts` currently contains a manual implementation of the SHA-256 hashing algorithm. This violates the "No Custom Crypto" rule. While it's only used for PII masking (not auth), using standard libraries is safer and faster.

### Rule Reference
`rules/security.md` Section 2 (Authentication & Authorization):
> "No Custom Crypto: Use standard libraries (bcrypt, Argon2, WebCrypto API). NEVER implement hashing yourself."

## 2. Current Violation

**File:** `src/lib/scrubber.ts`
**Lines:** 106-203 (approx)

The file implements `sha256Hash(str)` using manual bitwise operations. This is error-prone and slower than native implementations.

## 3. Implementation Steps

### 3.1 Use crypto.subtle

Since `crypto.subtle` is async, and `scrubber.ts` currently exports synchronous functions (`scrubText`), we have two options:

**Option A: Async Scrubbing (Preferred if feasible)**
Update `scrubText` to return `Promise<string>`. This is the "correct" way but ripples through the app.

**Option B: Synchronous Sync (Pragmatic)**
Since this is ONLY for scrubbing logs/text and not for high-security passwords, and the frontend is React, we can use a tiny, audited library like `js-sha256` OR keep the custom one if we strictly document it's non-cryptographic.

**Decision**: The rule says "No Custom Crypto". To be compliant without rewriting the entire logging architecture (which expects sync logging), we should use a standard library if async is impossible.

However, logging is often fire-and-forget. Let's see if we can make the specific hashing part async or use a sync library.

Let's use `crypto.subtle` where possible, but if we need sync, use `spark-md5` or similar reputable lib. Actually, for *scrubbing* specifically (ISIN masking), we need consistency with the Python backend.

**Better Approach**:
The `scrubber.ts` is likely used in `logger.ts`. `logger.info` is synchronous. Making it async is a pain.

**Proposed Solution**: Use `sha.js` or `js-sha256` (popular, tested packages) instead of maintaining our own implementation. This satisfies "Standard Libraries".

### 3.2 Install Dependency

```bash
pnpm add js-sha256
pnpm add -D @types/js-sha256
```

### 3.3 Refactor Scrubber

**File:** `src/lib/scrubber.ts`

```typescript
import { sha256 } from 'js-sha256'

// Remove the manual 100-line implementation of sha256Hash

// Update usage
export const ISIN_PATTERN = /\b[A-Z]{2}[A-Z0-9]{9}[0-9]\b/g

// ...

// Reset lastIndex for ISIN pattern
ISIN_PATTERN.lastIndex = 0
scrubbed = scrubbed.replace(ISIN_PATTERN, (match) => {
  // Use the library
  const hash = sha256(match).substring(0, 8)
  return `[ASSET_HASH_${hash}]`
})
```

## 4. Verification

### 4.1 Unit Test
Ensure `src/lib/scrubber.test.ts` passes and produces the same hash (or at least *consistent* hashes) for the same input.

### 4.2 Bundle Size
Check that `js-sha256` doesn't bloat the bundle significantly (it's very small).

## 5. Acceptance Criteria

- [ ] Manual SHA-256 implementation removed from `src/lib/scrubber.ts`
- [ ] `js-sha256` (or equivalent) used for hashing
- [ ] Tests pass
- [ ] No "custom crypto" warning in future audits

## 6. Dependencies

```json
"dependencies": {
  "js-sha256": "^0.10.1"
}
```
