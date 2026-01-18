# Code Review: ErrorBoundary.tsx

**File**: `src/components/common/ErrorBoundary.tsx`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Result**: PASSED (2 Medium, 2 Low, 2 Info)

---

## Summary

The ErrorBoundary component is well-implemented with proper PII scrubbing before sending crash reports. It follows React class component patterns correctly and integrates well with the telemetry consent system. The security posture is good with no critical or high findings.

---

## [MEDIUM] Console Error Logging Includes Unscrubbed Stack Trace

> Raw error details logged to console could leak sensitive information in development tools

**File**: `src/components/common/ErrorBoundary.tsx:37`  
**Category**: Security  
**Severity**: Medium  

### Description

The `componentDidCatch` method logs the raw error and errorInfo to the console without scrubbing. While console output is local to the user's machine and not transmitted, it could contain sensitive information like:
- File paths revealing user home directory structure
- Variable names or values from the stack trace
- Component props that might include sensitive data

This is lower risk than network-transmitted data but worth addressing for consistency.

### Current Code

```typescript
public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  this.setState({ error, errorInfo });
  console.error('Uncaught error:', error, errorInfo);
  // ...
}
```

### Suggested Fix

```typescript
public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  this.setState({ error, errorInfo });
  
  // Log scrubbed data to console to prevent accidental PII exposure in dev tools
  const scrubbedLog = scrubObject({
    message: error.message,
    name: error.name,
    stack: error.stack,
    componentStack: errorInfo?.componentStack,
  });
  console.error('Uncaught error:', scrubbedLog);
  // ...
}
```

### Verification

1. Trigger an error in a component that handles sensitive data
2. Check console output to ensure no PII is logged
3. Run existing tests to ensure logging behavior is maintained

---

## [MEDIUM] useAppStore.getState() Called During Render

> Accessing Zustand store imperatively in render may cause stale state issues

**File**: `src/components/common/ErrorBoundary.tsx:152, 157`  
**Category**: Correctness  
**Severity**: Medium  

### Description

The component calls `useAppStore.getState()` directly within the render method. In class components, this creates a coupling to the store's current state at render time, which:
1. Won't trigger re-renders when `telemetryMode` changes
2. Could show stale telemetry mode if user changes settings and then an error occurs

Since ErrorBoundary is a class component (required for error boundaries), the workaround is to read the state once in componentDidCatch and store it, or use a wrapper pattern.

### Current Code

```typescript
{useAppStore.getState().telemetryMode === 'auto' ? 'Report Issue' : 'Confirm & Send Report'}
// ...
{!isReported && useAppStore.getState().telemetryMode !== 'auto' && (
```

### Suggested Fix

```typescript
interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isReporting: boolean;
  isReported: boolean;
  showReview: boolean;
  telemetryMode: 'auto' | 'ask' | 'off';  // Capture at error time
}

public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
  const { telemetryMode } = useAppStore.getState();
  this.setState({ error, errorInfo, telemetryMode });
  // ... rest of method
}

// In render:
const { telemetryMode } = this.state;
// Use telemetryMode from state instead of getState()
```

### Verification

1. Change telemetry mode in settings
2. Trigger an error
3. Verify the correct mode is displayed based on when the error occurred

---

## [LOW] Alert Used for Error Feedback

> Native alert() is disruptive and not styled consistently with the app

**File**: `src/components/common/ErrorBoundary.tsx:71`  
**Category**: Maintainability  
**Severity**: Low  

### Description

When the feedback API fails, a native `alert()` is used to notify the user. This is jarring compared to the styled UI and doesn't match the application's design language. Consider using a toast notification or inline error message.

### Current Code

```typescript
} catch (err) {
  console.error('Failed to report crash:', err);
  alert('Failed to send report automatically. Please check your internet connection.');
}
```

### Suggested Fix

```typescript
} catch (err) {
  console.error('Failed to report crash:', err);
  // Add error state and display inline
  this.setState({ 
    reportError: 'Failed to send report. Please check your connection and try again.' 
  });
}

// In render, show error message inline:
{this.state.reportError && (
  <p className="text-red-400 text-sm text-center mb-2">{this.state.reportError}</p>
)}
```

