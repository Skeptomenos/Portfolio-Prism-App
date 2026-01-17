# Code Review: src/lib/ipc.ts

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**File**: `src/lib/ipc.ts`  
**Lines**: 379  

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 3 |
| Info | 2 |

---

## [HIGH] Credentials Logged on Backend Errors

> Auth credentials (phone, PIN) are logged to the system database when tr_login fails

**File**: `src/lib/ipc.ts:67-72`  
**Category**: Security  
**Severity**: High  

### Description

When a backend error occurs, the `callCommand` function logs the entire payload to the system logs via `logEvent()`. For the `tr_login` command, this includes the user's phone number and PIN in plaintext. Even though the scrubber exists in `scrubber.ts`, it's not being applied here before logging.

This is particularly concerning because:
1. System logs may be persisted to SQLite
2. Error reports could be sent for diagnostics
3. Console.error also outputs the error which may include payload context

### Current Code

```typescript
// Log to system logs for auto-reporting
logEvent('ERROR', `Backend Error: ${errorMsg}`, { 
  command, 
  code: errorCode,
  payload  // <-- CREDENTIALS INCLUDED for tr_login!
}, 'pipeline', 'api_error');
```

### Suggested Fix

```typescript
import { scrubObject } from './scrubber';

// Scrub sensitive fields before logging
const safePayload = ['tr_login', 'tr_submit_2fa'].includes(command)
  ? { ...payload, phone: '[REDACTED]', pin: '[REDACTED]', code: '[REDACTED]' }
  : scrubObject(payload);

logEvent('ERROR', `Backend Error: ${errorMsg}`, { 
  command, 
  code: errorCode,
  payload: safePayload
}, 'pipeline', 'api_error');
```

### Verification

1. Add test case that verifies credentials are not logged
2. Check system_logs table after a failed tr_login
3. Review console output for credential exposure

---

## [MEDIUM] Hardcoded Development Token in Production Code

> Echo-Bridge token is hardcoded and may leak intent

**File**: `src/lib/ipc.ts:47`  
**Category**: Security  
**Severity**: Medium  

### Description

The Echo-Bridge token `'dev-echo-bridge-secret'` is hardcoded in the source. While this is only used in browser/dev mode (not Tauri production), it:
1. Exposes the security mechanism
2. Could accidentally be used in production debugging scenarios
3. Should use environment variables for configurability

### Current Code

```typescript
headers: { 
  'Content-Type': 'application/json',
  'X-Echo-Bridge-Token': 'dev-echo-bridge-secret'
},
```

### Suggested Fix

```typescript
headers: { 
  'Content-Type': 'application/json',
  'X-Echo-Bridge-Token': import.meta.env.VITE_ECHO_BRIDGE_TOKEN || 'dev-fallback'
},
```

### Verification

1. Verify env variable is set in dev environment
2. Ensure Vite config exposes the variable

---

## [MEDIUM] Silent Error Swallowing in setHiveContribution

> Errors are caught and swallowed without user notification

**File**: `src/lib/ipc.ts:363-365`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The `setHiveContribution` function catches errors and logs them, but doesn't rethrow or indicate failure to the caller. The user may think their preference was saved when it wasn't.

### Current Code

```typescript
export async function setHiveContribution(enabled: boolean): Promise<void> {
  try {
    await callCommand('set_hive_contribution', { enabled });
  } catch (error) {
    console.error('[IPC] set_hive_contribution failed:', error);
  }
}
```

### Suggested Fix

```typescript
export async function setHiveContribution(enabled: boolean): Promise<boolean> {
  try {
    await callCommand('set_hive_contribution', { enabled });
    return true;
  } catch (error) {
    console.error('[IPC] set_hive_contribution failed:', error);
    return false;
  }
}
```

### Verification

1. Update callers to check return value
2. Add UI feedback on failure

---

## [MEDIUM] Use of `any` Type Reduces Type Safety

