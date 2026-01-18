# Code Review: useAppStore.ts

**File**: `src/store/useAppStore.ts`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Verdict**: PASSED (2 Medium, 2 Low, 3 Info)

---

## Summary

The Zustand store is well-structured with proper separation of state and actions. The use of devtools middleware and exported selector hooks follows React best practices. Two medium-severity issues around timer cleanup warrant attention to prevent potential memory leaks.

---

## [MEDIUM] Timer Cleanup Missing for Notification Auto-Dismiss

> Timeout timers are created but never tracked, leading to potential memory leaks and stale callbacks.

**File**: `src/store/useAppStore.ts:197-202`  
**Category**: Correctness  
**Severity**: Medium  

### Description

When a notification with a `duration` is added, a `setTimeout` is created for auto-dismissal. However:
1. The timeout ID is not stored, so it cannot be cancelled
2. If the notification is manually dismissed before timeout fires, the callback still executes
3. If the store is somehow reset, stale closures reference old state

This could cause:
- Unnecessary state updates on already-dismissed notifications
- Memory leaks if notifications are added/dismissed frequently

### Current Code

```typescript
// Auto-dismiss if duration is set
if (notification.duration) {
  setTimeout(() => {
    get().dismissNotification(id);
  }, notification.duration);
}
```

### Suggested Fix

Option 1: Store timeout refs and clear on dismiss:

```typescript
// In state interface
notificationTimeouts: Map<string, NodeJS.Timeout>;

// In addNotification
if (notification.duration) {
  const timeoutId = setTimeout(() => {
    get().dismissNotification(id);
  }, notification.duration);
  get().notificationTimeouts.set(id, timeoutId);
}

// In dismissNotification
dismissNotification: (id) => {
  const timeout = get().notificationTimeouts.get(id);
  if (timeout) {
    clearTimeout(timeout);
    get().notificationTimeouts.delete(id);
  }
  set(
    (state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }),
    false,
    'dismissNotification'
  );
},
```

Option 2: Use a simpler approach with AbortController or check existence before dismissal:

```typescript
if (notification.duration) {
  setTimeout(() => {
    // Check if notification still exists before dismissing
    const exists = get().notifications.some(n => n.id === id);
    if (exists) {
      get().dismissNotification(id);
    }
  }, notification.duration);
}
```

### Verification

1. Add notification with 3s duration
2. Manually dismiss before 3s
3. Verify no console errors or state updates after 3s
4. Add many notifications rapidly, dismiss all, verify no memory growth

---

## [MEDIUM] Timer Cleanup Missing for Toast Auto-Dismiss

> Same issue as notifications applies to toast handling.

**File**: `src/store/useAppStore.ts:280-285`  
**Category**: Correctness  
**Severity**: Medium  

### Description

Identical pattern to notifications - toasts with duration create untracked timeouts.

### Current Code

```typescript
// Auto-dismiss after duration
if (duration > 0) {
  setTimeout(() => {
    get().dismissToast(id);
  }, duration);
}
```

### Suggested Fix

Apply same fix pattern as notifications:

```typescript
if (duration > 0) {
  setTimeout(() => {
    const exists = get().toasts.some(t => t.id === id);
    if (exists) {
      get().dismissToast(id);
    }
  }, duration);
}
```

### Verification

1. Add toast with 2s duration
2. Manually dismiss before 2s
3. Verify no errors after timeout fires

---

## [LOW] Non-Cryptographic Random ID Generation

> IDs use Math.random() which has collision potential in high-volume scenarios.

**File**: `src/store/useAppStore.ts:188, 269`  
**Category**: Correctness  
**Severity**: Low  

### Description

Notification and toast IDs combine timestamp with `Math.random().toString(36).substr(2, 9)`. While unlikely in practice, this has theoretical collision potential:
- Same millisecond + same random sequence = duplicate ID
- `substr(2, 9)` is only ~47 bits of randomness

