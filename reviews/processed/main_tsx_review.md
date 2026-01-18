# Review: src/main.tsx

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**Result**: PASSED (1 Medium, 2 Low, 2 Info)

---

## [MEDIUM] Non-null Assertion on Root Element Without Fallback

> Root element lookup uses non-null assertion which will throw if element is missing

**File**: `src/main.tsx:35`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The code uses `document.getElementById('root')!` with a non-null assertion operator. If the root element doesn't exist (e.g., malformed HTML, CDN issues loading index.html), this will throw an uncaught error that bypasses the ErrorBoundary since it occurs during initial render setup.

While unlikely in normal operation (the element is in the bundled HTML), this creates a crash with no user-friendly fallback.

### Current Code

```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
```

### Suggested Fix

```typescript
const rootElement = document.getElementById('root');
if (!rootElement) {
  document.body.innerHTML = '<div style="color: white; padding: 20px; font-family: sans-serif;"><h1>Application Error</h1><p>Failed to initialize. Please reload the page.</p></div>';
  throw new Error('Root element not found');
}
ReactDOM.createRoot(rootElement).render(
```

### Verification

1. Temporarily rename `root` in index.html and verify fallback displays
2. Restore and confirm normal operation

---

## [LOW] Unhandled Rejection Logs String Coercion of Reason

> Promise rejection reason is coerced to string, potentially losing useful context

**File**: `src/main.tsx:25-32`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The `onunhandledrejection` handler uses `String(event.reason)` which may lose valuable error information if the rejection reason is an Error object with a stack trace.

### Current Code

```typescript
window.onunhandledrejection = (event) => {
    try {
        logEvent('ERROR', `Unhandled Promise Rejection: ${event.reason}`, {
            reason: String(event.reason)
        }, 'ui', 'crash').catch(() => { /* ignore IPC failures */ });
```

### Suggested Fix

```typescript
window.onunhandledrejection = (event) => {
    try {
        const reason = event.reason;
        const isError = reason instanceof Error;
        logEvent('ERROR', `Unhandled Promise Rejection: ${isError ? reason.message : String(reason)}`, {
            reason: isError ? reason.message : String(reason),
            stack: isError ? reason.stack : undefined,
            name: isError ? reason.name : undefined,
        }, 'ui', 'crash').catch(() => { /* ignore IPC failures */ });
```

### Verification

1. Trigger unhandled promise rejection with Error object
2. Verify stack trace is captured in logs

---

## [LOW] DevTools Rendered in Production Build

> ReactQueryDevtools is rendered even in production, though hidden

**File**: `src/main.tsx:42`  
**Category**: Performance  
**Severity**: Low  

### Description

`ReactQueryDevtools` is included in the render tree with a comment stating it's "only visible in development". While true that it's hidden in production, the component is still bundled and rendered (just with `display: none`). Modern tree-shaking should handle this, but an explicit check is cleaner.

### Current Code

```typescript
{/* DevTools - only visible in development */}
<ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
```

### Suggested Fix

```typescript
{import.meta.env.DEV && (
    <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
)}
```

### Verification

1. Check production bundle size before/after
2. Verify DevTools don't appear in production build

---

## [INFO] Error Handlers Use Correct Fire-and-Forget Pattern

> Good practice: Error handlers correctly avoid blocking and handle their own failures

**File**: `src/main.tsx:11-33`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The global error handlers correctly:
1. Use `.catch(() => {})` to prevent unhandled promise rejection loops
2. Wrap synchronous errors in try/catch
3. Include helpful comments explaining the pattern

This is a good pattern for logging infrastructure that should never crash the app.

---

## [INFO] ErrorBoundary Correctly Positioned

> ErrorBoundary wraps App inside QueryClientProvider - correct ordering

**File**: `src/main.tsx:37-40`  
**Category**: Correctness  
**Severity**: Info  

### Description

The component hierarchy is correct:
1. `StrictMode` at root for development checks
2. `QueryClientProvider` wrapping everything for React Query context
3. `ErrorBoundary` inside to catch App errors while still having query access
4. `App` as the main application

The ErrorBoundary correctly uses `scrubObject` for PII scrubbing before reporting.

---

## Summary

| Category | Findings |
|----------|----------|
| Security | 0 |
| Correctness | 1 Medium, 1 Info |
| Performance | 1 Low |
| Maintainability | 1 Low, 1 Info |
| Testing | 0 |

**Overall**: File is well-structured with good error handling patterns. The non-null assertion is the main concern but is unlikely to cause issues in practice. No blocking issues.