> Several functions return `any`, losing type information

**File**: `src/lib/ipc.ts:280, 333, 345`  
**Category**: Maintainability  
**Severity**: Medium  

### Description

The functions `uploadHoldings`, `getPendingReviews`, and `getPipelineReport` return `any` instead of proper types. This bypasses TypeScript's type checking and could lead to runtime errors.

### Current Code

```typescript
export async function uploadHoldings(filePath: string, etfIsin: string): Promise<any> {
export async function getPendingReviews(): Promise<any[]> {
export async function getPipelineReport(): Promise<any> {
```

### Suggested Fix

Define proper types in `types/index.ts`:

```typescript
export interface UploadHoldingsResponse {
  success: boolean;
  recordsImported: number;
  errors?: string[];
}

export interface PendingReview {
  id: string;
  isin: string;
  suggestedName: string;
  confidence: number;
}

export interface PipelineReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastRun: string;
  errors: string[];
}
```

### Verification

1. Update TauriCommands interface
2. Verify types match backend responses

---

## [LOW] No Input Validation on trLogin Parameters

> Phone and PIN are passed directly without format validation

**File**: `src/lib/ipc.ts:221-231`  
**Category**: Security  
**Severity**: Low  

### Description

The `trLogin` function accepts phone and PIN without client-side validation. While the backend should validate, client-side validation improves UX and catches errors early.

### Suggested Fix

```typescript
export async function trLogin(
  phone: string,
  pin: string,
  remember: boolean = true
): Promise<AuthResponse> {
  // Basic validation
  if (!phone || !phone.match(/^\+?[0-9]{10,15}$/)) {
    throw new Error('Invalid phone number format');
  }
  if (!pin || !pin.match(/^[0-9]{4}$/)) {
    throw new Error('PIN must be 4 digits');
  }
  // ... existing code
}
```

---

## [LOW] Request ID Could Have Collisions

> Random ID generation is not guaranteed unique

**File**: `src/lib/ipc.ts:50-51`  
**Category**: Correctness  
**Severity**: Low  

### Description

Using `Math.floor(Math.random() * 1000000)` for request IDs could produce collisions. While unlikely to cause issues in practice, using a proper unique ID is better practice.

### Suggested Fix

```typescript
id: crypto.randomUUID(),
```

---

## [LOW] No Retry Logic for Transient Network Failures

> Single attempt with no retry for failed requests

**File**: `src/lib/ipc.ts:42-84`  
**Category**: Performance  
**Severity**: Low  

### Description

The Echo-Bridge fetch has no retry logic for transient failures. Network hiccups could cause unnecessary failures.

### Suggested Fix

Consider adding exponential backoff for non-auth commands.

---

## [INFO] Good Deduplication Pattern

> Request deduplication prevents duplicate concurrent requests

**File**: `src/lib/ipc.ts:16-32`  
**Category**: Performance  
**Severity**: Info  

### Description

The `deduplicatedCall` pattern is well-implemented:
- Uses a Map for O(1) lookup
- Properly cleans up with `finally`
- Allows retries after failure

No action needed.

---

## [INFO] No AbortController Support

> Long-running requests cannot be cancelled

**File**: `src/lib/ipc.ts:42-84`  
**Category**: Performance  
**Severity**: Info  

### Description

The Echo-Bridge fetch doesn't use AbortController. For long-running operations like `sync_portfolio`, this could be useful for user-initiated cancellation.

Consider adding optional abort signal parameter for future enhancement.

---

## Test Coverage Notes

The test file `ipc.test.ts` has good coverage but is missing:

1. Test for credential scrubbing in error logs
2. Test for deduplication with concurrent calls
3. Test for `uploadHoldings` function

---

## Verdict

**NEEDS_ACTION** - 1 High severity finding requires fix before merge.

The HIGH severity credential logging issue (lines 67-72) must be addressed. The scrubber module exists but is not being used for error logging context.
