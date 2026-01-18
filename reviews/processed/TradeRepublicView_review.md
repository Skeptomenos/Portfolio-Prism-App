# Code Review: src/components/views/TradeRepublicView.tsx

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**File**: `src/components/views/TradeRepublicView.tsx`  
**Lines**: 601  

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 3 |
| Info | 2 |

---

## [MEDIUM] Credentials Held in Component State During 2FA Flow

> Phone and PIN stored in React state while awaiting 2FA

**File**: `src/components/views/TradeRepublicView.tsx:205, 241-245`  
**Category**: Security  
**Severity**: Medium  

### Description

The component stores login credentials (phone number and PIN) in React state via `loginCredentials` (line 205). These are set after initial login (line 244) and held until 2FA completes or the user cancels. While necessary for the 2FA resend functionality, this extends the window where credentials exist in memory.

This is a necessary design tradeoff for the resend-2FA feature, but the exposure should be minimized.

### Current Code

```typescript
const [loginCredentials, setLoginCredentials] = useState<{ phone: string; pin: string; remember: boolean } | null>(null);

// Later, on login success:
if (credentials) {
  setLoginCredentials(credentials);
}
```

### Suggested Fix

Clear credentials as soon as 2FA succeeds and consider limiting resend capability:

```typescript
const handleTwoFactorSuccess = useCallback(async () => {
  // Clear credentials IMMEDIATELY on success
  setLoginCredentials(null);
  setAuthResponse(null);
  setAuthState('authenticated');
  
  // ... rest of auto-sync logic
}, [setAuthState, refetchPositions, activePortfolioId, addToast]);
```

Current code already does this (line 251), so this is implemented correctly. However, also clear on component unmount:

```typescript
useEffect(() => {
  return () => {
    // Clear sensitive data on unmount
    setLoginCredentials(null);
  };
}, []);
```

### Verification

1. Verify credentials are cleared on 2FA success
2. Verify credentials are cleared on cancel/close
3. Add cleanup effect for unmount scenario

---

## [MEDIUM] Error Messages May Leak Auth State Information

> Error messages from backend are displayed directly to user

**File**: `src/components/views/TradeRepublicView.tsx:271, 275, 306, 341-346`  
**Category**: Security  
**Severity**: Medium  

### Description

Error messages from the backend are displayed directly to users via toast notifications. While the backend should sanitize messages, the frontend provides no defense-in-depth. Error messages could potentially reveal:
- Whether a phone number is registered
- Session timing information
- Internal error codes

### Current Code

```typescript
} catch (error) {
  const message = error instanceof Error ? error.message : 'Sync failed';
  addToast({
    type: 'error',
    title: 'Auto-sync failed',
    message: `${message}. Click "Sync Now" to retry.`,
  });
}
```

### Suggested Fix

Sanitize error messages before display:

```typescript
import { sanitizeErrorMessage } from '../../lib/errors';

} catch (error) {
  const rawMessage = error instanceof Error ? error.message : 'Sync failed';
  const message = sanitizeErrorMessage(rawMessage);
  addToast({
    type: 'error',
    title: 'Auto-sync failed',
    message: `${message}. Click "Sync Now" to retry.`,
  });
}
```

With helper:
```typescript
// lib/errors.ts
export function sanitizeErrorMessage(message: string): string {
  // Remove internal codes, stack traces, and sensitive patterns
  return message
    .replace(/\[.+?\]/g, '') // Remove bracketed codes
    .replace(/session_id=\w+/gi, '')
    .replace(/token=\w+/gi, '')
    .trim() || 'An error occurred';
}
```

### Verification

1. Review backend error messages for sensitive data
2. Add error sanitization layer
3. Test with various error scenarios

---

## [LOW] Console.error May Log Sensitive Session Data

> Errors logged to console could contain session information

**File**: `src/components/views/TradeRepublicView.tsx:233`  
**Category**: Security  
**Severity**: Low  

### Description

The `console.error` call on line 233 logs the full error object, which might contain sensitive session information depending on what `trCheckSavedSession` throws.

### Current Code

```typescript
} catch (error) {
  console.error('[TradeRepublicView] Failed to load session data:', error);
}
```

### Suggested Fix

Log only the error message, not the full object:

```typescript
} catch (error) {
  console.error('[TradeRepublicView] Failed to load session data:', 
    error instanceof Error ? error.message : 'Unknown error');
}
```

### Verification

1. Check what `trCheckSavedSession` includes in error objects
2. Ensure no session tokens in logged output

---

## [LOW] Auth Error Detection Uses String Matching

> Fragile string matching to detect auth errors

