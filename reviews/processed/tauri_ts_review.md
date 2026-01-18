# Code Review: src/lib/tauri.ts

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**File**: `src/lib/tauri.ts` (98 lines)  
**Result**: PASSED (1M, 2L, 3I)

---

## Summary

This file provides type-safe wrappers around Tauri's invoke and listen APIs with graceful browser fallbacks. The code is well-structured, properly typed, and has good test coverage. One medium-priority performance improvement is recommended.

---

## [MEDIUM] Dynamic Import on Every API Call

> Performance optimization: Cache imported Tauri modules instead of importing on each call

**File**: `src/lib/tauri.ts:36,59,75,95`  
**Category**: Performance  
**Severity**: Medium  

### Description

Every call to `invoke`, `listen`, `once`, and `emit` performs a dynamic import of the Tauri API modules. While module bundlers cache dynamic imports after the first resolution, there's still overhead from the promise creation and module lookup on each call. For a frequently-called API wrapper, this can add up.

### Current Code

```typescript
export async function invoke<K extends keyof TauriCommands>(
  command: K,
  args?: TauriCommands[K]['args']
): Promise<TauriCommands[K]['returns']> {
  if (!isTauri()) {
    throw new Error(`Tauri not available. Cannot invoke command: ${command}`);
  }

  // Dynamic import on every call
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
  return tauriInvoke(command, args);
}
```

### Suggested Fix

```typescript
// Module-level cache for Tauri APIs
let cachedInvoke: typeof import('@tauri-apps/api/core')['invoke'] | null = null;
let cachedEventApi: typeof import('@tauri-apps/api/event') | null = null;

async function getTauriInvoke() {
  if (!cachedInvoke) {
    const { invoke } = await import('@tauri-apps/api/core');
    cachedInvoke = invoke;
  }
  return cachedInvoke;
}

async function getTauriEventApi() {
  if (!cachedEventApi) {
    cachedEventApi = await import('@tauri-apps/api/event');
  }
  return cachedEventApi;
}

export async function invoke<K extends keyof TauriCommands>(
  command: K,
  args?: TauriCommands[K]['args']
): Promise<TauriCommands[K]['returns']> {
  if (!isTauri()) {
    throw new Error(`Tauri not available. Cannot invoke command: ${command}`);
  }

  const tauriInvoke = await getTauriInvoke();
  return tauriInvoke(command, args);
}
```

### Verification

1. Run existing tests: `npm test src/lib/tauri.test.ts`
2. Add performance test comparing cached vs uncached imports
3. Verify module loading in browser dev tools (should show single import)

---

## [LOW] Inconsistent Error Handling Strategy

> `invoke` throws while `listen/once/emit` log warnings and return silently

**File**: `src/lib/tauri.ts:31-32,53-56,70-72,90-92`  
**Category**: Correctness  
**Severity**: Low  

### Description

The API has inconsistent error handling: `invoke` throws an error when not in Tauri, but `listen`, `once`, and `emit` log a warning and return no-op functions. This is likely intentional (invoke failures are critical, event listeners can be skipped), but the behavior difference could surprise developers.

### Current Code

```typescript
// invoke - throws
if (!isTauri()) {
  throw new Error(`Tauri not available. Cannot invoke command: ${command}`);
}

// listen - warns and returns no-op
if (!isTauri()) {
  console.warn(`Tauri not available. Cannot listen for event: ${event}`);
  return () => {};
}
```

### Suggested Fix

Document this intentional behavior in the module's JSDoc header:

```typescript
/**
 * Tauri API Wrapper
 * 
 * Provides type-safe access to Tauri's invoke and listen APIs.
 * Falls back gracefully when running in a browser (not Tauri).
 * 
 * @remarks
 * **Error Handling Strategy:**
 * - `invoke()` throws when Tauri is unavailable (commands require backend)
 * - `listen/once/emit()` warn and return no-ops (events can be skipped gracefully)
 * 
 * This allows UI code to set up event listeners that silently no-op in browser
 * dev mode, while commands that require data will fail fast.
 */
```

### Verification

1. Review calling code to ensure it handles the different behaviors correctly
2. Update tests to document expected behavior

---

## [LOW] Type Assertion on Event Payloads Without Runtime Validation

> Event payload types are asserted without runtime checks

**File**: `src/lib/tauri.ts:60,76`  
**Category**: Correctness  
**Severity**: Low  

