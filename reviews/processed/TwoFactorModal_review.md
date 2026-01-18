# TwoFactorModal.tsx Code Review

**File**: `src/components/auth/TwoFactorModal.tsx`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Status**: NEEDS_ACTION

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 2 |
| Low | 2 |
| Info | 1 |

---

## [HIGH] Credentials Retained in Component Props During 2FA Flow

> Phone and PIN credentials are passed as props and retained in memory during entire 2FA session

**File**: `src/components/auth/TwoFactorModal.tsx:112-114`  
**Category**: Security  
**Severity**: High  

### Description

The `TwoFactorModal` component receives `phone` and `pin` as props (lines 112-114) and uses them for the "resend code" functionality (line 242). This means:

1. Credentials are passed from parent component and retained in React's component tree
2. They remain in memory for the entire duration of the 2FA modal being open
3. If React DevTools are open or the component tree is inspected, credentials are visible
4. This pattern is shared with `LoginForm.tsx` (noted in REVIEW_PLAN.md as HIGH severity in ipc.ts)

This is especially concerning because the `trLogin` call at line 242 passes these credentials, which then flows through `ipc.ts` where the **entire payload is logged on error** (ipc.ts:68-72).

### Current Code

```typescript
interface TwoFactorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  phone?: string;      // Credentials passed as props
  pin?: string;        // and retained in component
  remember?: boolean;
  initialCountdown?: number;
}

// Later in handleResend:
const response = await trLogin(phone, pin, remember);  // Credentials re-transmitted
```

### Suggested Fix

Option A - Remove resend functionality that requires credentials:
```typescript
interface TwoFactorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onResendRequest: () => void;  // Callback to parent, no credentials passed
  initialCountdown?: number;
}
```

Option B - Use a session token for resend instead of re-transmitting credentials:
```typescript
// Backend should provide a resend token during initial login
const response = await trResend2FA(sessionToken);  // No credentials needed
```

Option C - Clear credentials from parent immediately after initial login succeeds:
```typescript
// In parent component after calling trLogin:
setPhone('');
setPin('');
// Only pass countdown and callbacks to TwoFactorModal
```

### Verification

1. Check React DevTools - credentials should not be visible in component props
2. Test error path in `handleResend` - verify no credentials logged
3. Review parent component (`LoginForm.tsx` or `TradeRepublicView.tsx`) credential handling

### Related

- **ipc.ts:68-72** - Payload logging on errors (documented in REVIEW_PLAN.md)
- **LoginForm_review.md** - Same credential handling pattern

---

## [MEDIUM] No Local Rate Limiting on 2FA Attempts

> Missing client-side throttling allows rapid 2FA brute-force attempts

**File**: `src/components/auth/TwoFactorModal.tsx:199-233`  
**Category**: Security  
**Severity**: Medium  

### Description

The `handleVerify` function has no local rate limiting on 2FA submission attempts. While Trade Republic's servers implement rate limiting, the client could:

1. Submit rapid-fire 2FA attempts before server throttling kicks in
2. Provide no user feedback about remaining attempts
3. Potentially trigger account lockouts on Trade Republic's side

The Python backend (`tr_auth.py`, `tr_daemon.py`) also lacks local rate limiting on 2FA attempts - it only detects server-side rate limits after they occur.

### Current Code

```typescript
const handleVerify = async () => {
  const fullCode = code.join('');
  if (fullCode.length !== 4) {
    setError('Please enter all 4 digits');
    return;
  }

  setIsLoading(true);
  // No attempt counting or throttling
  try {
    const response = await trSubmit2FA(fullCode);
    // ...
  }
};
```

### Suggested Fix

```typescript
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60000;  // 1 minute

const [attempts, setAttempts] = useState(0);
const [lockedUntil, setLockedUntil] = useState<number | null>(null);

const handleVerify = async () => {
  // Check lockout
  if (lockedUntil && Date.now() < lockedUntil) {
    const remainingSeconds = Math.ceil((lockedUntil - Date.now()) / 1000);
    setError(`Too many attempts. Please wait ${remainingSeconds}s`);
    return;
  }

  const fullCode = code.join('');
  if (fullCode.length !== 4) {
    setError('Please enter all 4 digits');
    return;
  }

  setIsLoading(true);
  
  try {
    const response = await trSubmit2FA(fullCode);
    
    if (response.authState === 'authenticated') {
      setAttempts(0);  // Reset on success
      // ... success handling
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      
      if (newAttempts >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setError(`Too many failed attempts. Please wait 1 minute.`);
      } else {
        setError(`${response.message} (${MAX_ATTEMPTS - newAttempts} attempts remaining)`);
      }
      // ...
    }
  }
};
```

### Verification

1. Test submitting 5+ incorrect codes in rapid succession
2. Verify lockout message appears after max attempts
3. Verify lockout timer prevents further attempts

---

## [MEDIUM] Auto-Submit Race Condition with useEffect

> Auto-submit triggered by useEffect may cause double submissions

**File**: `src/components/auth/TwoFactorModal.tsx:157-163`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The auto-submit feature uses a `useEffect` that watches the `code` array. This pattern has potential issues:

1. The `isLoading` check happens synchronously, but `setIsLoading(true)` in `handleVerify` is asynchronous
2. Rapid paste + manual entry could trigger race conditions
3. `handleVerify` is called but not in the dependency array (stale closure risk)

### Current Code

```typescript
// Auto-submit when all digits entered
useEffect(() => {
  const fullCode = code.join('');
  if (fullCode.length === 4 && !isLoading) {
    handleVerify();  // Called from effect, handleVerify not in deps
  }
}, [code]);  // Missing isLoading, handleVerify in deps
```

