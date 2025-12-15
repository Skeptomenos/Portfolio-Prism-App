# TASK-404: Auth Modal Implementation Plan

> **Created:** 2024-12-15  
> **Status:** In Progress  
> **Dependencies:** TASK-205 (Completed)  
> **Workstream:** frontend

## Overview

Implement a React-based authentication modal for Trade Republic 2FA flow, using a slide-in panel design with session restore capabilities.

## Approved Design Decisions

| Decision | Choice |
|----------|--------|
| **Entry Point** | Blocking slide-in panel on first launch if not authenticated |
| **Session Restore** | "Welcome back! [Restore] / [Fresh Login]" prompt |
| **Remember Me** | Unchecked by default (more secure) |
| **Error Handling** | Inline error, let user retry in same modal |
| **Visual Style** | Slide-in panel from right |

## Architecture Flow

```
App Mount
    ↓
trCheckSavedSession()
    ↓
┌─────────────────────────┬──────────────────────────┐
│ hasSession: true        │ hasSession: false        │
│ → SessionRestorePrompt  │ → LoginForm              │
│   [Restore] → sync      │                          │
│   [Fresh] → LoginForm   │                          │
└─────────────────────────┴──────────────────────────┘
    ↓ (after login)
trLogin(phone, pin, remember)
    ↓
TwoFactorForm (countdown 30s)
    ↓
trSubmit2FA(code)
    ↓
Authenticated → Close Panel → Dashboard
```

## Implementation Steps

### 1. Extend Zustand Store (`src/store/useAppStore.ts`)

**New State Properties:**
```typescript
// Auth State
authState: AuthState;
isAuthPanelOpen: boolean;
authError: string | null;
savedPhone: string | null;
rememberMe: boolean;
```

**New Actions:**
```typescript
// Auth Actions
openAuthPanel: () => void;
closeAuthPanel: () => void;
setAuthState: (state: AuthState) => void;
setAuthError: (error: string | null) => void;
setSavedPhone: (phone: string | null) => void;
setRememberMe: (remember: boolean) => void;
```

### 2. Create Auth Components

**Directory Structure:**
```
src/components/auth/
├── AuthPanel.tsx           # Slide-in panel container
├── LoginForm.tsx           # Phone/PIN input
├── TwoFactorForm.tsx       # 2FA code with countdown
├── SessionRestorePrompt.tsx # "Welcome back" prompt
└── index.ts                # Export all components
```

**Component Specifications:**

#### AuthPanel.tsx
- Slide-in from right with overlay
- Render condition based on `authState`
- Handle outside click to close (when not auth)
- Smooth animations with CSS transitions

#### LoginForm.tsx
- Phone input: `+49` prefix, 10 digits masked
- PIN input: 4 digits, password type
- Remember me checkbox (unchecked by default)
- Login button with loading state
- Inline error display

#### TwoFactorForm.tsx
- 4-digit code input with auto-focus
- Countdown timer (30s from backend)
- Resend code option when timer expires
- Auto-submit when 4 digits entered
- Loading state during verification

#### SessionRestorePrompt.tsx
- Welcome back message
- Masked phone number display (`+49***1234`)
- [Restore Session] button (sync without login)
- [Fresh Login] button (force login flow)
- Error if restore fails

### 3. Update App.tsx

**New useEffect for Auth Check:**
```typescript
useEffect(() => {
  const checkAuth = async () => {
    const session = await trCheckSavedSession();
    if (session.hasSession) {
      // Show restore prompt
      setAuthState('waiting_2fa'); // Use this as "has saved session"
      setSavedPhone(session.phoneNumber || null);
    } else {
      // Show login form
      setAuthState('idle');
    }
    openAuthPanel();
  };
  
  checkAuth();
}, []);
```

**Conditional Rendering:**
```typescript
return (
  <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
    <Sidebar />
    <main style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
      {renderView()}
    </main>
    
    <AuthPanel />
    
    {/* Block interaction when auth is required */}
    {isAuthPanelOpen && authState !== 'authenticated' && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000
      }} />
    )}
  </div>
);
```

### 4. Integration with IPC Commands

**Auth Flow Handlers:**
```typescript
// Login form handler
const handleLogin = async (phone: string, pin: string, remember: boolean) => {
  try {
    setAuthError(null);
    setAuthState('waiting_2fa');
    const response = await trLogin(phone, pin, remember);
    
    if (response.authState === 'waiting_2fa') {
      // Countdown already in response
    }
  } catch (error) {
    setAuthError(error.message);
    setAuthState('idle');
  }
};

// 2FA form handler
const handle2FA = async (code: string) => {
  try {
    setAuthError(null);
    const response = await trSubmit2FA(code);
    
    if (response.authState === 'authenticated') {
      setAuthState('authenticated');
      closeAuthPanel();
      // Trigger portfolio sync
      await syncPortfolio(activePortfolioId);
    }
  } catch (error) {
    setAuthError(error.message);
  }
};

// Restore session handler
const handleRestore = async () => {
  try {
    setAuthError(null);
    const response = await trGetAuthStatus();
    
    if (response.authState === 'authenticated') {
      setAuthState('authenticated');
      closeAuthPanel();
      // Trigger portfolio sync
      await syncPortfolio(activePortfolioId);
    } else {
      // Session expired, show login
      setAuthState('idle');
    }
  } catch (error) {
    setAuthError(error.message);
    setAuthState('idle');
  }
};
```

## Testing Strategy

### Mock Data Testing
- Use existing mock data in `src/lib/ipc.ts`
- Test all auth flows in browser environment
- Verify error handling states

### Tauri Integration Testing
- Test with real Trade Republic credentials
- Verify session persistence across app restarts
- Test 2FA flow timing and countdown

### Edge Cases
- Network errors during auth
- Invalid 2FA code attempts
- Session expiration
- Component unmounting during async operations

## Files to Create/Modify

### New Files
1. `src/components/auth/AuthPanel.tsx`
2. `src/components/auth/LoginForm.tsx`
3. `src/components/auth/TwoFactorForm.tsx`
4. `src/components/auth/SessionRestorePrompt.tsx`
5. `src/components/auth/index.ts`
6. `docs/task-404-implementation-plan.md` (this file)

### Modified Files
1. `src/store/useAppStore.ts` - Add auth state slice
2. `src/App.tsx` - Add auth check and AuthPanel
3. `src/types/index.ts` - Already has auth types
4. `src/lib/ipc.ts` - Already has auth commands

## Success Criteria

- [ ] Auth panel slides in on first launch
- [ ] Login form accepts phone + PIN
- [ ] 2FA form shows countdown timer
- [ ] Session restore prompt works with saved credentials
- [ ] Errors display inline without breaking flow
- [ ] Main content is blocked until authenticated
- [ ] Panel smoothly animates open/closed
- [ ] Remember me setting persists
- [ ] Session survives app restart (when remember is checked)

## Timeline Estimate

- **Zustand Store Updates:** 30 minutes
- **AuthPanel Component:** 45 minutes  
- **LoginForm Component:** 60 minutes
- **TwoFactorForm Component:** 60 minutes
- **SessionRestorePrompt Component:** 45 minutes
- **App.tsx Integration:** 30 minutes
- **Testing & Polish:** 60 minutes

**Total:** ~5.5 hours

## Dependencies

- ✅ TASK-205: Real Trade Republic authentication (completed)
- ✅ Frontend state management (TASK-301)
- ✅ IPC bridge for auth commands (implemented in TASK-205)
- ⏳ None - ready to implement