### Description

The event handlers use `as TauriEvents[K]` to type the payload without runtime validation. If the Rust backend sends a malformed event, the TypeScript types won't catch it at runtime.

### Current Code

```typescript
return tauriListen(event, (e) => handler(e.payload as TauriEvents[K]));
```

### Suggested Fix

Since events come from the trusted Rust backend and adding runtime validation would add complexity, this is acceptable. However, consider adding defensive checks for critical events in consuming code, or add a development-mode validator:

```typescript
// Development-only validation (optional)
function validateEventPayload<K extends keyof TauriEvents>(
  event: K,
  payload: unknown
): payload is TauriEvents[K] {
  if (import.meta.env.DEV) {
    // Add runtime checks for critical events
    if (event === 'sync-progress') {
      return typeof payload === 'object' && payload !== null &&
        'status' in payload && 'progress' in payload;
    }
  }
  return true; // Trust in production
}
```

### Verification

No action required - document as accepted risk for trusted backend events.

---

## [INFO] Consider Lazy Initialization Pattern

> Alternative pattern for module structure

**File**: `src/lib/tauri.ts`  
**Category**: Maintainability  
**Severity**: Info  

### Description

An alternative pattern would be to export a lazily-initialized object that groups all Tauri operations. This can make mocking easier in tests and allows for future extension.

### Suggested Pattern

```typescript
export const TauriAPI = {
  invoke,
  listen,
  once,
  emit,
  isTauri,
} as const;
```

This is purely stylistic and the current named exports work well.

---

## [INFO] Missing Handler Callback Verification in Tests

> Tests verify Tauri functions are called but don't verify handler receives correct types

**File**: `src/lib/tauri.test.ts`  
**Category**: Testing  
**Severity**: Info  

### Description

The listen/once tests verify that Tauri's listen/once are called, but don't verify that the handler callback receives correctly unwrapped and typed payloads from `e.payload`.

### Suggested Addition

```typescript
it('unwraps event payload and calls handler with typed data', async () => {
  global.window = { __TAURI_INTERNALS__: {} } as unknown as Window & typeof globalThis;

  const { listen: tauriListen } = await import('@tauri-apps/api/event');
  let capturedCallback: (e: { payload: unknown }) => void;
  vi.mocked(tauriListen).mockImplementation(async (_event, callback) => {
    capturedCallback = callback as (e: { payload: unknown }) => void;
    return vi.fn();
  });

  const handler = vi.fn();
  await listen('sync-progress', handler);

  // Simulate Tauri sending an event
  capturedCallback!({ payload: { status: 'syncing', progress: 50, message: 'Test' } });

  expect(handler).toHaveBeenCalledWith({ status: 'syncing', progress: 50, message: 'Test' });
});
```

---

## [INFO] Emit Function is for Testing Only

> Emit is documented for testing/debugging but may be misused

**File**: `src/lib/tauri.ts:83-97`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The `emit` function is documented as "useful for testing without Rust backend" but is exported publicly. Consider whether it should be exported conditionally or clearly marked as test-only.

### Current Code

```typescript
/**
 * Emit an event (useful for testing without Rust backend)
 */
export async function emit<K extends keyof TauriEvents>(
```

### Suggested Fix

Either:
1. Keep as-is with clear documentation (current approach is fine)
2. Or for stricter control, only export in test builds:

```typescript
// Export conditionally
export const emit = import.meta.env.DEV ? emitImpl : undefined;
```

The current approach is acceptable as the function does nothing harmful.

---

## Checklist Summary

### Security (P0) - PASSED
- [x] No user input directly processed
- [x] No secrets handling (passthrough layer)
- [x] Auth delegated to backend
- [x] No injection vulnerabilities

### Correctness (P1) - PASSED
- [x] Correct Tauri environment detection
- [x] Proper fallback for browser mode
- [x] Type-safe command/event contracts
- [x] Edge cases handled

### Performance (P2) - 1 MEDIUM
- [ ] Dynamic imports could be cached
- [x] No memory leaks
- [x] No blocking operations

### Maintainability (P3) - PASSED
- [x] Well-documented
- [x] Single responsibility functions
- [x] Follows project conventions
- [x] No dead code

### Testing (P4) - PASSED
- [x] 12 tests covering all functions
- [x] Both Tauri and browser paths tested
- [x] Mocking approach is correct
