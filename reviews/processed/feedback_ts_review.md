# Code Review: src/lib/api/feedback.ts

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**Result**: PASSED (2 Medium, 3 Low, 2 Info)

---

## [MEDIUM] User Feedback Message Not Scrubbed for PII

> User-submitted feedback may contain sensitive information that gets posted to GitHub issues

**File**: `src/lib/api/feedback.ts:48-57`  
**Category**: Security  
**Severity**: Medium  

### Description

The `sendFeedback` function sends user messages directly to the Cloudflare Worker without PII scrubbing. While `ErrorBoundary` correctly uses `scrubObject()` for crash reports (critical type), the `FeedbackDialog` component sends user-typed messages directly.

Users may inadvertently include:
- Account numbers or credentials they're having issues with
- Email addresses when describing problems
- Phone numbers from 2FA issues
- ISINs/portfolio data when reporting bugs

This data then appears in public GitHub issues.

### Current Code

```typescript
const requestBody = JSON.stringify({
  ...payload,
  metadata: {
    ...payload.metadata,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    version: import.meta.env.VITE_APP_VERSION || 'dev',
    platform: platformName,
  },
});
```

### Suggested Fix

```typescript
import { scrubText, scrubObject } from '@/lib/scrubber';

// ... in sendFeedback function

const scrubbedPayload = {
  type: payload.type,
  message: scrubText(payload.message),
  metadata: scrubObject({
    ...payload.metadata,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    version: import.meta.env.VITE_APP_VERSION || 'dev',
    platform: platformName,
  }),
};

const requestBody = JSON.stringify(scrubbedPayload);
```

### Verification

1. Submit feedback containing test IBAN: `DE89370400440532013000`
2. Verify the GitHub issue shows `[IBAN]` instead
3. Run `npm run test` after adding unit tests

---

## [MEDIUM] No Request Timeout on Fetch

> Network request could hang indefinitely if server doesn't respond

**File**: `src/lib/api/feedback.ts:59-65`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `fetch()` call has no timeout configured. If the Cloudflare Worker is slow or unresponsive, the UI will show "Sending..." indefinitely with no way to recover.

### Current Code

```typescript
const response = await fetch(`${workerUrl}/feedback`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: requestBody,
});
```

### Suggested Fix

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

try {
  const response = await fetch(`${workerUrl}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: requestBody,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  
  // ... rest of handling
} catch (error) {
  clearTimeout(timeoutId);
  if (error instanceof Error && error.name === 'AbortError') {
    throw new Error('Request timed out. Please try again.');
  }
  throw error;
}
```

### Verification

1. Test with worker URL pointing to a non-responsive server
2. Verify timeout fires after 15 seconds
3. Verify error message is user-friendly

---

## [LOW] Response JSON Parsing Not Guarded

> Malformed server response could cause unhandled exception

**File**: `src/lib/api/feedback.ts:73`  
**Category**: Correctness  
**Severity**: Low  

### Description

If the server returns a 200 OK but with invalid JSON (edge case), `response.json()` will throw an unhandled exception. Also, no validation that the response has `issue_url` property.

### Current Code

```typescript
const result = await response.json();
console.log('[Feedback] Success! Issue created:', result.issue_url);
return result;
```

### Suggested Fix

```typescript
let result: unknown;
try {
  result = await response.json();
} catch {
  throw new Error('Invalid response from server');
}

if (!result || typeof result !== 'object' || !('issue_url' in result)) {
  throw new Error('Unexpected response format from server');
}

return result as FeedbackResponse;
```

### Verification

1. Mock server to return invalid JSON
2. Verify graceful error handling

---

## [LOW] Debug Console Logs in Production

> Debug logging should be conditional or removed

**File**: `src/lib/api/feedback.ts:33-36, 74`  
**Category**: Maintainability  
**Severity**: Low  

### Description

Console.log statements for debugging are included in production code. While not harmful, they add noise to browser console and leak implementation details.

### Current Code

```typescript
console.log('[Feedback] Sending feedback...', { 
  type: payload.type, 
  workerUrl: workerUrl ? `${workerUrl.substring(0, 30)}...` : 'NOT SET'
});
// ...
console.log('[Feedback] Success! Issue created:', result.issue_url);
```

### Suggested Fix

Option 1: Remove debug logs entirely
Option 2: Use conditional logging based on environment

```typescript
const isDev = import.meta.env.DEV;

if (isDev) {
  console.log('[Feedback] Sending feedback...', { type: payload.type });
}
```

### Verification

1. Build for production: `npm run build`
2. Check browser console for absence of debug logs

---

## [LOW] No Input Validation Before API Call

> Type and message fields not validated at runtime

**File**: `src/lib/api/feedback.ts:30`  
**Category**: Correctness  
**Severity**: Low  

### Description

The function accepts a `FeedbackPayload` but doesn't validate the contents at runtime. While TypeScript provides compile-time safety, runtime validation would catch:
- Empty messages (though FeedbackDialog checks this)
- Invalid type values if called programmatically

### Current Code

```typescript
export async function sendFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  // ... no validation
```

### Suggested Fix

```typescript
export async function sendFeedback(payload: FeedbackPayload): Promise<FeedbackResponse> {
  // Runtime validation
  if (!payload.message?.trim()) {
    throw new Error('Feedback message is required');
  }
  
  const validTypes: FeedbackType[] = ['critical', 'functional', 'ui_ux', 'feature'];
  if (!validTypes.includes(payload.type)) {
    throw new Error(`Invalid feedback type: ${payload.type}`);
  }
  
  const workerUrl = import.meta.env.VITE_WORKER_URL;
  // ...
```

### Verification

1. Add unit test calling `sendFeedback({ type: 'invalid' as any, message: '' })`
2. Verify appropriate error thrown

---

## [INFO] No Unit Tests for Feedback API

> Module has no test coverage

**File**: `src/lib/api/feedback.ts`  
**Category**: Testing  
**Severity**: Info  

### Description

No test file exists for the feedback API module. Given it handles user data and external API calls, tests would help catch regressions.

### Suggested Tests

```typescript
// src/lib/api/feedback.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendFeedback } from './feedback';

describe('sendFeedback', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubEnv('VITE_WORKER_URL', 'https://test.workers.dev');
  });

  it('should scrub PII from message', async () => {
    // Test IBAN scrubbing
  });

  it('should timeout after 15 seconds', async () => {
    // Test timeout behavior
  });

  it('should return mock response when worker URL not configured', async () => {
    vi.stubEnv('VITE_WORKER_URL', '');
    const result = await sendFeedback({ type: 'functional', message: 'test' });
    expect(result.issue_url).toContain('mock');
  });

  it('should throw on server error', async () => {
    // Test error handling
  });
});
```

---

## [INFO] Consider Adding Retry Logic for Transient Failures

> Network failures could be retried automatically

**File**: `src/lib/api/feedback.ts`  
**Category**: Correctness  
**Severity**: Info  

### Description

Transient network failures (503, network timeout) could be automatically retried once or twice before showing error to user. This is a nice-to-have for improved UX.

### Consideration

Implement exponential backoff with 1-2 retries for 5xx errors and network failures. Not critical since user can manually retry.

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| Critical | 0 | - |
| High | 0 | - |
| Medium | 2 | PII not scrubbed, no timeout |
| Low | 3 | JSON parsing, console logs, input validation |
| Info | 2 | No tests, retry logic suggestion |

**Verdict**: PASSED - No blocking issues. Medium findings should be addressed but don't block functionality.