Not a security issue (IDs aren't security-sensitive), but could cause UI bugs if collisions occur.

### Current Code

```typescript
const id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
```

### Suggested Fix

Use crypto.randomUUID() for guaranteed uniqueness:

```typescript
const id = `notification-${crypto.randomUUID()}`;
```

Or if you want to keep timestamp for debugging:

```typescript
const id = `notification-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
```

### Verification

1. Ensure no regressions in notification/toast functionality
2. IDs should still be unique across rapid additions

---

## [LOW] Phone Number Stored in Memory State

> Saved phone number is kept in plaintext Zustand state.

**File**: `src/store/useAppStore.ts:39, 231`  
**Category**: Security  
**Severity**: Low  

### Description

The `savedPhone` field stores the user's phone number in the Zustand store. This is visible in:
- React DevTools (development)
- Redux DevTools extension (if installed)
- Memory dumps

Given that:
- Phone number is needed for UI display ("Remember: +49***1234")
- The phone is already exposed via `SessionCheck.phoneNumber` from backend (masked)
- Desktop app with single-user context

This is acceptable for the use case but worth noting.

### Recommendation

Consider:
1. Only store masked version (e.g., `+49***1234`) if full number isn't needed for re-auth
2. Clear `savedPhone` on logout (currently `closeAuthPanel` doesn't clear it)

### Current Code

```typescript
setSavedPhone: (phone) => set({ savedPhone: phone }, false, 'setSavedPhone'),
```

### Verification

1. Verify phone is cleared on explicit logout
2. Check if full phone or masked phone is needed

---

## [INFO] DevTools Middleware Always Enabled

> DevTools are active in production builds.

**File**: `src/store/useAppStore.ts:159`  
**Category**: Security  
**Severity**: Info  

### Description

The `devtools` middleware is unconditionally wrapped around the store. This means:
- Full state visible in Redux DevTools extension
- Action history traceable
- State can be time-traveled/modified

In a desktop app this is lower risk than web, but still exposes internals.

### Current Code

```typescript
export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      // ...
    }),
    { name: 'AppStore' }
  )
);
```

### Suggested Fix

Conditionally enable in development:

```typescript
const storeImpl = (set: any, get: any) => ({
  ...initialState,
  // ... actions
});

export const useAppStore = create<AppStore>()(
  import.meta.env.DEV 
    ? devtools(storeImpl, { name: 'AppStore' })
    : storeImpl
);
```

Or use the `enabled` option:

```typescript
devtools(storeImpl, { 
  name: 'AppStore',
  enabled: import.meta.env.DEV 
})
```

### Verification

1. Run production build
2. Verify devtools don't show AppStore state

---

## [INFO] Large Monolithic Store

> Single store file with 348 lines and 50+ exports.

**File**: `src/store/useAppStore.ts:1-348`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The store manages many concerns:
- Navigation
- Engine status
- Auth state
- Notifications
- Toasts
- Telemetry
- Hive settings
- Feedback dialog

While Zustand handles this fine, the file is becoming hard to navigate.

### Recommendation

Consider splitting into slices using Zustand's slice pattern:

```typescript
// store/slices/authSlice.ts
export const createAuthSlice = (set, get) => ({
  authState: 'idle',
  // ...auth actions
});

// store/index.ts
export const useAppStore = create()(
  devtools((...args) => ({
    ...createAuthSlice(...args),
    ...createNavigationSlice(...args),
    // etc.
  }))
);
```

### Verification

N/A - architectural suggestion for future refactoring.

---

## [INFO] Inconsistent State Access Patterns

> Mix of selector hooks and direct store access across codebase.

**File**: `src/store/useAppStore.ts:311-347`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The store exports both:
1. Selector hooks: `useAuthState()`, `useEngineStatus()`
2. Direct access: `useAppStore((state) => state.xxx)`

Components inconsistently use both patterns, making it harder to refactor.

### Recommendation

Document preferred pattern in AGENTS.md or store comments:

```typescript
// PREFERRED: Use selector hooks for optimized re-renders
const authState = useAuthState();

// AVOID: Direct access causes full re-render on any state change
const authState = useAppStore((state) => state.authState);
```

### Verification

N/A - documentation/convention suggestion.

---

## Checklist Summary

| Category | Status | Notes |
|----------|--------|-------|
| **Security** | PASS | No hardcoded secrets, auth state handled appropriately |
| **Correctness** | NEEDS_ATTENTION | Timer cleanup issues (Medium) |
| **Performance** | PASS | Selector hooks optimize re-renders |
| **Maintainability** | PASS | Well-structured with good docs |
| **Testing** | N/A | Not reviewed (test file exists) |

---

## Final Verdict

**PASSED** - No critical or high severity issues. Two medium findings around timer cleanup should be addressed to prevent potential memory leaks, but are not blocking.

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 2 |
| Info | 3 |
