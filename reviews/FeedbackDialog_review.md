# FeedbackDialog.tsx Code Review

**File**: `src/components/feedback/FeedbackDialog.tsx`  
**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**Result**: PASSED (2 Medium, 2 Low, 2 Info)

---

## Summary

The FeedbackDialog component provides a user interface for submitting feedback (bug reports, feature requests, UI/UX suggestions). The component is well-structured with proper state management, error handling, and a polished UI. No critical or high severity issues found.

---

## [MEDIUM] User Message Not Scrubbed Before Submission

> User-submitted feedback messages may contain PII that is sent to external service unscrubbed

**File**: `src/components/feedback/FeedbackDialog.tsx:41-50`  
**Category**: Security  
**Severity**: Medium  

### Description

When users submit feedback, the message content is sent directly to the Cloudflare Worker without PII scrubbing. Unlike the ErrorBoundary component (which uses `scrubObject` from `@/lib/scrubber.ts`), the FeedbackDialog does not scrub user input before submission.

Users could accidentally include:
- Phone numbers when describing call-back issues
- Email addresses when describing account problems
- IBANs when describing transaction issues

While this is user-submitted content (they choose what to write), providing automatic scrubbing would add a layer of privacy protection consistent with the project's "privacy-first" philosophy stated in AGENTS.md.

### Current Code

```typescript
const result = await sendFeedback({
  type,
  message,  // Raw user input - not scrubbed
  metadata: {
    source: 'user_dialog',
    view: currentView,
    environment: isTauri() ? 'tauri' : 'browser',
    lastSync: appState.lastSyncTime?.toISOString(),
  }
});
```

### Suggested Fix

```typescript
import { scrubText } from '@/lib/scrubber';

// In handleSubmit:
const result = await sendFeedback({
  type,
  message: scrubText(message),  // Scrub PII from user message
  metadata: {
    source: 'user_dialog',
    view: currentView,
    environment: isTauri() ? 'tauri' : 'browser',
    lastSync: appState.lastSyncTime?.toISOString(),
  }
});
```

### Verification

1. Submit feedback containing a phone number like "+49 123 456 7890"
2. Check the request payload in Network tab
3. Confirm phone number is replaced with `[PHONE]`

---

## [MEDIUM] No Test Coverage for FeedbackDialog Component

> Critical user-facing component lacks unit tests

**File**: `src/components/feedback/FeedbackDialog.tsx`  
**Category**: Testing  
**Severity**: Medium  

### Description

The FeedbackDialog component has no corresponding test file (`FeedbackDialog.test.tsx`). This component handles:
- User input collection
- API submission with error handling
- Complex UI state transitions (loading, success, error states)
- Form validation

Other similar components in the project have test coverage (e.g., `LoginForm.test.tsx`, `TwoFactorModal.test.tsx`, `Modal.test.tsx`).

### Current Code

```
// No test file exists at src/components/feedback/FeedbackDialog.test.tsx
```

### Suggested Fix

Create `src/components/feedback/FeedbackDialog.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FeedbackDialog } from './FeedbackDialog';

// Mock dependencies
vi.mock('@/lib/api/feedback', () => ({
  sendFeedback: vi.fn(),
}));

vi.mock('@/store/useAppStore', () => ({
  useCurrentView: () => 'dashboard',
  useAppStore: {
    getState: () => ({ lastSyncTime: new Date() }),
  },
}));

vi.mock('@/lib/tauri', () => ({
  isTauri: () => false,
}));

import { sendFeedback } from '@/lib/api/feedback';

describe('FeedbackDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(<FeedbackDialog isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Send Feedback')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<FeedbackDialog isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText('Send Feedback')).not.toBeInTheDocument();
  });

  it('submits feedback successfully', async () => {
    (sendFeedback as vi.Mock).mockResolvedValue({ issue_url: 'https://github.com/...' });
    
    render(<FeedbackDialog isOpen={true} onClose={() => {}} />);
    
    fireEvent.change(screen.getByPlaceholderText(/tell us/i), {
      target: { value: 'This is my feedback' },
    });
    fireEvent.click(screen.getByText('Send Feedback'));
    
    await waitFor(() => {
      expect(screen.getByText('Feedback Sent!')).toBeInTheDocument();
    });
  });

  it('shows error on submission failure', async () => {
    (sendFeedback as vi.Mock).mockRejectedValue(new Error('Network error'));
    
    render(<FeedbackDialog isOpen={true} onClose={() => {}} />);
    
    fireEvent.change(screen.getByPlaceholderText(/tell us/i), {
      target: { value: 'Test feedback' },
    });
    fireEvent.click(screen.getByText('Send Feedback'));
    
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('disables submit button when message is empty', () => {
    render(<FeedbackDialog isOpen={true} onClose={() => {}} />);
    
    const submitButton = screen.getByText('Send Feedback').closest('button');
    expect(submitButton).toBeDisabled();
  });
});
```

