# Code Review: Toast.tsx

**File**: `src/components/ui/Toast.tsx`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Result**: PASSED (2M, 2L, 2I)

---

## Summary

The Toast notification component is a well-structured, self-contained UI component that displays glassmorphic toast notifications. It follows React best practices and has no security vulnerabilities. The findings are primarily accessibility and maintainability improvements.

---

## [MEDIUM] Missing Accessibility Attributes on Close Button

> Close button lacks aria-label, making it inaccessible to screen readers

**File**: `src/components/ui/Toast.tsx:152-162`  
**Category**: Maintainability  
**Severity**: Medium  

### Description

The close button uses an SVG icon but has no accessible label. Screen reader users won't understand the button's purpose. Additionally, there's no keyboard shortcut (Escape key) to dismiss toasts.

### Current Code

```typescript
<button
  style={styles.closeButton}
  onClick={() => onDismiss(toast.id)}
  onMouseEnter={(e) => (e.currentTarget.style.color = '#f8fafc')}
  onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
</button>
```

### Suggested Fix

```typescript
<button
  style={styles.closeButton}
  onClick={() => onDismiss(toast.id)}
  onMouseEnter={(e) => (e.currentTarget.style.color = '#f8fafc')}
  onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
  aria-label={`Dismiss ${toast.title} notification`}
  type="button"
>
  <svg 
    width="16" 
    height="16" 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
</button>
```

### Verification

1. Run accessibility audit with axe-core
2. Test with VoiceOver on macOS
3. Verify button is focusable and announces correctly

---

## [MEDIUM] Toast Container Missing ARIA Live Region

> Toasts are not announced to screen readers when they appear

**File**: `src/components/ui/Toast.tsx:173-194`  
**Category**: Maintainability  
**Severity**: Medium  

### Description

The toast container should be an ARIA live region so screen readers announce new notifications. Without this, visually impaired users miss important notifications.

### Current Code

```typescript
<div style={styles.container}>
  {toasts.map((toast) => (
    <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
  ))}
</div>
```

### Suggested Fix

```typescript
<div 
  style={styles.container}
  role="region"
  aria-label="Notifications"
  aria-live="polite"
  aria-relevant="additions removals"
>
  {toasts.map((toast) => (
    <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
  ))}
</div>
```

### Verification

1. Add a toast programmatically
2. Verify screen reader announces the notification
3. Test with both VoiceOver and NVDA

---

## [LOW] Inline Style Tag Re-renders on Every Mount

> Animation keyframes defined in JSX cause unnecessary DOM updates

**File**: `src/components/ui/Toast.tsx:175-187`  
**Category**: Performance  
**Severity**: Low  

### Description

The `<style>` tag with keyframe animation is rendered inside the component. While React is smart enough to not create duplicates, it's inefficient and causes style recalculation on mount.

### Current Code

```typescript
<>
  <style>
    {`
      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `}
  </style>
  <div style={styles.container}>
```

### Suggested Fix

Move keyframes to a CSS file or use CSS-in-JS with static extraction:

```css
/* In index.css or a dedicated toast.css */
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

Then remove the inline style tag from the component.

### Verification

1. Move styles to CSS file
2. Verify animation still works
3. Check no style duplication in DOM

---

## [LOW] Magic Colors Could Use Theme Constants

> Hardcoded color values reduce maintainability and theming flexibility

**File**: `src/components/ui/Toast.tsx:13-122`  
**Category**: Maintainability  
**Severity**: Low  

### Description

Colors are hardcoded throughout the component (e.g., `#f8fafc`, `#94a3b8`, `#10b981`). This makes theming difficult and creates inconsistency risk across the app.

### Current Code

```typescript
const styles = {
  toast: {
    background: 'rgba(15, 20, 32, 0.95)',
    // ...
  },
  title: {
    color: '#f8fafc',
    // ...
  },
  message: {
    color: '#94a3b8',
    // ...
  },
};

const typeConfig = {
  success: {
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.15)',
    // ...
  },
  // ...
};
```

### Suggested Fix

Import from a central theme or use CSS variables:

```typescript
// Option 1: CSS variables
const styles = {
  toast: {
    background: 'var(--toast-bg, rgba(15, 20, 32, 0.95))',
  },
  title: {
    color: 'var(--text-primary, #f8fafc)',
  },
  message: {
    color: 'var(--text-secondary, #94a3b8)',
  },
};

// Option 2: Theme object import
import { colors } from '@/theme';

const typeConfig = {
  success: {
    color: colors.success,
    bgColor: colors.successBg,
  },
};
```

### Verification

1. Extract colors to theme file
2. Verify visual appearance unchanged
3. Test dark/light mode if applicable

---

## [INFO] Test Coverage is Good but Missing Accessibility Tests

> Existing tests are comprehensive but don't verify a11y compliance

**File**: `src/components/ui/Toast.test.tsx`  
**Category**: Testing  
**Severity**: Info  

### Description

The test file has good coverage for functional requirements but lacks accessibility testing. Consider adding axe-core integration for automated a11y checks.

### Suggested Addition

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

it('has no accessibility violations', async () => {
  const toasts: Toast[] = [
    { id: '1', type: 'success', title: 'Test', message: 'Message' },
  ];
  mockUseToasts.mockReturnValue(toasts);
  
  const { container } = render(<ToastContainer />);
  const results = await axe(container);
  
  expect(results).toHaveNoViolations();
});
```

### Verification

1. Add jest-axe to dev dependencies
2. Run accessibility test
3. Fix any violations found

---

## [INFO] Consider Exit Animation

> Toasts appear with animation but disappear abruptly

**File**: `src/components/ui/Toast.tsx`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The component has a `slideInRight` animation for appearance but no exit animation. Adding a fade-out or slide-out animation would improve UX.

### Suggested Approach

This would require tracking "exiting" state for each toast. Options:
1. Use Framer Motion's `AnimatePresence`
2. Add CSS transition with setTimeout before removal
3. Use react-transition-group

This is a nice-to-have enhancement, not a required fix.

---

## Security Findings

None. This is a pure UI component that:
- Uses React's built-in XSS protection (no `dangerouslySetInnerHTML`)
- Does not handle user input directly
- Does not interact with external services
- Does not store or process sensitive data

---

## Checklist Summary

| Category | Status | Notes |
|----------|--------|-------|
| Security | PASS | No vulnerabilities |
| Correctness | PASS | Logic correct, handles edge cases |
| Performance | PASS | Minor style optimization possible |
| Maintainability | PASS | A11y and theming improvements suggested |
| Testing | PASS | Good coverage, a11y tests recommended |