### Verification

1. Disconnect network
2. Trigger an error and attempt to report
3. Verify inline error message appears instead of native alert

---

## [LOW] Raw Error Message Displayed to User

> Error message shown without sanitization could leak internal details

**File**: `src/components/common/ErrorBoundary.tsx:113-114`  
**Category**: Security  
**Severity**: Low  

### Description

The error name and message are displayed directly to the user without scrubbing. While the scrubbed version is available for the "Review Scrubbed Data" view, the initial display shows raw error details which could potentially contain:
- Internal file paths
- Database query fragments
- API endpoint details

### Current Code

```typescript
<p className="font-bold text-red-400 mb-1">{error?.name}</p>
<p className="text-gray-300">{error?.message}</p>
```

### Suggested Fix

```typescript
<p className="font-bold text-red-400 mb-1">{error?.name}</p>
<p className="text-gray-300">{scrubText(error?.message || '')}</p>
```

### Verification

1. Create a test error that includes a path or email in the message
2. Verify the displayed message is scrubbed
3. Verify the "Review Scrubbed Data" view still shows the full scrubbed object

---

## [INFO] Missing Return Type Annotation on getDerivedStateFromError

> Explicit return type improves type safety and documentation

**File**: `src/components/common/ErrorBoundary.tsx:31`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The `getDerivedStateFromError` static method returns a `State` object but the return type annotation shows `State` which is correct. However, TypeScript allows a partial state update here. The current implementation returns a full State object which works but could be simplified.

### Current Code

```typescript
public static getDerivedStateFromError(error: Error): State {
  return { hasError: true, error, errorInfo: null, isReporting: false, isReported: false, showReview: false };
}
```

### Suggested Fix

```typescript
public static getDerivedStateFromError(error: Error): Partial<State> {
  return { hasError: true, error };
}
```

### Verification

1. TypeScript compilation should succeed
2. Error boundary behavior remains the same

---

## [INFO] Test Mocks Skip Actual Scrubbing Logic

> Tests don't verify that scrubbing is actually applied

**File**: `src/components/common/ErrorBoundary.test.tsx:17-19`  
**Category**: Testing  
**Severity**: Info  

### Description

The test file mocks `scrubObject` to return the input unchanged. This means tests don't verify that sensitive data is actually scrubbed before display or transmission. Consider adding integration-level tests that use the real scrubber.

### Current Code

```typescript
vi.mock('../../lib/scrubber', () => ({
  scrubObject: vi.fn((obj) => obj),
}))
```

### Suggested Improvement

Add a separate test file or test cases that use the real scrubber to verify integration:

```typescript
// In a separate integration test file
import { scrubObject } from '../../lib/scrubber';

it('scrubs sensitive data before sending feedback', async () => {
  const error = new Error('Failed for user@example.com');
  // ... render and trigger error
  
  await waitFor(() => {
    expect(sendFeedbackMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          name: 'Error',
          // Should contain [EMAIL] not actual email
        })
      })
    );
  });
});
```

---

## Checklist Summary

### Security (P0)
- [x] Input validation present and correct
- [x] No injection vulnerabilities
- [x] Secrets not hardcoded
- [x] Sensitive data properly handled (PII scrubbed before transmission)

### Correctness (P1)
- [x] Logic matches intended behavior
- [x] Edge cases handled (null checks)
- [x] Error handling present and appropriate
- [x] Types used correctly

### Performance (P2)
- [x] No N+1 queries or unbounded loops
- [x] No memory leaks
- [x] Appropriate data structures used

### Maintainability (P3)
- [x] Code is readable and self-documenting
- [x] Functions are focused (single responsibility)
- [x] No dead code or commented-out blocks
- [x] Consistent with project conventions

### Test Coverage (P4)
- [x] Tests exist for the functionality
- [x] Tests cover happy path and error cases
- [x] Tests are meaningful

---

## Verdict

**PASSED** - No critical or high severity issues. The component properly scrubs sensitive data before transmitting crash reports and provides good UX with the review data feature. The medium-severity issues are minor improvements that don't block approval.