### Suggested Fix

```typescript
// Use a ref to prevent double-submission
const isSubmittingRef = useRef(false);

useEffect(() => {
  const fullCode = code.join('');
  if (fullCode.length === 4 && !isLoading && !isSubmittingRef.current) {
    isSubmittingRef.current = true;
    handleVerify().finally(() => {
      isSubmittingRef.current = false;
    });
  }
}, [code, isLoading, handleVerify]);  // Include all deps

// Wrap handleVerify in useCallback
const handleVerify = useCallback(async () => {
  // ... existing implementation
}, [code, setAuthState, addToast, onSuccess]);
```

### Verification

1. Test paste + immediate key press
2. Verify only one submission occurs
3. Check React StrictMode (double-render) doesn't cause issues

---

## [LOW] Input Type Should Be "tel" or "password" for Security

> Using type="text" for 2FA code allows clipboard access and screen readers to announce digits

**File**: `src/components/auth/TwoFactorModal.tsx:293`  
**Category**: Security  
**Severity**: Low  

### Description

The 2FA code inputs use `type="text"` which:
1. May allow browser autocomplete to suggest/store codes
2. Screen readers will announce each digit aloud
3. Clipboard managers may capture the values

### Current Code

```typescript
<input
  type="text"
  inputMode="numeric"
  pattern="[0-9]*"
  // ...
/>
```

### Suggested Fix

```typescript
<input
  type="tel"           // Better for OTP codes - numeric keyboard on mobile
  inputMode="numeric"
  pattern="[0-9]*"
  autoComplete="one-time-code"  // Hint for password managers
  aria-label={`Digit ${index + 1} of 4`}
  // ...
/>
```

### Verification

1. Test on mobile devices - numeric keyboard should appear
2. Test with screen reader - verify appropriate announcement
3. Check browser autocomplete doesn't interfere

---

## [LOW] Countdown Timer Not Synced with Backend

> Client-side countdown may drift from server's actual token expiry

**File**: `src/components/auth/TwoFactorModal.tsx:146-155`  
**Category**: Correctness  
**Severity**: Low  

### Description

The countdown timer is purely client-side and doesn't account for:
1. Network latency during initial login request
2. Clock drift between client and server
3. App being backgrounded/suspended

If the user submits a code that's actually expired server-side but shows as valid client-side, they get a confusing error.

### Current Code

```typescript
useEffect(() => {
  if (!isOpen || countdown <= 0 || isLoading) return;
  
  const timer = setInterval(() => {
    setCountdown((prev) => prev - 1);
  }, 1000);
  
  return () => clearInterval(timer);
}, [isOpen, countdown, isLoading]);
```

### Suggested Fix

```typescript
// Store the target expiry time, not remaining seconds
const [expiryTime, setExpiryTime] = useState<number | null>(null);

useEffect(() => {
  if (isOpen && initialCountdown > 0) {
    setExpiryTime(Date.now() + initialCountdown * 1000);
  }
}, [isOpen, initialCountdown]);

useEffect(() => {
  if (!isOpen || !expiryTime || isLoading) return;
  
  const updateCountdown = () => {
    const remaining = Math.max(0, Math.ceil((expiryTime - Date.now()) / 1000));
    setCountdown(remaining);
    if (remaining <= 0) clearInterval(timer);
  };
  
  const timer = setInterval(updateCountdown, 1000);
  updateCountdown();  // Update immediately
  
  return () => clearInterval(timer);
}, [isOpen, expiryTime, isLoading]);

// Handle app resume
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && expiryTime) {
      const remaining = Math.max(0, Math.ceil((expiryTime - Date.now()) / 1000));
      setCountdown(remaining);
    }
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}, [expiryTime]);
```

### Verification

1. Test backgrounding the app and returning
2. Verify countdown is accurate after resume
3. Test with artificial network delay on initial login

---

## [INFO] Direct DOM Manipulation in onFocus/onBlur Handlers

> Using inline style manipulation instead of React state

**File**: `src/components/auth/TwoFactorModal.tsx:306-313`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The code uses direct DOM manipulation (`e.target.style.borderColor = ...`) in focus/blur handlers instead of React state. While this works, it:

1. Bypasses React's rendering model
2. Can cause inconsistencies with the `styles.codeInputFocus` object also defined
3. Makes styling harder to maintain

### Current Code

```typescript
onFocus={(e) => {
  e.target.style.borderColor = '#10b981';
  e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.2)';
}}
onBlur={(e) => {
  e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
  e.target.style.boxShadow = 'none';
}}
```

### Suggested Fix

```typescript
const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

// In render:
<input
  style={{
    ...styles.codeInput,
    ...(focusedIndex === index ? styles.codeInputFocus : {}),
  }}
  onFocus={() => setFocusedIndex(index)}
  onBlur={() => setFocusedIndex(null)}
/>
```

### Verification

1. Visual inspection - focus styles should match
2. No console warnings about DOM manipulation

---

## Review Verdict

| Criteria | Status |
|----------|--------|
| No critical findings | ✅ |
| No high findings unaddressed | ❌ (1 HIGH) |
| Security concerns documented | ✅ |
| Code follows conventions | ✅ |

**Result**: NEEDS_ACTION - 1 HIGH severity finding requires attention

### Recommended Actions

1. **Priority 1**: Address credential retention in props (HIGH) - coordinate with LoginForm.tsx fix
2. **Priority 2**: Add local rate limiting on 2FA attempts (MEDIUM)
3. **Priority 3**: Fix useEffect dependency array for auto-submit (MEDIUM)
4. **Priority 4**: Change input type to "tel" (LOW)