**File**: `src/components/views/TradeRepublicView.tsx:350-352`  
**Category**: Correctness  
**Severity**: Low  

### Description

Auth error detection relies on string matching (`message.includes('auth') || message.includes('session')`). This is fragile and could miss errors or false-positive on unrelated messages.

### Current Code

```typescript
// Check if it's an auth error
if (message.includes('auth') || message.includes('session')) {
  setAuthState('idle');
}
```

### Suggested Fix

Use error codes or structured error types:

```typescript
interface AppError extends Error {
  code?: 'AUTH_EXPIRED' | 'SESSION_INVALID' | 'NETWORK_ERROR' | string;
}

// Check if it's an auth error
if (error instanceof Error && 'code' in error) {
  const code = (error as AppError).code;
  if (code === 'AUTH_EXPIRED' || code === 'SESSION_INVALID') {
    setAuthState('idle');
  }
}
```

Or at minimum, use constants:

```typescript
const AUTH_ERROR_PATTERNS = ['auth', 'session', 'unauthorized', '401'];
if (AUTH_ERROR_PATTERNS.some(p => message.toLowerCase().includes(p))) {
  setAuthState('idle');
}
```

### Verification

1. Review backend error responses for auth failures
2. Ensure consistent error codes from backend

---

## [LOW] No Loading State for Initial Session Check

> Brief flash of login form before session check completes

**File**: `src/components/views/TradeRepublicView.tsx:226-238`  
**Category**: Correctness  
**Severity**: Low  

### Description

When the component mounts with `authState === 'idle'`, it shows the login form immediately while `trCheckSavedSession` is in flight. If a session exists, the user briefly sees the login form before it switches to the restore prompt.

### Current Code

```typescript
useEffect(() => {
  const loadSessionData = async () => {
    if (authState === 'idle') {
      try {
        const session = await trCheckSavedSession();
        setSessionData(session);
      } catch (error) {
        console.error('[TradeRepublicView] Failed to load session data:', error);
      }
    }
  };
  loadSessionData();
}, [authState]);
```

### Suggested Fix

Add loading state:

```typescript
const [isCheckingSession, setIsCheckingSession] = useState(true);

useEffect(() => {
  const loadSessionData = async () => {
    if (authState === 'idle') {
      setIsCheckingSession(true);
      try {
        const session = await trCheckSavedSession();
        setSessionData(session);
      } catch (error) {
        console.error('[TradeRepublicView] Failed to load session data:', 
          error instanceof Error ? error.message : 'Unknown error');
      } finally {
        setIsCheckingSession(false);
      }
    }
  };
  loadSessionData();
}, [authState]);

// In renderAuthContent:
if (isCheckingSession) {
  return <LoadingSpinner message="Checking session..." />;
}
```

### Verification

1. Observe mount behavior with saved session
2. Verify no flash of wrong content

---

## [INFO] Good: Proper useCallback Memoization

> All callback handlers are properly memoized

**File**: `src/components/views/TradeRepublicView.tsx:241-388`  
**Category**: Performance  
**Severity**: Info  

### Description

All event handlers (`handleLoginSuccess`, `handleTwoFactorSuccess`, `handleRestoreComplete`, `handleFreshLogin`, `handleSync`, `handleLogout`, `handlePositionUpdate`) are properly wrapped in `useCallback` with correct dependency arrays.

No action needed.

---

## [INFO] Good: Sync Protection with hasUnsavedChanges

> Sync is properly blocked when user has local edits

**File**: `src/components/views/TradeRepublicView.tsx:323-330`  
**Category**: Correctness  
**Severity**: Info  

### Description

The component correctly checks `hasUnsavedChanges` before syncing and warns the user. This prevents data loss from overwriting local edits.

```typescript
if (hasUnsavedChanges) {
  addToast({
    type: 'warning',
    title: 'Unsaved changes',
    message: 'Please save your changes before syncing',
  });
  return;
}
```

No action needed.

---

## Test Coverage Notes

The test file exists (`TradeRepublicView.test.tsx`) with 4 test suites covering:
- Unauthenticated state rendering
- Authenticated state rendering  
- Sync functionality (partial)
- Logout handling (partial)

**Missing coverage:**
1. 2FA flow integration
2. Error handling scenarios
3. Unsaved changes warning
4. Position update callback
5. Auto-sync after login/restore

---

## Verdict

**PASSED** - No critical or high severity findings. 2 medium findings are acceptable for merge but should be addressed.

The component correctly delegates credential handling to child components (LoginForm, TwoFactorModal) which have been separately reviewed. The known HIGH issue in `ipc.ts:67-72` regarding credential logging affects this view indirectly but is tracked in that file's review.