### Verification

1. Run `npm test src/components/feedback/FeedbackDialog.test.tsx`
2. Verify all tests pass
3. Check coverage report for FeedbackDialog

---

## [LOW] Console.error Logs Full Error Object

> Error logging could include sensitive information in production

**File**: `src/components/feedback/FeedbackDialog.tsx:55`  
**Category**: Security  
**Severity**: Low  

### Description

When feedback submission fails, the full error object is logged to the console. In production, this could expose sensitive information if the error contains request/response details.

### Current Code

```typescript
} catch (err) {
  console.error('Failed to send feedback:', err);
  // ...
}
```

### Suggested Fix

```typescript
} catch (err) {
  console.error('Failed to send feedback:', err instanceof Error ? err.message : 'Unknown error');
  // ...
}
```

### Verification

1. Trigger a feedback submission failure
2. Check console output contains only the message, not full error stack/details

---

## [LOW] Accessing Store State in Event Handler

> Direct store access pattern differs from hook pattern used elsewhere

**File**: `src/components/feedback/FeedbackDialog.tsx:40`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The component uses `useAppStore.getState()` inside the `handleSubmit` event handler rather than accessing state through the hook at render time. While this works correctly, it's inconsistent with how other values (like `currentView`) are accessed through hooks.

This pattern is actually correct for event handlers to avoid stale closures, but could benefit from a comment explaining why.

### Current Code

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  // ...
  const appState = useAppStore.getState();
  const result = await sendFeedback({
    // ...
    metadata: {
      lastSync: appState.lastSyncTime?.toISOString(),
    }
  });
};
```

### Suggested Fix

Add a comment explaining the pattern:

```typescript
const handleSubmit = async (e: React.FormEvent) => {
  // ...
  // Get fresh state at submission time to avoid stale closures
  const appState = useAppStore.getState();
  // ...
};
```

### Verification

Code review only - no functional change needed.

---

## [INFO] External Link Uses Proper Security Attributes

> Good practice: rel="noopener noreferrer" is correctly used

**File**: `src/components/feedback/FeedbackDialog.tsx:137-145`  
**Category**: Security  
**Severity**: Info  

### Description

The GitHub issue link correctly uses `target="_blank"` with `rel="noopener noreferrer"`, preventing the new tab from accessing `window.opener`. This follows security best practices for external links.

### Current Code

```tsx
<a
  href={issueUrl}
  target="_blank"
  rel="noopener noreferrer"  // Correct security attributes
  className="..."
>
```

No action required - this is a positive finding.

---

## [INFO] Issue URL Mock Detection is Fragile

> Mock URL detection relies on string matching

**File**: `src/components/feedback/FeedbackDialog.tsx:136`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The component hides the "View on GitHub" link when the issue URL contains "mock". This is a reasonable approach for development but could be made more explicit.

### Current Code

```tsx
{issueUrl && !issueUrl.includes('mock') && (
  <a href={issueUrl} ...>View on GitHub</a>
)}
```

### Suggested Improvement

Consider using an environment flag or a more explicit check:

```typescript
const isRealIssue = issueUrl && !issueUrl.includes('mock-issue-url');
// or
const isRealIssue = issueUrl && import.meta.env.VITE_WORKER_URL;
```

No action required - current approach works correctly.

---

## Checklist Summary

### Security (P0)
- [x] Input validation present (empty message check)
- [x] No XSS vulnerabilities (React auto-escapes)
- [x] No injection vulnerabilities (JSON API)
- [x] External links properly secured
- [ ] User message not scrubbed for PII (Medium)

### Correctness (P1)
- [x] Logic matches intended behavior
- [x] Edge cases handled (empty message)
- [x] Error handling present and appropriate
- [x] State properly reset on close

### Performance (P2)
- [x] No unnecessary re-renders
- [x] Single API call per submission
- [x] No memory leaks

### Maintainability (P3)
- [x] Code is readable
- [x] Functions are focused
- [x] No dead code
- [x] Follows project conventions

### Testing (P4)
- [ ] No test file exists (Medium)
- [ ] Happy path not tested
- [ ] Error cases not tested
