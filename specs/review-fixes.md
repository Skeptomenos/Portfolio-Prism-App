# Review Fixes

> **Status**: Open
> **Type**: Fix

This document aggregates actionable fixes from code reviews.

---

## Fixes from commands_rs_review.md

> **Source**: `reviews/commands_rs_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 3 Medium severity

### Context

The `commands.rs` file defines the IPC boundary between React frontend and Python sidecar. These fixes address input validation gaps at the Rust layer—defense in depth before data reaches Python.

### Phase 1: File Path Validation

**Issue**: `upload_holdings` accepts file paths without validation, enabling potential path traversal.

**Location**: `src-tauri/src/commands.rs:727-755`

**Current Code**:
```rust
pub async fn upload_holdings(
    file_path: String,
    etf_isin: String,
    engine: State<'_, Arc<PythonEngine>>,
) -> Result<serde_json::Value, String> {
    // No path validation - passed directly to Python
    let payload = json!({
        "filePath": file_path,
        "etfIsin": etf_isin
    });
```

**Tasks**:
- [ ] Add `validate_file_path()` helper in `commands.rs` that:
  - Checks file exists via `PathBuf::exists()`
  - Validates extension is one of: `csv`, `xlsx`, `xls`, `json`
  - Canonicalizes path to prevent traversal (`..` attacks)
- [ ] Apply validation in `upload_holdings` before constructing payload
- [ ] Return user-friendly error messages for each validation failure
- [ ] Test with path traversal attempts (`../../etc/passwd`)
- [ ] Test with unsupported extensions (`.exe`, `.sh`)

### Phase 2: ISIN Format Validation

**Issue**: `etf_isin` parameter passed without format validation; malformed ISINs waste API calls.

**Location**: `src-tauri/src/commands.rs:728-729`

**Current Code**:
```rust
pub async fn upload_holdings(
    file_path: String,
    etf_isin: String,  // No format validation
```

**Tasks**:
- [ ] Add `validate_isin()` helper in `commands.rs` that:
  - Checks length is exactly 12 characters
  - First 2 chars are uppercase ASCII letters (country code)
  - Remaining 10 chars are alphanumeric
- [ ] Apply validation in `upload_holdings` before constructing payload
- [ ] Test with invalid ISINs (wrong length, lowercase, special chars)
- [ ] Test with valid ISINs (`IE00B4L5Y983`, `US67066G1040`)

### Phase 3: Credential Logging Prevention

**Issue**: `tr_login` error path could leak phone/PIN in logs or crash reports.

**Location**: `src-tauri/src/commands.rs:521-561`

**Current Code**:
```rust
Err(e) => Err(format!("Failed to login: {}", e)),  // Error may include context
```

**Tasks**:
- [ ] Replace specific error with generic message: `"Login failed. Please check your credentials."`
- [ ] Ensure no `eprintln!` or `log::debug!` outputs contain phone/pin
- [ ] Add code comment: `// SECURITY: Never log phone or pin`
- [ ] Audit `tr_submit_2fa` for similar issues

### Verification Steps

1. Build and run: `npm run tauri dev`
2. Test upload with invalid file path → expect clear error
3. Test upload with invalid ISIN → expect format error
4. Fail login with wrong PIN → confirm error message is generic
5. Check `stderr` output during failed login → no credentials visible

---

## Fixes from Dashboard_review.md

> **Source**: `reviews/Dashboard_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `Dashboard.tsx` component (320 lines) has defensive coding gaps and maintainability concerns. These fixes address null safety and component decomposition.

### Phase 1: Null Safety for History Array

**Issue**: `dashboardData.history.map()` called without null check; backend could return undefined, causing runtime crash.

**Location**: `src/components/views/Dashboard.tsx:131`

**Current Code**:
```typescript
const sparklineData = dashboardData.history.map(h => h.value);
```

**Tasks**:
- [ ] Add optional chaining with nullish coalescing: `dashboardData.history?.map(h => h.value) ?? []`
- [ ] Verify chart component handles empty array gracefully
- [ ] Add unit test with `history: undefined` in mock data

### Phase 2: Component Decomposition

**Issue**: 320-line component exceeds ~100 line guideline; distinct sections should be extracted for testability and maintainability.

**Location**: `src/components/views/Dashboard.tsx:1-320`

**Tasks**:
- [ ] Extract `DashboardSkeleton.tsx` (loading state, lines 31-65)
- [ ] Extract `TopHoldingsList.tsx` (top holdings section, lines 181-246)
- [ ] Extract `TrueExposureCard.tsx` (true exposure section, lines 248-316)
- [ ] Update `Dashboard.tsx` to import and use extracted components
- [ ] Ensure existing tests pass after refactor
- [ ] Add unit tests for each extracted component

### Verification Steps

1. Run `npm test src/components/views/Dashboard` → all tests pass
2. Test with `history: undefined` mock → no crash, empty sparkline renders
3. Visually verify Dashboard appears unchanged after refactor
4. Confirm `Dashboard.tsx` is under 150 lines after extraction

---

## Fixes from xtrackers_py_review.md

> **Source**: `reviews/xtrackers_py_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `xtrackers.py` adapter fetches ETF holdings from DWS/Xtrackers API. These fixes address input validation and response schema validation—consistent with similar fixes applied to `ishares.py` and `vanguard.py` adapters.

### Phase 1: ISIN Input Validation

**Issue**: User input is used directly in URL construction without validation; malformed input could cause unexpected behavior.

**Location**: `src-tauri/python/portfolio_src/adapters/xtrackers.py:27-40`

**Current Code**:
```python
@cache_adapter_data(ttl_hours=24)
def fetch_holdings(self, isin: str) -> pd.DataFrame:
    logger.info(f"--- Fetching holdings for {isin} ---")
    
    # Construct the URL based on the discovered API pattern
    url = f"https://etf.dws.com/etfdata/export/DEU/DEU/csv/product/constituent/{isin}/"
```

**Tasks**:
- [ ] Import `is_valid_isin` from `portfolio_src.prism_utils.isin_validator`
- [ ] Add ISIN validation at start of `fetch_holdings()`:
  ```python
  if not isin or not is_valid_isin(isin):
      logger.warning(f"Invalid ISIN format: {isin}")
      return pd.DataFrame()
  ```
- [ ] Test with valid ISIN (`IE00BL25JP72`) → should work
- [ ] Test with path traversal attempt (`../../../etc/passwd`) → should return empty DataFrame
- [ ] Test with empty string → should return empty DataFrame

### Phase 2: Column Validation Before Rename

**Issue**: Assumes expected columns exist in CSV response; API format change could raise unhandled `KeyError`.

**Location**: `src-tauri/python/portfolio_src/adapters/xtrackers.py:64-71`

**Current Code**:
```python
holdings_df.rename(
    columns={
        "Constituent Name": "name",
        "Constituent ISIN": "isin",
        "Constituent Weighting": "weight_percentage",
    },
    inplace=True,
)
```

**Tasks**:
- [ ] Define expected columns constant:
  ```python
  EXPECTED_COLUMNS = ["Constituent Name", "Constituent ISIN", "Constituent Weighting"]
  ```
- [ ] Add column validation before rename:
  ```python
  missing_cols = [col for col in EXPECTED_COLUMNS if col not in holdings_df.columns]
  if missing_cols:
      logger.error(
          f"Missing expected columns in Xtrackers response: {missing_cols}. "
          f"Found columns: {holdings_df.columns.tolist()}"
      )
      return pd.DataFrame()
  ```
- [ ] Test with mock API response containing wrong column names → should return empty DataFrame with error log
- [ ] Test with normal valid response → should work as expected

### Verification Steps

1. Run adapter tests: `pytest src-tauri/python/tests/ -k xtrackers`
2. Test with invalid ISIN via Python REPL → verify warning logged and empty DataFrame returned
3. Mock malformed CSV response → verify error logged and empty DataFrame returned
4. Verify existing ETF fetches still work (`IE00BL25JP72`)

---

## Fixes from FeedbackDialog_review.md

> **Source**: `reviews/FeedbackDialog_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `FeedbackDialog.tsx` component handles user feedback submission. These fixes address PII protection consistent with the project's "privacy-first" philosophy (stated in `AGENTS.md`) and add missing test coverage.

### Phase 1: Scrub PII from User Feedback Message

**Issue**: User-submitted feedback messages are sent to external service without PII scrubbing. Users may accidentally include phone numbers, emails, or IBANs when describing issues.

**Location**: `src/components/feedback/FeedbackDialog.tsx:41-50`

**Current Code**:
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

**Tasks**:
- [ ] Import `scrubText` from `@/lib/scrubber` in `FeedbackDialog.tsx`
- [ ] Apply `scrubText(message)` before sending to `sendFeedback()`
- [ ] Test with phone number input (`+49 123 456 7890`) → verify replaced with `[PHONE]`
- [ ] Test with email input (`user@example.com`) → verify replaced with `[EMAIL]`
- [ ] Test with IBAN input (`DE89370400440532013000`) → verify replaced with `[IBAN]`

### Phase 2: Add Test Coverage for FeedbackDialog

**Issue**: Critical user-facing component lacks unit tests. Other similar components (`LoginForm`, `TwoFactorModal`, `Modal`) have test coverage.

**Location**: `src/components/feedback/FeedbackDialog.tsx` (no test file exists)

**Tasks**:
- [ ] Create `src/components/feedback/FeedbackDialog.test.tsx`
- [ ] Add test: renders when `isOpen={true}`
- [ ] Add test: does not render when `isOpen={false}`
- [ ] Add test: submits feedback successfully (mock `sendFeedback`)
- [ ] Add test: shows error message on submission failure
- [ ] Add test: disables submit button when message is empty
- [ ] Add test: verifies PII scrubbing is applied to message before submission

**Test Template** (from review):
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { FeedbackDialog } from './FeedbackDialog';

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

### Verification Steps

1. Run `npm test src/components/feedback/FeedbackDialog.test.tsx` → all tests pass
2. Open app, submit feedback with phone number → check Network tab, confirm `[PHONE]` in payload
3. Check coverage report includes `FeedbackDialog.tsx`

---

## Fixes from Cargo_toml_review.md

> **Source**: `reviews/Cargo_toml_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `Cargo.toml` configuration for the Tauri shell lacks automated security scanning and uses loose version constraints. These fixes address supply chain security—consistent with the project's security-first philosophy.

### Phase 1: Tighten Dependency Version Constraints

**Issue**: All dependencies use major version constraints (e.g., `"1"`, `"2"`) rather than minor version constraints. CI/CD rebuilds or `cargo update` could pull in newer minor versions with potential security issues or breaking changes.

**Location**: `src-tauri/Cargo.toml:17-29`

**Current Code**:
```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["sync", "time"] }
```

**Tasks**:
- [ ] Update `tauri` version constraint from `"2"` to `"2.0"` in `src-tauri/Cargo.toml`
- [ ] Update `serde` version constraint from `"1"` to `"1.0"` in `src-tauri/Cargo.toml`
- [ ] Update `tokio` version constraint from `"1"` to `"1.0"` in `src-tauri/Cargo.toml`
- [ ] Update `tauri-build` version constraint from `"2"` to `"2.0"` in `[build-dependencies]`
- [ ] Update `tauri-plugin-shell` version constraint from `"2"` to `"2.0"`
- [ ] Verify `Cargo.lock` is committed to version control
- [ ] Run `cargo build` to verify constraints resolve correctly

### Phase 2: Add cargo-deny Security Scanning

**Issue**: No automated security scanning for Rust dependencies. Without auditing, vulnerable dependencies may go undetected.

**Location**: `src-tauri/` (missing `deny.toml` configuration)

**Current Code**: No `deny.toml` exists.

**Tasks**:
- [ ] Create `src-tauri/deny.toml` with the following content:
  ```toml
  [advisories]
  db-path = "~/.cargo/advisory-db"
  vulnerability = "deny"
  unmaintained = "warn"
  yanked = "deny"
  
  [licenses]
  unlicensed = "deny"
  allow = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "MPL-2.0"]
  
  [bans]
  multiple-versions = "warn"
  wildcards = "deny"
  ```
- [ ] Add `cargo-audit` step to CI pipeline (`.github/workflows/ci.yml`):
  ```yaml
  - name: Security audit
    run: |
      cargo install cargo-audit
      cd src-tauri && cargo audit
  ```
- [ ] Run `cargo audit` locally and fix any reported vulnerabilities
- [ ] Document in `AGENTS.md` or `docs/` that `cargo audit` is part of CI

### Verification Steps

1. Run `cargo update --dry-run` in `src-tauri/` → verify no major version jumps
2. Run `cargo build` → build succeeds with tightened constraints
3. Run `cargo audit` in `src-tauri/` → no critical vulnerabilities reported
4. Verify `deny.toml` is tracked in git: `git status src-tauri/deny.toml`

---

## Fixes from ipc_ts_review.md

> **Source**: `reviews/ipc_ts_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 High, 3 Medium severity

### Context

The `ipc.ts` module (379 lines) handles all IPC communication between the React frontend and Python sidecar. These fixes address credential exposure in error logs, hardcoded tokens, silent error swallowing, and type safety gaps.

### Phase 1: Scrub Credentials Before Error Logging (HIGH)

**Issue**: Auth credentials (phone, PIN) are logged to system database when `tr_login` fails. The `scrubObject` utility exists in `scrubber.ts` but is not applied before logging error context.

**Location**: `src/lib/ipc.ts:67-72`

**Current Code**:
```typescript
// Log to system logs for auto-reporting
logEvent('ERROR', `Backend Error: ${errorMsg}`, { 
  command, 
  code: errorCode,
  payload  // <-- CREDENTIALS INCLUDED for tr_login!
}, 'pipeline', 'api_error');
```

**Tasks**:
- [ ] Import `scrubObject` from `./scrubber` at top of `ipc.ts`
- [ ] Create safe payload for auth commands before logging:
  ```typescript
  const AUTH_COMMANDS = ['tr_login', 'tr_submit_2fa'];
  const safePayload = AUTH_COMMANDS.includes(command)
    ? { ...payload, phone: '[REDACTED]', pin: '[REDACTED]', code: '[REDACTED]' }
    : scrubObject(payload);
  ```
- [ ] Update `logEvent` call to use `safePayload` instead of raw `payload`
- [ ] Add unit test: mock `logEvent`, call `tr_login` with bad credentials, verify logged payload contains `[REDACTED]`
- [ ] Test manually: fail `tr_login`, check `system_logs` table for credential exposure

### Phase 2: Use Environment Variable for Echo Bridge Token (MEDIUM)

**Issue**: Echo-Bridge token `'dev-echo-bridge-secret'` is hardcoded. While only used in dev mode, this exposes security mechanism and prevents configuration.

**Location**: `src/lib/ipc.ts:47`

**Current Code**:
```typescript
headers: { 
  'Content-Type': 'application/json',
  'X-Echo-Bridge-Token': 'dev-echo-bridge-secret'
},
```

**Tasks**:
- [ ] Update to use Vite environment variable with fallback:
  ```typescript
  'X-Echo-Bridge-Token': import.meta.env.VITE_ECHO_BRIDGE_TOKEN || 'dev-fallback'
  ```
- [ ] Add `VITE_ECHO_BRIDGE_TOKEN` to `.env.example` with comment:
  ```bash
  # Echo Bridge authentication token (dev mode only)
  # VITE_ECHO_BRIDGE_TOKEN=your-dev-token-here
  ```
- [ ] Verify Vite exposes the variable (check `vite.config.ts` if needed)
- [ ] Test with custom token set → confirm authentication works

### Phase 3: Return Status from setHiveContribution (MEDIUM)

**Issue**: `setHiveContribution` catches errors silently without indicating failure to caller. User may think preference was saved when it wasn't.

**Location**: `src/lib/ipc.ts:359-365`

**Current Code**:
```typescript
export async function setHiveContribution(enabled: boolean): Promise<void> {
  try {
    await callCommand('set_hive_contribution', { enabled });
  } catch (error) {
    console.error('[IPC] set_hive_contribution failed:', error);
  }
}
```

**Tasks**:
- [ ] Change return type from `Promise<void>` to `Promise<boolean>`:
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
- [ ] Update `TauriCommands` interface in `src/types/index.ts` if needed (currently returns `void`)
- [ ] Update callers to check return value and show feedback on failure
- [ ] Add unit test: mock failed `callCommand`, verify `false` returned

### Phase 4: Add Proper Types for IPC Functions (MEDIUM)

**Issue**: Functions `uploadHoldings`, `getPendingReviews`, and `getPipelineReport` return `any`, bypassing TypeScript safety.

**Location**: `src/lib/ipc.ts:280, 333, 345` and `src/types/index.ts:247, 255, 272`

**Current Code**:
```typescript
export async function uploadHoldings(filePath: string, etfIsin: string): Promise<any>
export async function getPendingReviews(): Promise<any[]>
export async function getPipelineReport(): Promise<any>
```

**Tasks**:
- [ ] Add `UploadHoldingsResponse` type to `src/types/index.ts`:
  ```typescript
  export interface UploadHoldingsResponse {
    success: boolean;
    recordsImported: number;
    errors?: string[];
  }
  ```
- [ ] Add `PendingReview` type to `src/types/index.ts`:
  ```typescript
  export interface PendingReview {
    id: string;
    isin: string;
    suggestedName: string;
    confidence: number;
  }
  ```
- [ ] Add `PipelineReport` type to `src/types/index.ts`:
  ```typescript
  export interface PipelineReport {
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastRun: string;
    errors: string[];
  }
  ```
- [ ] Update `TauriCommands` interface to use new types instead of `any`
- [ ] Update function signatures in `ipc.ts` to use new types
- [ ] Verify types match actual backend responses (check Python command handlers)
- [ ] Run `npm run typecheck` to verify no type errors

### Verification Steps

1. Run `npm run typecheck` → no errors
2. Run `npm test src/lib/ipc` → all tests pass
3. Fail `tr_login` with wrong credentials → check `system_logs` table, confirm no phone/PIN in `context` column
4. Set `VITE_ECHO_BRIDGE_TOKEN` in `.env` → confirm Echo Bridge works with custom token
5. Mock `set_hive_contribution` failure → confirm `false` returned to caller
6. Review `uploadHoldings`, `getPendingReviews`, `getPipelineReport` → confirm typed responses

---

## Fixes from TwoFactorModal_review.md

> **Source**: `reviews/TwoFactorModal_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 High, 2 Medium severity

### Context

The `TwoFactorModal.tsx` component handles 2FA code entry during Trade Republic authentication. These fixes address credential exposure in React props, brute-force protection, and React hook correctness.

### Phase 1: Remove Credential Retention in Props (HIGH)

**Issue**: Phone and PIN credentials are passed as props and retained in memory during entire 2FA session. Credentials visible in React DevTools and potentially logged on error via `ipc.ts:68-72`.

**Location**: `src/components/auth/TwoFactorModal.tsx:112-114, 242`

**Current Code**:
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

**Tasks**:
- [ ] Refactor `TwoFactorModalProps` to use callback pattern instead of credential props:
  ```typescript
  interface TwoFactorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    onResendRequest: () => Promise<void>;  // Parent handles resend
    initialCountdown?: number;
  }
  ```
- [ ] Update parent component (`LoginForm.tsx` or `TradeRepublicView.tsx`) to:
  - Clear `phone` and `pin` state after initial login succeeds
  - Provide `onResendRequest` callback that re-invokes login internally
- [ ] Remove `phone`, `pin`, `remember` props from `TwoFactorModal`
- [ ] Update `handleResend` to call `onResendRequest()` instead of `trLogin()` directly
- [ ] Verify React DevTools shows no credential props in `TwoFactorModal`
- [ ] Test error path in `handleResend` → confirm no credentials logged

**Related**: Coordinate with `LoginForm_review.md` fixes (same pattern)

### Phase 2: Add Local Rate Limiting on 2FA Attempts (MEDIUM)

**Issue**: No client-side throttling on 2FA submissions. Allows rapid brute-force before server rate limits trigger, risking account lockouts.

**Location**: `src/components/auth/TwoFactorModal.tsx:199-233`

**Current Code**:
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

**Tasks**:
- [ ] Add state for attempt tracking and lockout:
  ```typescript
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_MS = 60000;  // 1 minute
  
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  ```
- [ ] Add lockout check at start of `handleVerify`:
  ```typescript
  if (lockedUntil && Date.now() < lockedUntil) {
    const remainingSeconds = Math.ceil((lockedUntil - Date.now()) / 1000);
    setError(`Too many attempts. Please wait ${remainingSeconds}s`);
    return;
  }
  ```
- [ ] Increment attempts on failed verification; trigger lockout after MAX_ATTEMPTS
- [ ] Reset attempts counter on successful verification
- [ ] Display remaining attempts in error message: `"Invalid code (${remaining} attempts left)"`
- [ ] Test rapid incorrect code submission → verify lockout triggers

### Phase 3: Fix Auto-Submit useEffect Race Condition (MEDIUM)

**Issue**: Auto-submit `useEffect` may cause double submissions due to stale closure and missing dependencies.

**Location**: `src/components/auth/TwoFactorModal.tsx:157-163`

**Current Code**:
```typescript
// Auto-submit when all digits entered
useEffect(() => {
  const fullCode = code.join('');
  if (fullCode.length === 4 && !isLoading) {
    handleVerify();  // Called from effect, handleVerify not in deps
  }
}, [code]);  // Missing isLoading, handleVerify in deps
```

**Tasks**:
- [ ] Add ref to prevent double-submission:
  ```typescript
  const isSubmittingRef = useRef(false);
  ```
- [ ] Wrap `handleVerify` in `useCallback` with proper dependencies:
  ```typescript
  const handleVerify = useCallback(async () => {
    // ... existing implementation
  }, [setAuthState, addToast, onSuccess]);
  ```
- [ ] Update useEffect with complete dependency array and submission guard:
  ```typescript
  useEffect(() => {
    const fullCode = code.join('');
    if (fullCode.length === 4 && !isLoading && !isSubmittingRef.current) {
      isSubmittingRef.current = true;
      handleVerify().finally(() => {
        isSubmittingRef.current = false;
      });
    }
  }, [code, isLoading, handleVerify]);
  ```
- [ ] Test paste + immediate key press → verify only one submission
- [ ] Test with React StrictMode enabled → no double submissions

### Verification Steps

1. Run `npm test src/components/auth/TwoFactorModal` → all tests pass
2. Open React DevTools during 2FA flow → confirm no `phone`/`pin` in props
3. Submit 5 incorrect codes rapidly → verify lockout message appears
4. Paste 4-digit code → verify exactly one API call made
5. Check browser console for credential leaks during error scenarios

---

## Fixes from tr_protocol_review.md

> **Source**: `reviews/tr_protocol_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 3 Medium severity

### Context

The `tr_protocol.py` module defines the JSON-RPC protocol for communication between the Tauri app and the TR daemon subprocess. These fixes address type safety and response validation gaps that could cause silent failures or type checker confusion.

### Phase 1: Fix Type Annotation Mismatch in TRError

**Issue**: `method` parameter is annotated as `str` but defaults to `None`, violating type safety.

**Location**: `src-tauri/python/portfolio_src/core/tr_protocol.py:46`

**Current Code**:
```python
class TRError(Exception):
    """TR daemon specific error."""

    def __init__(self, message: str, method: str = None):
        super().__init__(message)
        self.method = method
        self.message = message
```

**Tasks**:
- [ ] Update `TRError.__init__` signature to use `Optional[str]`:
  ```python
  def __init__(self, message: str, method: Optional[str] = None):
  ```
- [ ] Verify `Optional` is already imported from `typing` (line 10 confirms it is)
- [ ] Run mypy: `mypy src-tauri/python/portfolio_src/core/tr_protocol.py`
- [ ] Verify existing tests pass: `pytest src-tauri/python/tests/test_tr_protocol.py`

### Phase 2: Add Type Validation in deserialize_response

**Issue**: `result` field accepts any JSON type without validating it matches `Optional[dict]`. Malformed daemon responses create invalid `TRResponse` objects silently.

**Location**: `src-tauri/python/portfolio_src/core/tr_protocol.py:57-62`

**Current Code**:
```python
def deserialize_response(json_str: str) -> TRResponse:
    """Deserialize JSON string to response."""
    data = json.loads(json_str)
    return TRResponse(
        result=data.get("result"), error=data.get("error"), id=data.get("id")
    )
```

**Tasks**:
- [ ] Add type validation for `result` field before constructing `TRResponse`:
  ```python
  def deserialize_response(json_str: str) -> TRResponse:
      """Deserialize JSON string to response."""
      data = json.loads(json_str)
      result = data.get("result")
      if result is not None and not isinstance(result, dict):
          raise ValueError(f"Expected result to be dict or None, got {type(result).__name__}")
      return TRResponse(
          result=result, 
          error=data.get("error"), 
          id=data.get("id", "unknown")
      )
  ```
- [ ] Add test case: `deserialize_response('{"result": "string", "id": "1"}')` should raise `ValueError`
- [ ] Add test case: `deserialize_response('{"result": 123, "id": "1"}')` should raise `ValueError`
- [ ] Add test case: `deserialize_response('{"result": null, "id": "1"}')` should succeed
- [ ] Verify existing tests pass

### Phase 3: Add ID Validation in deserialize_response

**Issue**: Missing `id` field silently returns `None`, breaking request/response matching in `tr_bridge.py`.

**Location**: `src-tauri/python/portfolio_src/core/tr_protocol.py:57-62`

**Current Code**:
```python
return TRResponse(
    result=data.get("result"), error=data.get("error"), id=data.get("id")
)
```

**Tasks**:
- [ ] Add validation that `id` field is present:
  ```python
  response_id = data.get("id")
  if response_id is None:
      raise ValueError("Response missing required 'id' field")
  ```
- [ ] Add test case: `deserialize_response('{"result": null}')` should raise `ValueError` with message about missing `id`
- [ ] Verify `tr_bridge.py` callers handle `ValueError` appropriately (existing error handling should suffice)
- [ ] Run integration test for TR login flow

### Verification Steps

1. Run mypy: `cd src-tauri/python && mypy portfolio_src/core/tr_protocol.py`
2. Run unit tests: `pytest src-tauri/python/tests/test_tr_protocol.py -v`
3. Test TR login flow manually: `npm run tauri dev` → TR Login → verify no regressions
4. Verify malformed response handling: inject bad JSON in debug mode → confirm clear error

---

## Fixes from env_example_review.md

> **Source**: `reviews/env_example_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 Medium severity

### Context

The `.env.example` file follows security best practices, but the Echo Bridge transport module uses a hardcoded fallback token that poses a security risk if the bridge is exposed in shared environments.

### Phase 1: Document Echo Bridge Token Requirement

**Issue**: `echo_bridge.py` uses hardcoded default token `dev-echo-bridge-secret`. If accidentally exposed in production without a custom token, this default could be exploited.

**Location**: `src-tauri/python/portfolio_src/headless/transports/echo_bridge.py:306`

**Current Code**:
```python
echo_token = os.environ.get("PRISM_ECHO_TOKEN", "dev-echo-bridge-secret")
```

**Tasks**:
- [ ] Add `PRISM_ECHO_TOKEN` documentation to `.env.example` in the Local Development section:
  ```bash
  # =============================================================================
  # Echo Bridge Token (for development HTTP transport)
  # =============================================================================
  # Set a strong random token when using echo bridge in any shared environment
  # PRISM_ECHO_TOKEN=your-strong-random-token-here
  ```
- [ ] Verify echo bridge is only used in development mode (check `--http` flag usage)
- [ ] Consider adding runtime warning in `echo_bridge.py` when default token is used:
  ```python
  if echo_token == "dev-echo-bridge-secret":
      logger.warning("Using default echo bridge token - set PRISM_ECHO_TOKEN for shared environments")
  ```

### Verification Steps

1. Check `.env.example` contains `PRISM_ECHO_TOKEN` documentation
2. Verify echo bridge logs warning when using default token in non-development context
3. Test with custom token set → confirm authentication works

---

## Fixes from pipeline_review.md

> **Source**: `reviews/pipeline_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `pipeline.py` orchestrator is well-structured with good separation of concerns. These fixes address atomic file operations and encapsulation violations—both are code quality improvements that prevent future bugs.

### Phase 1: Use Atomic Write for Debug JSON Snapshots

**Issue**: Debug mode writes JSON files with `json.dump()` directly, risking partial writes on crash. CSV files correctly use `write_csv_atomic()` but JSON does not.

**Location**: `src-tauri/python/portfolio_src/core/pipeline.py:221-224`

**Current Code**:
```python
else:
    path = debug_dir / f"{phase}.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)
    logger.info(f"[DEBUG] Wrote snapshot: {path}")
```

**Tasks**:
- [ ] Check if `write_json_atomic` exists in `portfolio_src.prism_utils.atomic_io`; if not, add it
- [ ] Update `_write_debug_snapshot()` to use atomic write for JSON:
  ```python
  else:
      path = debug_dir / f"{phase}.json"
      write_json_atomic(path, data, default=str)
      logger.info(f"[DEBUG] Wrote snapshot: {path}")
  ```
- [ ] Ensure `write_json_atomic` handles `default=str` parameter (may need enhancement)
- [ ] Test with `DEBUG_PIPELINE=true` and verify snapshots written correctly

### Phase 2: Fix Private Attribute Access in Telemetry

**Issue**: Direct access to `telemetry._session_id` violates encapsulation, creating tight coupling to internal implementation.

**Location**: `src-tauri/python/portfolio_src/core/pipeline.py:649-651`

**Current Code**:
```python
if self._validation_gates:
    pipeline_quality = self._validation_gates.get_pipeline_quality()
    telemetry = get_telemetry()
    session_id = telemetry._session_id
    telemetry.report_quality_summary(pipeline_quality, session_id)
```

**Tasks**:
- [ ] Add `get_session_id()` public method to telemetry class in `portfolio_src/telemetry.py`:
  ```python
  def get_session_id(self) -> str:
      """Return the current session ID."""
      return self._session_id
  ```
- [ ] Update `pipeline.py:650` to use public accessor:
  ```python
  session_id = telemetry.get_session_id()
  ```
- [ ] Grep for other `_session_id` usages and update to use public method
- [ ] Run `mypy` to verify no type errors introduced

### Verification Steps

1. Run pipeline with `DEBUG_PIPELINE=true` → verify JSON snapshots written atomically
2. Kill process mid-debug-write → confirm no partial JSON files left behind
3. Run `grep -r "_session_id" src-tauri/python/` → only internal usages remain
4. Run existing pipeline tests: `pytest src-tauri/python/tests/ -k pipeline`

---

## Fixes from state_review.md

> **Source**: `reviews/state_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `state.py` module provides lazy-initialized singleton instances for shared resources (TRAuthManager, TRBridge, Pipeline, ThreadPoolExecutor). These fixes address a theoretical race condition in singleton initialization and dead code that should be removed or integrated.

### Phase 1: Add Thread-Safe Singleton Initialization

**Issue**: Lazy singleton getters (`get_auth_manager`, `get_bridge`, `get_pipeline`) use simple `if None` check without locking. Race condition could create duplicate instances if called from multiple threads simultaneously.

**Location**: `src-tauri/python/portfolio_src/headless/state.py:44-50`

**Current Code**:
```python
def get_auth_manager() -> "TRAuthManager":
    global _auth_manager
    if _auth_manager is None:
        from portfolio_src.core.tr_auth import TRAuthManager
        logger.debug("Initializing TRAuthManager singleton")
        _auth_manager = TRAuthManager()
    return _auth_manager
```

**Tasks**:
- [ ] Add `threading` import and create module-level lock at top of `state.py`:
  ```python
  import threading
  
  _state_lock = threading.Lock()
  ```
- [ ] Update `get_auth_manager()` to use double-checked locking pattern:
  ```python
  def get_auth_manager() -> "TRAuthManager":
      global _auth_manager
      if _auth_manager is None:
          with _state_lock:
              if _auth_manager is None:  # Double-check after acquiring lock
                  from portfolio_src.core.tr_auth import TRAuthManager
                  logger.debug("Initializing TRAuthManager singleton")
                  _auth_manager = TRAuthManager()
      return _auth_manager
  ```
- [ ] Apply same pattern to `get_bridge()` function
- [ ] Apply same pattern to `get_pipeline()` function (if retained in Phase 2)
- [ ] Verify consistency with `TRBridge.get_instance()` which already uses DCL pattern
- [ ] Run tests: `pytest src-tauri/python/tests/headless/test_state.py`

### Phase 2: Remove or Integrate Unused get_pipeline() Function

**Issue**: `get_pipeline()` is defined and exported but never called. The `sync.py` handler creates `Pipeline()` directly instead of using the singleton.

**Location**: `src-tauri/python/portfolio_src/headless/state.py:71-79`

**Current Code**:
```python
def get_pipeline() -> "Pipeline":
    """Get or create the Pipeline singleton."""
    global _pipeline
    if _pipeline is None:
        from portfolio_src.core.pipeline import Pipeline
        logger.debug("Initializing Pipeline singleton")
        _pipeline = Pipeline()
    return _pipeline
```

**Decision**: Choose one of the following options:

**Option A - Remove dead code (Recommended if Pipeline is stateless)**:
- [ ] Delete `get_pipeline()` function from `state.py`
- [ ] Remove `_pipeline` variable declaration (line 28)
- [ ] Remove `_pipeline` from `reset_state()` function
- [ ] Update `portfolio_src/headless/__init__.py` to not re-export `get_pipeline`
- [ ] Verify no import errors: `python -c "from portfolio_src.headless import *"`

**Option B - Integrate singleton in sync.py (If Pipeline should be singleton)**:
- [ ] Update `sync.py` `handle_run_pipeline` to use `get_pipeline()` instead of `Pipeline()`
- [ ] Verify Pipeline class handles re-use correctly (no stale state between runs)
- [ ] Run pipeline tests to ensure no regressions

### Verification Steps

1. Run `pytest src-tauri/python/tests/headless/test_state.py` → all tests pass
2. Verify thread safety: create test that calls getters from multiple threads
3. For Option A: `grep -r "get_pipeline" --include="*.py" src-tauri/python/` → only definition remains (then delete)
4. For Option B: Verify pipeline runs correctly with singleton pattern
5. Run full test suite: `pytest src-tauri/python/tests/`

---

## Fixes from package_json_review.md

> **Source**: `reviews/package_json_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `package.json` configuration uses loose version specifiers and lacks automated dependency update tooling. These fixes address supply chain security and reproducibility—ensuring CI/CD builds are deterministic and security updates are applied promptly.

### Phase 1: Tighten Critical Dependency Version Constraints

**Issue**: All dependencies use caret (`^`) version specifiers which allow automatic updates to minor and patch versions. While `package-lock.json` mitigates this for direct installs, CI/CD environments or fresh clones may get different versions if lockfile handling is inconsistent.

**Location**: `package.json:26-70`

**Current Code**:
```json
"dependencies": {
  "@tanstack/react-query": "^5.90.12",
  "@tauri-apps/api": "^2",
  ...
}
```

**Tasks**:
- [ ] Pin `@tauri-apps/api` to exact version: `"@tauri-apps/api": "2.9.1"` (critical shell dependency)
- [ ] Pin `@tauri-apps/plugin-shell` to exact version (matches api)
- [ ] Verify `package-lock.json` is committed: `git ls-files package-lock.json`
- [ ] Update CI workflow to use `npm ci` instead of `npm install` (enforces lockfile)
- [ ] Document version pinning rationale in `package.json` comments or `docs/`

### Phase 2: Configure Automated Dependency Updates

**Issue**: No Dependabot, Renovate, or similar automated dependency update configuration exists. Security vulnerabilities in dependencies may go unpatched unless manually monitored.

**Location**: Project root (missing `.github/dependabot.yml` or `renovate.json`)

**Tasks**:
- [ ] Create `.github/dependabot.yml` with the following content:
  ```yaml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/"
      schedule:
        interval: "weekly"
      open-pull-requests-limit: 5
      labels:
        - "dependencies"
      commit-message:
        prefix: "deps"
  ```
- [ ] Enable Dependabot alerts in GitHub repository settings
- [ ] Consider adding Rust ecosystem updates for `src-tauri/Cargo.toml`:
  ```yaml
    - package-ecosystem: "cargo"
      directory: "/src-tauri"
      schedule:
        interval: "weekly"
      open-pull-requests-limit: 3
  ```
- [ ] Document in `AGENTS.md` or `docs/CONTRIBUTING.md` that dependency PRs require CI pass before merge

### Verification Steps

1. Run `git ls-files package-lock.json` → confirms lockfile is tracked
2. Check CI uses `npm ci`: review `.github/workflows/*.yml`
3. Verify Dependabot config: `ls -la .github/dependabot.yml`
4. After merge, check GitHub Security tab for Dependabot alerts enabled
5. Run `npm ci && npm run build` → build succeeds with pinned versions

---

## Fixes from database_py_review.md

> **Source**: `reviews/database_py_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `database.py` module provides SQLite connection management and query helpers for Portfolio Prism. These fixes address silent migration failures and dead code in connection caching—both create maintenance burden and potential for subtle bugs.

### Phase 1: Propagate Migration Failures

**Issue**: Migration errors are caught, logged, and swallowed. Application continues as if migration succeeded, leading to confusing errors later when code expects columns that don't exist.

**Location**: `src-tauri/python/portfolio_src/data/database.py:120-122`

**Current Code**:
```python
        except Exception as e:
            conn.rollback()
            logger.error(f"[DB] Migration error: {e}")
```

**Tasks**:
- [ ] Update exception handler in `init_db()` to re-raise after rollback:
  ```python
  except Exception as e:
      conn.rollback()
      logger.error(f"[DB] Migration error: {e}")
      raise RuntimeError(f"Database migration failed: {e}") from e
  ```
- [ ] Verify caller in `prism_headless.py` handles the exception appropriately (exits cleanly with error message)
- [ ] Add unit test: mock migration failure → verify `RuntimeError` raised
- [ ] Test manually: corrupt schema file → confirm application fails fast with clear message

### Phase 2: Remove Unused Connection Cache

**Issue**: Global `_connection` cache (line 21) is set during `init_db()` but `get_connection()` creates new connections every time, ignoring the cache. This creates dead code (`_connection` variable, `close_connection()` function) and confusion about intended behavior.

**Location**: `src-tauri/python/portfolio_src/data/database.py:21,129-131,156-165`

**Current Code**:
```python
# Line 21 - Module-level cache defined but never read
_connection: Optional[sqlite3.Connection] = None

# Line 129-131 - Cache is set in init_db but never used
if db_path != ":memory:":
    _connection = conn

# Line 156-165 - close_connection() operates on never-used cache
def close_connection() -> None:
    """Close the cached database connection."""
    global _connection
    if _connection is not None:
        _connection.close()
        _connection = None
```

**Decision**: Remove cache (per-query connections are intentional for WAL mode concurrency)

**Tasks**:
- [ ] Delete `_connection` variable declaration (line 21)
- [ ] Delete assignment block in `init_db()` (lines 129-131):
  ```python
  # Remove these lines:
  if db_path != ":memory:":
      _connection = conn
  ```
- [ ] Delete `close_connection()` function (lines 156-165)
- [ ] Search for callers: `grep -r "close_connection" --include="*.py" src-tauri/python/`
- [ ] Update any callers to remove `close_connection()` invocations
- [ ] Add docstring note in `get_connection()` explaining per-query pattern is intentional for WAL mode
- [ ] Run existing tests: `pytest src-tauri/python/tests/ -k database`

### Verification Steps

1. Run `pytest src-tauri/python/tests/` → all tests pass
2. Test migration failure path: temporarily break schema → confirm app fails fast with `RuntimeError`
3. Verify no references to removed code: `grep -r "_connection\|close_connection" --include="*.py" src-tauri/python/`
4. Run application: `npm run tauri dev` → confirm database operations work normally

---

## Fixes from tauri_conf_json_review.md

> **Source**: `reviews/tauri_conf_json_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `tauri.conf.json` configuration defines Content Security Policy (CSP) directives for the Tauri application. These fixes address CSP weaknesses that reduce XSS protection and allow overly broad network connections.

### Phase 1: Remove Unsafe CSP Script Directives for Production

**Issue**: The CSP includes `'unsafe-inline'` and `'unsafe-eval'` in `script-src`, weakening XSS protection. While needed for Vite HMR during development, production builds should use stricter policies.

**Location**: `src-tauri/tauri.conf.json:22`

**Current Code**:
```json
"script-src 'self' 'unsafe-inline' 'unsafe-eval'"
```

**Tasks**:
- [ ] Investigate environment-specific CSP configuration in Tauri v2 (check Tauri docs for build-time CSP options)
- [ ] Test production build without `'unsafe-inline'` and `'unsafe-eval'` directives:
  ```json
  "script-src 'self'"
  ```
- [ ] If stricter CSP breaks production, document the specific functionality requiring `unsafe-*` directives
- [ ] If build-time CSP is not possible, create tracking issue for future Tauri version upgrade
- [ ] Add CSP documentation explaining dev vs. prod trade-offs in `docs/security/CSP.md`

### Phase 2: Restrict Wildcard Worker Domain in connect-src

**Issue**: The CSP `connect-src` allows `https://*.workers.dev`, permitting connections to ANY Cloudflare Worker. An XSS exploit could exfiltrate data to attacker-controlled workers.

**Location**: `src-tauri/tauri.conf.json:22`

**Current Code**:
```json
"connect-src 'self' https://*.workers.dev https://localhost:* http://localhost:* tauri://localhost"
```

**Tasks**:
- [ ] Identify the exact Cloudflare Worker subdomain used by the project (check `infrastructure/` or deployment config)
- [ ] Update `connect-src` to restrict to specific worker:
  ```json
  "connect-src 'self' https://portfolio-prism-proxy.YOUR_ACCOUNT.workers.dev tauri://localhost"
  ```
- [ ] If multiple workers are needed, use minimal pattern (e.g., `https://portfolio-prism-*.workers.dev`)
- [ ] Remove `https://localhost:*` and `http://localhost:*` for production build (dev-only)
- [ ] Test production build: verify API calls to Cloudflare proxy still work
- [ ] Test security: verify connections to other `*.workers.dev` domains are blocked

### Verification Steps

1. Build production bundle: `npm run tauri build`
2. Test all app functionality works with updated CSP
3. Check browser console (Cmd+Option+I in app) for CSP violation errors
4. Attempt fetch to unauthorized worker domain → confirm blocked by CSP
5. Verify proxy API calls work with restricted `connect-src`

---

## Fixes from usePortfolioData_review.md

> **Source**: `reviews/usePortfolioData_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `usePortfolioData.ts` hook module provides TanStack Query wrappers for IPC calls. These fixes address API contract clarity and cache invalidation gaps—both are correctness issues that could cause user confusion or stale data.

### Phase 1: Fix useXRayData portfolioId Mismatch

**Issue**: `useXRayData` hook accepts `portfolioId` parameter and includes it in query key, but the underlying `getTrueHoldings()` IPC call ignores it. This creates a misleading API where callers expect per-portfolio isolation but get shared global data.

**Location**: `src/hooks/usePortfolioData.ts:60-65`

**Current Code**:
```typescript
export function useXRayData(portfolioId: number) {
  return useQuery({
    queryKey: ['xray', portfolioId],
    queryFn: getTrueHoldings,  // Ignores portfolioId!
  });
}
```

**Tasks**:
- [ ] Investigate whether X-Ray should be per-portfolio or global:
  - Check `getTrueHoldings` IPC implementation in `src/lib/ipc.ts`
  - Check Python handler in `src-tauri/python/portfolio_src/headless/handlers/`
  - Check `XRayView.tsx` to understand expected behavior
- [ ] **If per-portfolio**: Update `getTrueHoldings` to accept and use `portfolioId`:
  ```typescript
  export function useXRayData(portfolioId: number) {
    return useQuery({
      queryKey: ['xray', portfolioId],
      queryFn: () => getTrueHoldings(portfolioId),
    });
  }
  ```
- [ ] **If global**: Remove misleading parameter to clarify API contract:
  ```typescript
  export function useXRayData() {
    return useQuery({
      queryKey: ['xray'],
      queryFn: getTrueHoldings,
    });
  }
  ```
- [ ] Update all call sites if signature changes
- [ ] Add JSDoc comment explaining the scoping decision

### Phase 2: Add xray Query Invalidation After Sync

**Issue**: `useSyncPortfolio` invalidates `['dashboard']` and `['holdings']` queries on success but not `['xray']`. If sync changes portfolio composition (new ETFs, allocations), X-Ray view shows stale look-through data.

**Location**: `src/hooks/usePortfolioData.ts:87-93`

**Current Code**:
```typescript
onSuccess: () => {
  completeSync();
  // Invalidate queries to refetch fresh data
  queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['holdings'] });
  // Missing: queryClient.invalidateQueries({ queryKey: ['xray'] });
},
```

**Tasks**:
- [ ] Add xray query invalidation in `useSyncPortfolio` `onSuccess` callback:
  ```typescript
  onSuccess: () => {
    completeSync();
    // Invalidate all portfolio data queries to refetch fresh data
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['holdings'] });
    queryClient.invalidateQueries({ queryKey: ['xray'] });
  },
  ```
- [ ] Verify xray query key pattern matches Phase 1 decision (global vs per-portfolio)
- [ ] Add test case: mock sync that changes portfolio → verify X-Ray data refetched

### Verification Steps

1. Run `npm test src/hooks/usePortfolioData` → all tests pass
2. Perform sync that changes portfolio composition
3. Navigate to X-Ray view immediately after sync → verify data reflects new state
4. Check TanStack Query DevTools → confirm no stale xray cache entries

---

## Fixes from @reviews/processed/tauri_ts_review.md

> **Source**: `reviews/tauri_ts_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 Medium severity

### Context

The `tauri.ts` module (98 lines) provides type-safe wrappers around Tauri's invoke and listen APIs with graceful browser fallbacks. One performance improvement is recommended—caching dynamic imports to reduce overhead on frequently-called API functions.

### Phase 1: Cache Tauri Dynamic Imports

**Issue**: Every call to `invoke`, `listen`, `once`, and `emit` performs a dynamic import of the Tauri API modules. While bundlers cache after first resolution, there's still overhead from promise creation and module lookup on each call.

**Location**: `src/lib/tauri.ts:36,59,75,95`

**Current Code**:
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

**Tasks**:
- [ ] Add module-level cache variables at top of `src/lib/tauri.ts` (after imports):
  ```typescript
  // Module-level cache for Tauri APIs
  let cachedInvoke: typeof import('@tauri-apps/api/core')['invoke'] | null = null;
  let cachedEventApi: typeof import('@tauri-apps/api/event') | null = null;
  ```
- [ ] Add `getTauriInvoke()` helper function:
  ```typescript
  async function getTauriInvoke() {
    if (!cachedInvoke) {
      const { invoke } = await import('@tauri-apps/api/core');
      cachedInvoke = invoke;
    }
    return cachedInvoke;
  }
  ```
- [ ] Add `getTauriEventApi()` helper function:
  ```typescript
  async function getTauriEventApi() {
    if (!cachedEventApi) {
      cachedEventApi = await import('@tauri-apps/api/event');
    }
    return cachedEventApi;
  }
  ```
- [ ] Update `invoke()` function to use cached import:
  ```typescript
  const tauriInvoke = await getTauriInvoke();
  return tauriInvoke(command, args);
  ```
- [ ] Update `listen()` function to use cached event API:
  ```typescript
  const { listen: tauriListen } = await getTauriEventApi();
  return tauriListen(event, (e) => handler(e.payload as TauriEvents[K]));
  ```
- [ ] Update `once()` function to use cached event API:
  ```typescript
  const { once: tauriOnce } = await getTauriEventApi();
  return tauriOnce(event, (e) => handler(e.payload as TauriEvents[K]));
  ```
- [ ] Update `emit()` function to use cached event API:
  ```typescript
  const { emit: tauriEmit } = await getTauriEventApi();
  return tauriEmit(event, payload);
  ```

### Verification Steps

1. Run existing tests: `npm test src/lib/tauri.test.ts` → all 12 tests pass
2. Verify module loading in browser dev tools: single import per API module
3. Run `npm run typecheck` → no type errors
4. Test in Tauri: `npm run tauri dev` → invoke/listen/emit work correctly

---

## Fixes from @reviews/processed/vanguard_py_review.md

> **Source**: `reviews/vanguard_py_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `vanguard.py` adapter fetches ETF holdings using multiple strategies (manual file, US Vanguard API, German site scraping). These fixes address ISIN input validation and code quality issues—consistent with similar fixes applied to `ishares.py` and `xtrackers.py` adapters.

### Phase 1: ISIN Input Validation

**Issue**: ISIN parameter used directly in API URLs and file paths without validation. Malformed input could enable path traversal in file operations or cache key pollution.

**Location**: `src-tauri/python/portfolio_src/adapters/vanguard.py:107,333,432-433`

**Current Code**:
```python
@cache_adapter_data(ttl_hours=24)
def fetch_holdings(self, isin: str) -> pd.DataFrame:
    # isin used directly without validation
    logger.info(f"--- Running Vanguard holdings acquisition for {isin} ---")
    # ...
    
def _fetch_from_manual_file(self, isin: str) -> Optional[pd.DataFrame]:
    manual_dir = MANUAL_INPUTS_DIR
    xlsx_path = os.path.join(manual_dir, f"{isin}.xlsx")  # No validation
    csv_path = os.path.join(manual_dir, f"{isin}.csv")
```

**Tasks**:
- [ ] Import `is_valid_isin` from `portfolio_src.prism_utils.isin_validator` (or add `_validate_isin` method if validator doesn't exist)
- [ ] Add ISIN validation and normalization at start of `fetch_holdings()`:
  ```python
  if not isin or not self._validate_isin(isin):
      logger.error(f"Invalid ISIN format: {isin}")
      return pd.DataFrame()
  isin = isin.upper().strip()  # Normalize
  ```
- [ ] Test with valid ISIN (`IE00B3XXRP09`) → should work
- [ ] Test with path traversal attempt (`../../../etc/passwd`) → should return empty DataFrame
- [ ] Test with empty string → should return empty DataFrame
- [ ] Test with special characters (`<script>alert(1)</script>`) → should return empty DataFrame

### Phase 2: Remove Duplicate Logger Assignment

**Issue**: Logger is initialized twice in the module (line 24 and line 31), indicating copy-paste error from reorganization. Creates redundancy and could mask import order issues.

**Location**: `src-tauri/python/portfolio_src/adapters/vanguard.py:24,31`

**Current Code**:
```python
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)  # First assignment (line 24)

from portfolio_src.data.caching import cache_adapter_data
from portfolio_src.data.holdings_cache import ManualUploadRequired
from portfolio_src.prism_utils.logging_config import get_logger  # Duplicate import
from portfolio_src.config import MANUAL_INPUTS_DIR, RAW_DOWNLOADS_DIR

logger = get_logger(__name__)  # Second assignment (line 31)
```

**Tasks**:
- [ ] Consolidate all imports at top of file, removing duplicate `get_logger` import
- [ ] Move single `logger = get_logger(__name__)` after all imports
- [ ] Remove unused `RAW_DOWNLOADS_DIR` import (identified in [INFO] finding)
- [ ] Verify import order follows Python convention: stdlib → third-party → local
- [ ] Test: `python -c "from portfolio_src.adapters.vanguard import VanguardAdapter"` → no import errors

### Verification Steps

1. Run adapter tests: `pytest src-tauri/python/tests/ -k vanguard`
2. Test with invalid ISIN via Python REPL → verify error logged and empty DataFrame returned
3. Test manual file upload with valid ISIN → confirm existing functionality works
4. Verify logging still works correctly after import consolidation

---

## Fixes from @reviews/processed/tr_sync_review.md

> **Source**: `reviews/tr_sync_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `tr_sync.py` module fetches portfolio data from Trade Republic via the daemon and optionally saves to CSV. These fixes address CSV escaping correctness and missing unit test coverage.

### Phase 1: Replace Manual CSV Escaping with stdlib

**Issue**: Custom CSV escaping logic may fail on complex inputs (embedded newlines, BOM, etc.). Python's stdlib `csv` module is battle-tested.

**Location**: `src-tauri/python/portfolio_src/data/tr_sync.py:126-128`

**Current Code**:
```python
# Escape name for CSV
name = pos["name"].replace('"', '""')
if "," in name or '"' in name:
    name = f'"{name}"'

f.write(
    f"{pos['isin']},{pos['quantity']:.6f},{pos['avg_cost']:.4f},"
    f"{pos['current_price']:.4f},{pos['net_value']:.2f},{name}\n"
)
```

**Tasks**:
- [ ] Import `csv` module at top of `tr_sync.py`
- [ ] Refactor `save_to_csv()` to use `csv.writer`:
  ```python
  def save_to_csv(self, positions: List[Dict], output_path: Path) -> int:
      output_path.parent.mkdir(parents=True, exist_ok=True)
      
      with open(output_path, "w", encoding="utf-8", newline="") as f:
          writer = csv.writer(f)
          writer.writerow(["ISIN", "Quantity", "AvgCost", "CurrentPrice", "NetValue", "TR_Name"])
          for pos in positions:
              writer.writerow([
                  pos["isin"],
                  f"{pos['quantity']:.6f}",
                  f"{pos['avg_cost']:.4f}",
                  f"{pos['current_price']:.4f}",
                  f"{pos['net_value']:.2f}",
                  pos["name"],
              ])
      
      logger.info(f"Saved {len(positions)} positions to {output_path}")
      return len(positions)
  ```
- [ ] Test with instrument names containing: `"Company, Inc."`, `"O'Reilly"`, `"Line1\nLine2"`
- [ ] Verify CSV opens correctly in Excel/Numbers
- [ ] Run existing tests: `pytest src-tauri/python/tests/ -k tr_sync`

### Phase 2: Add Unit Tests for TRDataFetcher

**Issue**: TRDataFetcher is mocked in integration tests but has no unit tests verifying its actual logic (position transformation, malformed handling, empty portfolio, CSV generation).

**Location**: `src-tauri/python/portfolio_src/data/tr_sync.py` (no test file exists)

**Tasks**:
- [ ] Create `src-tauri/python/tests/data/test_tr_sync.py`
- [ ] Add test: `test_fetch_portfolio_success` - verify position transformation (string to float conversion)
- [ ] Add test: `test_fetch_portfolio_skips_malformed` - verify malformed positions are skipped
- [ ] Add test: `test_fetch_portfolio_empty` - verify empty portfolio returns empty list
- [ ] Add test: `test_save_to_csv` - verify CSV generation with special characters in name field

**Test Template**:
```python
import pytest
from pathlib import Path
from unittest.mock import Mock

from portfolio_src.data.tr_sync import TRDataFetcher


class TestTRDataFetcher:
    @pytest.fixture
    def mock_bridge(self):
        return Mock()

    def test_fetch_portfolio_success(self, mock_bridge):
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "DE0007236101",
                        "name": "Siemens AG",
                        "netSize": "10.5",
                        "averageBuyIn": "120.50",
                        "netValue": 1300.25,
                    }
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        
        assert len(positions) == 1
        assert positions[0]["isin"] == "DE0007236101"
        assert positions[0]["quantity"] == 10.5
        assert positions[0]["avg_cost"] == 120.50

    def test_fetch_portfolio_skips_malformed(self, mock_bridge):
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {"instrumentId": "VALID123456", "netSize": "10", "averageBuyIn": "100", "netValue": 1000},
                    {"netSize": "invalid"},  # Missing instrumentId
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        
        assert len(positions) == 1  # Malformed position skipped

    def test_fetch_portfolio_empty(self, mock_bridge):
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {"positions": [], "cash": [{"amount": 100}]},
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        
        assert positions == []

    def test_save_to_csv(self, mock_bridge, tmp_path):
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {"isin": "US123", "name": "Test, Inc.", "quantity": 10.0, "avg_cost": 50.0, "current_price": 55.0, "net_value": 550.0}
        ]
        output_path = tmp_path / "output.csv"
        
        count = fetcher.save_to_csv(positions, output_path)
        
        assert count == 1
        content = output_path.read_text()
        assert "ISIN,Quantity" in content
        assert "US123" in content
```

### Verification Steps

1. Run `pytest src-tauri/python/tests/data/test_tr_sync.py` → all tests pass
2. Verify CSV correctness: test with edge case instrument names
3. Check test coverage includes `tr_sync.py`

---

## Fixes from @reviews/processed/dispatcher_review.md

> **Source**: `reviews/processed/dispatcher_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `dispatcher.py` module routes IPC commands to handlers and returns responses. These fixes address security hardening (error message exposure) and defensive input validation—consistent with the project's security-first philosophy.

### Phase 1: Sanitize Exception Messages in Error Responses

**Issue**: Internal exception messages are returned to the client via `str(e)`, potentially leaking implementation details, file paths, or stack trace information.

**Location**: `src-tauri/python/portfolio_src/headless/dispatcher.py:55-57`

**Current Code**:
```python
except Exception as e:
    logger.error(f"Handler error for '{command}': {e}", exc_info=True)
    return error_response(cmd_id, "HANDLER_ERROR", str(e))
```

**Tasks**:
- [ ] Create `HandlerValidationError` exception class in `portfolio_src/headless/exceptions.py` (if not exists):
  ```python
  class HandlerValidationError(Exception):
      """Expected validation error - safe to expose message to client."""
      def __init__(self, message: str, code: str = "VALIDATION_ERROR"):
          super().__init__(message)
          self.code = code
  ```
- [ ] Update exception handling in `dispatch()` to distinguish expected vs unexpected errors:
  ```python
  from portfolio_src.headless.exceptions import HandlerValidationError
  
  try:
      # ... handler invocation
  except HandlerValidationError as e:
      # Expected validation errors - safe to expose message
      return error_response(cmd_id, e.code, str(e))
  except Exception as e:
      logger.error(f"Handler error for '{command}': {e}", exc_info=True)
      return error_response(cmd_id, "HANDLER_ERROR", "Internal error occurred. Check logs for details.")
  ```
- [ ] Audit existing handlers for errors that should use `HandlerValidationError`
- [ ] Test: trigger exception in handler → verify client receives generic message
- [ ] Test: verify full exception is logged to server logs with `exc_info=True`

### Phase 2: Add Input Type Validation for Command Structure

**Issue**: The `dispatch()` function accepts `dict[str, Any]` but performs no runtime validation. Malformed input could cause unexpected errors in handlers.

**Location**: `src-tauri/python/portfolio_src/headless/dispatcher.py:17-37`

**Current Code**:
```python
async def dispatch(cmd: dict[str, Any]) -> dict[str, Any]:
    command = cmd.get("command", "")
    cmd_id = cmd.get("id", 0)
    payload = cmd.get("payload", {})
```

**Tasks**:
- [ ] Add `validate_command()` helper function in `dispatcher.py`:
  ```python
  def validate_command(cmd: Any) -> tuple[str, int, dict[str, Any]]:
      """Validate and extract command components.
      
      Raises:
          ValueError: If command structure is invalid.
      """
      if not isinstance(cmd, dict):
          raise ValueError("Command must be a dict")
      
      command = cmd.get("command")
      if not isinstance(command, str):
          raise ValueError("Command 'command' field must be a string")
      
      cmd_id = cmd.get("id", 0)
      if not isinstance(cmd_id, int):
          raise ValueError("Command 'id' field must be an integer")
      
      payload = cmd.get("payload", {})
      if not isinstance(payload, dict):
          raise ValueError("Command 'payload' field must be a dict")
      
      return command, cmd_id, payload
  ```
- [ ] Update `dispatch()` to call `validate_command()` at entry point:
  ```python
  async def dispatch(cmd: dict[str, Any]) -> dict[str, Any]:
      try:
          command, cmd_id, payload = validate_command(cmd)
      except ValueError as e:
          return error_response(0, "INVALID_COMMAND", str(e))
      
      # ... rest of dispatch logic
  ```
- [ ] Add unit tests for malformed inputs:
  - [ ] `dispatch({"command": 123, "id": 1, "payload": {}})` → `INVALID_COMMAND`
  - [ ] `dispatch({"command": "x", "id": "1", "payload": {}})` → `INVALID_COMMAND`
  - [ ] `dispatch({"command": "x", "id": 1, "payload": "not a dict"})` → `INVALID_COMMAND`
  - [ ] `dispatch("not a dict")` → `INVALID_COMMAND`

### Verification Steps

1. Run dispatcher tests: `pytest src-tauri/python/tests/headless/test_dispatcher.py -v`
2. Test exception path manually: inject error in handler → verify client receives generic message
3. Test validation path: send malformed command → verify `INVALID_COMMAND` response
4. Check logs: verify full exception details are logged server-side

---

## Fixes from @reviews/processed/main_tsx_review.md

> **Source**: `reviews/main_tsx_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 Medium severity

### Context

The `main.tsx` entry point uses a non-null assertion operator when accessing the root DOM element. If the root element doesn't exist (malformed HTML, loading issues), this causes an uncaught error that bypasses the ErrorBoundary since it occurs during initial render setup.

### Phase 1: Add Root Element Fallback

**Issue**: `document.getElementById('root')!` uses non-null assertion which will throw an unrecoverable error if the element is missing. The error bypasses the ErrorBoundary since it occurs before React mounts.

**Location**: `src/main.tsx:35`

**Current Code**:
```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
```

**Tasks**:
- [ ] Replace non-null assertion with explicit null check and fallback UI:
  ```typescript
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    document.body.innerHTML = '<div style="color: white; padding: 20px; font-family: sans-serif;"><h1>Application Error</h1><p>Failed to initialize. Please reload the page.</p></div>';
    throw new Error('Root element not found');
  }
  ReactDOM.createRoot(rootElement).render(
  ```
- [ ] Verify chart component handles empty array gracefully (related to ErrorBoundary)

### Verification Steps

1. Temporarily rename `root` id in `index.html` → verify fallback UI displays
2. Restore `root` id → confirm normal application startup
3. Check browser console for clear error message when fallback triggers

---

## Fixes from @reviews/processed/ishares_py_review.md

> **Source**: `reviews/ishares_py_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `ishares.py` adapter fetches ETF holdings from iShares via direct CSV download. These fixes address an undefined variable bug that breaks auto-discovery persistence and add input validation for defense in depth—consistent with similar fixes applied to other adapters.

### Phase 1: Fix Undefined Variable in _save_config

**Issue**: `_save_config` references undefined `ISHARES_CONFIG_PATH`, causing `NameError` when auto-discovery attempts to persist newly discovered product IDs.

**Location**: `src-tauri/python/portfolio_src/adapters/ishares.py:41-47`

**Current Code**:
```python
def _save_config(self):
    try:
        os.makedirs(os.path.dirname(ISHARES_CONFIG_PATH), exist_ok=True)
        with open(ISHARES_CONFIG_PATH, "w") as f:
            json.dump(self.config, f, indent=4)
        logger.info(f"Updated iShares config saved to {ISHARES_CONFIG_PATH}")
    except Exception as e:
        logger.error(f"Failed to save iShares config: {e}")
```

**Tasks**:
- [ ] Replace all occurrences of `ISHARES_CONFIG_PATH` with `CONFIG_PATH` in `_save_config()` method (lines 42, 43, 45)
- [ ] Verify `CONFIG_PATH` is defined at line 16 of the file
- [ ] Test config persistence: run auto-discovery for a new ETF, verify config file is created at expected path
- [ ] Add regression test: call `_save_config()` directly → no `NameError` raised

### Phase 2: Add ISIN Input Validation

**Issue**: User-provided ISIN is used directly in URL construction and file paths without format validation, risking unexpected behavior from malformed input.

**Location**: `src-tauri/python/portfolio_src/adapters/ishares.py:103,48,155`

**Current Code**:
```python
@cache_adapter_data(ttl_hours=24)
def fetch_holdings(self, isin: str) -> pd.DataFrame:
    logger.info(f"--- Fetching holdings for {isin} ---")
    # isin used directly in URL without validation
    url = f"...fileName={isin}_holdings..."
```

**Tasks**:
- [ ] Check if `is_valid_isin` exists in `portfolio_src.prism_utils.isin_validator`; if so, import it
- [ ] If not, add `_validate_isin()` helper method to `ISharesAdapter`:
  ```python
  import re
  
  def _validate_isin(self, isin: str) -> bool:
      """Validate ISIN format: 2 letters + 10 alphanumeric characters."""
      if not isin or not isinstance(isin, str):
          return False
      return bool(re.match(r'^[A-Z]{2}[A-Z0-9]{10}$', isin.upper()))
  ```
- [ ] Add ISIN validation at start of `fetch_holdings()`:
  ```python
  if not self._validate_isin(isin):
      logger.warning(f"Invalid ISIN format: {isin}")
      return pd.DataFrame()
  
  isin = isin.upper().strip()  # Normalize
  ```
- [ ] Test with valid ISIN (`IE00B4L5Y983`) → should work normally
- [ ] Test with path traversal attempt (`../../../etc/passwd`) → should return empty DataFrame
- [ ] Test with empty string → should return empty DataFrame
- [ ] Test with special characters (`<script>alert(1)</script>`) → should return empty DataFrame

### Verification Steps

1. Run adapter tests: `pytest src-tauri/python/tests/ -k ishares` (create if missing)
2. Test `_save_config()`: `python -c "from portfolio_src.adapters.ishares import ISharesAdapter; a = ISharesAdapter(); a._save_config()"` → no NameError
3. Verify config file created at `CONFIG_PATH` location
4. Test invalid ISIN via Python REPL → verify warning logged and empty DataFrame returned
5. Verify existing ETF fetches still work (`IE00B4L5Y983`)

---

## Fixes from @reviews/processed/caching_py_review.md

> **Source**: `reviews/caching_py_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `caching.py` module provides JSON file-based caching for enrichment data and a decorator for caching adapter DataFrame results. These fixes address a security gap in the decorator (missing ISIN validation) and maintainability concerns with hardcoded paths.

### Phase 1: Add ISIN Validation to cache_adapter_data Decorator

**Issue**: The `cache_adapter_data` decorator uses ISIN in file path construction without validation, unlike the JSON cache functions which properly validate. This breaks defense-in-depth principle.

**Location**: `src-tauri/python/portfolio_src/data/caching.py:156-158`

**Current Code**:
```python
def wrapper(self, isin: str, *args, **kwargs):
    class_name = self.__class__.__name__
    cache_file = os.path.join(CACHE_DIR, f"{isin}_{class_name}.csv")
```

**Tasks**:
- [ ] Add ISIN validation at start of `wrapper()` function inside `cache_adapter_data`:
  ```python
  def wrapper(self, isin: str, *args, **kwargs):
      # Validate ISIN before using in file path
      if not is_valid_isin(isin):
          logger.warning(f"Invalid ISIN passed to adapter cache: {isin}")
          tracker.increment_system_metric("cache_invalid_key")
          return func(self, isin, *args, **kwargs)  # Skip caching, proceed with fetch
      
      class_name = self.__class__.__name__
      cache_file = os.path.join(CACHE_DIR, f"{isin}_{class_name}.csv")
      # ... rest of existing logic
  ```
- [ ] Verify `is_valid_isin` is already imported (line 9 confirms it is)
- [ ] Test with invalid ISIN: `adapter.fetch_holdings("../../../etc/passwd")` → should skip cache, log warning
- [ ] Test with valid ISIN: `adapter.fetch_holdings("IE00B4L5Y983")` → should cache normally

### Phase 2: Use Centralized Config Paths

**Issue**: Module uses hardcoded relative paths (`"data/working/cache/adapter_cache"`) instead of `config.WORKING_DIR`. This is inconsistent with other data modules and could cause path resolution issues between dev and bundled modes.

**Location**: `src-tauri/python/portfolio_src/data/caching.py:13-16`

**Current Code**:
```python
CACHE_DIR = "data/working/cache/adapter_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

ENRICHMENT_CACHE_FILE = "data/working/cache/enrichment_cache.json"
```

**Tasks**:
- [ ] Import config at top of `caching.py`:
  ```python
  from portfolio_src import config
  ```
- [ ] Replace hardcoded paths with config-based paths:
  ```python
  # Use centralized config paths
  CACHE_DIR = config.WORKING_DIR / "cache" / "adapter_cache"
  ENRICHMENT_CACHE_FILE = config.ENRICHMENT_CACHE_PATH  # Already defined in config.py
  ```
- [ ] Remove directory creation at import time (line 14); defer to first use:
  ```python
  _cache_dir_created = False
  
  def _ensure_cache_dir():
      """Lazy initialization of cache directory."""
      global _cache_dir_created
      if not _cache_dir_created:
          CACHE_DIR.mkdir(parents=True, exist_ok=True)
          _cache_dir_created = True
  ```
- [ ] Call `_ensure_cache_dir()` at start of `cache_adapter_data` decorator's wrapper function
- [ ] Update `_save_json_cache` to use `Path.parent.mkdir()` instead of `os.makedirs(os.path.dirname(...))`
- [ ] Update file operations to use `Path` APIs consistently (open() works with Path objects)
- [ ] Run existing tests: `pytest src-tauri/python/tests/ -k caching`
- [ ] Verify paths resolve correctly in both dev mode and bundled app

### Verification Steps

1. Run `pytest src-tauri/python/tests/` → all existing tests pass
2. Test invalid ISIN in adapter: log shows warning, no file created in CACHE_DIR
3. Test valid ISIN in adapter: cache file created with correct path under `config.WORKING_DIR`
4. Run `npm run tauri dev` → verify caching works in full app context
5. Check no directories created on module import (only on first cache operation)

---

## Fixes from @reviews/processed/feedback_ts_review.md

> **Source**: `reviews/feedback_ts_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `feedback.ts` module handles user feedback submission to Cloudflare Worker which creates GitHub issues. These fixes address PII exposure in user feedback and network resilience—both are security and UX improvements consistent with the project's "privacy-first" philosophy.

### Phase 1: Scrub PII from Feedback Payload

**Issue**: User-submitted feedback messages are sent without PII scrubbing. Users may inadvertently include account numbers, emails, phone numbers, or IBANs when describing issues—this data then appears in public GitHub issues.

**Location**: `src/lib/api/feedback.ts:48-57`

**Current Code**:
```typescript
const requestBody = JSON.stringify({
  ...payload,
  metadata: {
    ...payload.metadata,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    version: import.meta.env.VITE_APP_VERSION || 'dev',
    platform: platformName,
  },
});
```

**Tasks**:
- [ ] Import `scrubText` and `scrubObject` from `@/lib/scrubber` in `feedback.ts`
- [ ] Apply `scrubText()` to `payload.message` before sending:
  ```typescript
  const scrubbedPayload = {
    type: payload.type,
    message: scrubText(payload.message),
    metadata: scrubObject({
      ...payload.metadata,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      version: import.meta.env.VITE_APP_VERSION || 'dev',
      platform: platformName,
    }),
  };
  const requestBody = JSON.stringify(scrubbedPayload);
  ```
- [ ] Test with IBAN input (`DE89370400440532013000`) → verify replaced with `[IBAN]`
- [ ] Test with phone number input (`+49 123 456 7890`) → verify replaced with `[PHONE]`
- [ ] Test with email input (`user@example.com`) → verify replaced with `[EMAIL]`

### Phase 2: Add Request Timeout to Fetch Call

**Issue**: The `fetch()` call has no timeout configured. If the Cloudflare Worker is slow or unresponsive, the UI will show "Sending..." indefinitely with no way to recover.

**Location**: `src/lib/api/feedback.ts:59-65`

**Current Code**:
```typescript
const response = await fetch(`${workerUrl}/feedback`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: requestBody,
});
```

**Tasks**:
- [ ] Add `AbortController` with 15-second timeout:
  ```typescript
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(`${workerUrl}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: requestBody,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // ... rest of handling
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  }
  ```
- [ ] Test with network throttling → verify timeout fires after 15 seconds
- [ ] Verify error message is user-friendly in UI

### Verification Steps

1. Submit feedback containing test IBAN: `DE89370400440532013000` → verify GitHub issue shows `[IBAN]` instead
2. Throttle network in DevTools → verify timeout triggers after 15 seconds
3. Run `npm test` after adding unit tests for scrubbing and timeout behavior

---

## Fixes from @reviews/processed/hive_client_review.md

> **Source**: `reviews/hive_client_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 3 Medium severity

### Context

The `hive_client.py` module handles community Hive synchronization via Supabase. These fixes address input validation, timezone handling, and error logging—all defense-in-depth improvements for the identity resolution pipeline.

### Phase 1: Add ISIN Input Validation

**Issue**: User-provided ISINs are passed to cache lookup and Supabase RPCs without client-side format validation. Malformed inputs waste cache lookups and API calls.

**Location**: `src-tauri/python/portfolio_src/data/hive_client.py:329-342`

**Current Code**:
```python
def lookup(self, isin: str) -> Optional[AssetEntry]:
    """
    Look up an ISIN in the universe.
    Returns from cache if available, None otherwise.
    """
    # Ensure cache is populated
    if not self._universe_cache or not self._is_cache_valid():
        self.sync_universe()

    # Check cache
    if isin in self._universe_cache:
        return self._universe_cache[isin]

    return None
```

**Tasks**:
- [ ] Add ISIN validation regex constant at module level:
  ```python
  import re
  ISIN_PATTERN = re.compile(r'^[A-Z]{2}[A-Z0-9]{9}[0-9]$')
  ```
- [ ] Add `_validate_isin()` helper method to `HiveClient` class:
  ```python
  def _validate_isin(self, isin: str) -> bool:
      """Validate ISIN format (basic check, not checksum)."""
      return bool(isin and ISIN_PATTERN.match(isin.upper()))
  ```
- [ ] Update `lookup()` to validate ISIN before cache operations:
  ```python
  if not self._validate_isin(isin):
      logger.debug(f"Invalid ISIN format: {isin}")
      return None
  ```
- [ ] Apply validation to `batch_lookup()`, `resolve_ticker()`, and contribution functions
- [ ] Add unit tests for invalid ISIN formats (empty, wrong length, special chars)
- [ ] Test with valid ISINs (`US67066G1040`, `IE00B4L5Y983`) → should work as before

### Phase 2: Fix Cache Expiry Timezone Handling

**Issue**: `datetime.now()` (timezone-naive) compared with `datetime.fromisoformat()` which may return timezone-aware datetime if cached timestamp includes timezone. Comparison fails or behaves unexpectedly.

**Location**: `src-tauri/python/portfolio_src/data/hive_client.py:196-199`

**Current Code**:
```python
cached_at = data.get("cached_at")
if cached_at:
    cached_time = datetime.fromisoformat(cached_at)
    if datetime.now() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
        return False  # Cache expired
```

**Tasks**:
- [ ] Update `_load_cache()` to normalize timezone before comparison:
  ```python
  cached_at = data.get("cached_at")
  if cached_at:
      cached_time = datetime.fromisoformat(cached_at)
      # Ensure both are timezone-naive for comparison
      if cached_time.tzinfo is not None:
          cached_time = cached_time.replace(tzinfo=None)
      if datetime.now() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
          return False  # Cache expired
  ```
- [ ] Add unit test with timezone-aware cached timestamp (`2026-01-18T12:00:00+00:00`)
- [ ] Add unit test with timezone-naive cached timestamp (`2026-01-18T12:00:00`)
- [ ] Verify cache expiry works correctly after fix

### Phase 3: Improve Silent Fallback Logging

**Issue**: Direct table query fallback after RPC failure catches and silently ignores all exceptions. Debugging RLS issues becomes difficult without log visibility.

**Location**: `src-tauri/python/portfolio_src/data/hive_client.py:881-887`

**Current Code**:
```python
except Exception as e:
    logger.warning(f"Failed to sync assets: {e}")
    # Fallback: try direct query (may fail due to RLS)
    try:
        response = client.from_("assets").select("*").execute()
        if response.data:
            result["assets"] = response.data
    except Exception:
        pass  # Silent failure
```

**Tasks**:
- [ ] Update fallback exception handler to log debug information:
  ```python
  except Exception as e:
      logger.warning(f"Failed to sync assets via RPC: {e}")
      # Note: Direct table access will fail due to RLS for anon users
      try:
          response = client.from_("assets").select("*").execute()
          if response.data:
              result["assets"] = response.data
              logger.info(f"Fallback direct query succeeded for assets: {len(response.data)} rows")
      except Exception as fallback_error:
          logger.debug(f"Direct table fallback also failed (expected with anon key): {fallback_error}")
  ```
- [ ] Apply same pattern to `listings` and `aliases` fallback blocks (lines 889-912)
- [ ] Verify RPC functions work with anon key in normal operation
- [ ] Test with Supabase unreachable → verify appropriate log messages

### Verification Steps

1. Run `pytest src-tauri/python/tests/ -k hive` → all tests pass
2. Test `lookup()` with invalid ISIN → verify debug log and `None` returned
3. Test cache with timezone-aware timestamp → verify expiry calculation correct
4. Test with RPC failure (mock Supabase error) → verify debug log shows fallback attempt

---

## Fixes from @reviews/processed/App_tsx_review.md

> **Source**: `reviews/App_tsx_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 Medium severity

### Context

The `App.tsx` root component handles initialization, routing, and global UI. This fix addresses a performance anti-pattern where a console log statement runs on every render instead of once at mount.

### Phase 1: Move Console Log into useEffect

**Issue**: Console log statement placed directly in component body executes on every render cycle, creating unnecessary output and masking timing issues during debugging.

**Location**: `src/App.tsx:65`

**Current Code**:
```typescript
    // Log environment on first render
    console.log(`[App] Running in ${getEnvironment()} environment`);
```

**Tasks**:
- [ ] Move the console log into a `useEffect` with empty dependency array:
  ```typescript
  useEffect(() => {
      if (import.meta.env.DEV) {
          console.log(`[App] Running in ${getEnvironment()} environment`);
      }
  }, []);
  ```
- [ ] Verify log appears only once in console after fix
- [ ] Run `npm run build` and confirm no dev logs in production bundle

### Verification Steps

1. Add `console.log('Render count:', ++renderCount)` temporarily to verify frequency
2. Apply fix → verify environment log appears exactly once
3. Run `npm run typecheck` → no errors
4. Run existing tests: `npm test src/App` → all pass

---

## Fixes from @reviews/processed/python_engine_review.md

> **Source**: `reviews/python_engine_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `python_engine.rs` module (193 lines) handles IPC communication with the Python headless sidecar via stdin/stdout JSON protocol. These fixes address potential race conditions and input validation gaps—defense-in-depth improvements for the Rust-Python boundary.

### Phase 1: Document Safety Invariants for Pending Request Access

**Issue**: Multiple async operations on `pending` HashMap could theoretically race under high load. Command IDs are atomic and sequential which prevents collisions, but the safety invariant is not documented.

**Location**: `src-tauri/src/python_engine.rs:112-115, 130-131, 143-148`

**Current Code**:
```rust
// Insert with lock
{
    let mut pending = self.pending.lock().await;
    pending.insert(id, tx);
}  // Lock released here

// ... write to child ...

// Remove with new lock acquisition
self.pending.lock().await.remove(&id);
```

**Tasks**:
- [ ] Add safety documentation comment above `send_command` function:
  ```rust
  /// # Safety Invariants
  /// Command IDs are monotonically increasing (via AtomicU64) and unique per request.
  /// Only one task ever operates on a given ID, making racing impossible.
  /// The lock is acquired multiple times but never for the same ID from different tasks.
  ```
- [ ] Update `remove` calls to use `let _ =` pattern for resilience to racing:
  ```rust
  let _ = self.pending.lock().await.remove(&id);
  ```
- [ ] Add `#[allow(clippy::significant_drop_in_scrutinee)]` if Clippy warns about lock scope
- [ ] Run `cargo clippy` in `src-tauri/` → no warnings related to pending access

### Phase 2: Add Command Name and Payload Validation

**Issue**: Command strings and JSON payloads passed through without validation. Defense-in-depth suggests validating inputs before sending to Python.

**Location**: `src-tauri/src/python_engine.rs:94-123`

**Current Code**:
```rust
pub async fn send_command(
    &self,
    command: &str,  // No validation
    payload: Value,  // No size limit
) -> Result<EngineResponse, String> {
```

**Tasks**:
- [ ] Add validation constants at top of `python_engine.rs`:
  ```rust
  const MAX_PAYLOAD_SIZE: usize = 10 * 1024 * 1024; // 10MB max payload
  const MAX_COMMAND_LEN: usize = 64;
  ```
- [ ] Add command name validation at start of `send_command`:
  ```rust
  // Validate command name
  if command.is_empty() || command.len() > MAX_COMMAND_LEN {
      return Err("Invalid command name length".to_string());
  }
  if !command.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
      return Err("Invalid command name format: must be lowercase alphanumeric with underscores".to_string());
  }
  if !command.chars().next().map_or(false, |c| c.is_ascii_lowercase()) {
      return Err("Command must start with lowercase letter".to_string());
  }
  ```
- [ ] Add payload size validation:
  ```rust
  // Validate payload size (serialize first to check)
  let payload_str = serde_json::to_string(&payload)
      .map_err(|e| format!("Failed to serialize payload: {}", e))?;
  if payload_str.len() > MAX_PAYLOAD_SIZE {
      return Err(format!(
          "Payload too large: {} bytes (max {} bytes)",
          payload_str.len(),
          MAX_PAYLOAD_SIZE
      ));
  }
  ```
- [ ] Test with empty command name → expect validation error
- [ ] Test with special characters in command (`cmd;ls`) → expect validation error
- [ ] Test with 100MB payload → expect size error
- [ ] Verify existing commands still work (`sync_portfolio`, `get_dashboard`, etc.)

### Verification Steps

1. Run `cargo build` in `src-tauri/` → compiles without errors
2. Run `cargo clippy` → no new warnings
3. Run `npm run tauri dev` → app starts normally
4. Test pipeline sync → completes successfully
5. Add unit test for command validation (if test harness exists for Rust layer)

---

## Fixes from @reviews/processed/useAppStore_review.md

> **Source**: `reviews/useAppStore_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `useAppStore.ts` Zustand store manages application state including notifications and toasts. These fixes address timer cleanup issues that could cause memory leaks and stale callbacks when notifications/toasts are manually dismissed before their auto-dismiss timers fire.

### Phase 1: Fix Timer Cleanup for Notification Auto-Dismiss

**Issue**: When a notification with `duration` is added, a `setTimeout` is created for auto-dismissal but the timeout ID is not tracked. If the notification is manually dismissed, the callback still executes causing unnecessary state updates and potential memory leaks.

**Location**: `src/store/useAppStore.ts:197-202`

**Current Code**:
```typescript
// Auto-dismiss if duration is set
if (notification.duration) {
  setTimeout(() => {
    get().dismissNotification(id);
  }, notification.duration);
}
```

**Tasks**:
- [ ] Add existence check before dismissing in the timeout callback:
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
- [ ] Verify no console errors occur when notification is manually dismissed before timeout
- [ ] Test with rapid add/dismiss of many notifications → verify no memory growth

### Phase 2: Fix Timer Cleanup for Toast Auto-Dismiss

**Issue**: Identical pattern to notifications—toasts with duration create untracked timeouts that fire even after manual dismissal.

**Location**: `src/store/useAppStore.ts:280-285`

**Current Code**:
```typescript
// Auto-dismiss after duration
if (duration > 0) {
  setTimeout(() => {
    get().dismissToast(id);
  }, duration);
}
```

**Tasks**:
- [ ] Add existence check before dismissing in the timeout callback:
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
- [ ] Verify no console errors when toast is manually dismissed before timeout
- [ ] Test toast stack with mixed manual/auto dismissals

### Verification Steps

1. Add notification with 3s duration
2. Manually dismiss before 3s
3. Verify no console errors or state updates after 3s
4. Add toast with 2s duration
5. Manually dismiss before 2s
6. Verify no errors after timeout fires
7. Add many notifications/toasts rapidly, dismiss all, verify no memory growth in DevTools

---

## Fixes from @reviews/processed/tr_bridge_review.md

> **Source**: `reviews/tr_bridge_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `tr_bridge.py` module manages subprocess communication between the Tauri shell and the Trade Republic daemon. These fixes address defense-in-depth for credential handling and protocol correctness to prevent response mismatches.

### Phase 1: Document Intentional Plaintext Credential Transmission

**Issue**: Phone and PIN are transmitted as plaintext JSON via stdin pipe to the daemon subprocess. While this is acceptable given the same-user process isolation, the security decision should be documented.

**Location**: `src-tauri/python/portfolio_src/core/tr_bridge.py:245-247`

**Current Code**:
```python
def login(self, phone: str, pin: str, **kwargs) -> Dict[str, Any]:
    """Initiate login process."""
    return self._send_command(TRMethod.LOGIN.value, phone=phone, pin=pin, **kwargs)
```

**Tasks**:
- [ ] Update `login()` docstring to document security context:
  ```python
  def login(self, phone: str, pin: str, **kwargs) -> Dict[str, Any]:
      """
      Initiate login process.
      
      Note: Credentials are sent via stdin pipe to daemon subprocess.
      This is acceptable as both processes run under the same user context
      and stdin is not externally accessible.
      """
      return self._send_command(TRMethod.LOGIN.value, phone=phone, pin=pin, **kwargs)
  ```
- [ ] Verify no debug logging exists that would print request params (grep for `logger.debug.*params`)
- [ ] Add code comment on `_send_command` call: `# SECURITY: Credentials cleared after daemon processes request`

### Phase 2: Validate Response ID Matches Request ID

**Issue**: Response ID is captured but never validated against request ID. If the daemon sends an out-of-order or stale response, it would be processed as the response to the current request.

**Location**: `src-tauri/python/portfolio_src/core/tr_bridge.py:226-232`

**Current Code**:
```python
request_id = f"{method}_{int(time.time() * 1000)}"
request = TRRequest(method=method, params=params, id=request_id)

# ... send request ...

response_data = json.loads(response_line.strip())
response = TRResponse(
    result=response_data.get("result"),
    error=response_data.get("error"),
    id=response_data.get("id"),  # Captured but never verified
)

if response.error:
    raise RuntimeError(f"Daemon error: {response.error}")

return response.result or {}  # ID match not checked
```

**Tasks**:
- [ ] Add ID validation after parsing response in `_send_command()`:
  ```python
  response = TRResponse(
      result=response_data.get("result"),
      error=response_data.get("error"),
      id=response_data.get("id"),
  )

  # Validate response matches request
  if response.id != request_id:
      logger.error(
          f"Response ID mismatch: expected {request_id}, got {response.id}"
      )
      raise RuntimeError(
          f"Protocol desync: response ID mismatch. Resetting daemon."
      )
      
  if response.error:
      raise RuntimeError(f"Daemon error: {response.error}")
  ```
- [ ] Add unit test that simulates ID mismatch (mock `_daemon_process.stdout.readline` to return wrong ID)
- [ ] Verify daemon correctly echoes request ID in all response paths (check `tr_daemon.py`)
- [ ] Confirm `_command_lock` prevents concurrent request scenarios (existing implementation is correct)

### Verification Steps

1. Run unit tests: `pytest src-tauri/python/tests/ -k tr_bridge`
2. Test TR login flow manually: `npm run tauri dev` → TR Login → verify no regressions
3. Check for debug logging of credentials: `grep -r "logger.*params\|logger.*phone\|logger.*pin" src-tauri/python/`
4. Inject simulated ID mismatch in debug mode → confirm `RuntimeError` raised with clear message

---

## Fixes from @reviews/processed/LoginForm_review.md

> **Source**: `reviews/LoginForm_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity (High-severity IPC issue already tracked in ipc_ts_review.md fixes)

### Context

The `LoginForm.tsx` component handles Trade Republic authentication. These fixes address phone validation restrictions and credential retention in memory—both are user experience and security improvements.

**Note**: The HIGH-severity credential logging issue is in `ipc.ts`, not LoginForm. It is already tracked in the `ipc_ts_review.md` fixes section above (Phase 1: Scrub Credentials Before Error Logging).

### Phase 1: Expand Phone Validation for EU Markets

**Issue**: Phone validation regex only accepts German numbers (`+49`), but Trade Republic operates in multiple EU countries (Austria, France, Netherlands, Spain, Italy).

**Location**: `src/components/auth/LoginForm.tsx:151-154`

**Current Code**:
```typescript
const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^\+49\d{9,15}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};
```

**Tasks**:
- [ ] Update `validatePhone` to accept E.164 format for all Trade Republic markets:
  ```typescript
  const validatePhone = (phone: string): boolean => {
    // Trade Republic markets: DE (+49), AT (+43), FR (+33), NL (+31), ES (+34), IT (+39)
    const e164Regex = /^\+(?:49|43|33|31|34|39)\d{7,15}$/;
    return e164Regex.test(phone.replace(/\s/g, ''));
  };
  ```
- [ ] Add unit test for Austrian number: `+436641234567` → should pass validation
- [ ] Add unit test for French number: `+33612345678` → should pass validation
- [ ] Verify German numbers still validate correctly
- [ ] Consider adding user-facing error message that mentions supported countries

### Phase 2: Clear PIN State on Unmount and Timeout

**Issue**: PIN is stored in React component state and remains in memory for component lifetime. Could be accessed via React DevTools or memory inspection if form is left open.

**Location**: `src/components/auth/LoginForm.tsx:122`

**Current Code**:
```typescript
const [pin, setPin] = useState('');
```

**Tasks**:
- [ ] Add cleanup effect to clear PIN on component unmount:
  ```typescript
  useEffect(() => {
    return () => {
      setPin('');
    };
  }, []);
  ```
- [ ] Add inactivity timeout to clear PIN after 5 minutes:
  ```typescript
  useEffect(() => {
    if (pin.length === 4) {
      const timeout = setTimeout(() => {
        setPin('');
      }, 5 * 60 * 1000);
      return () => clearTimeout(timeout);
    }
  }, [pin]);
  ```
- [ ] Add unit test: fill PIN, wait 5 minutes (mock timers), verify PIN cleared
- [ ] Verify form behavior after PIN cleared (user can re-enter)

### Verification Steps

1. Run `npm test src/components/auth/LoginForm` → all tests pass
2. Test with Austrian number (`+436641234567`) → frontend accepts
3. Fill PIN, wait 5+ minutes (or use fast-forward in tests) → PIN field cleared
4. Open React DevTools during login → verify PIN clears on unmount/timeout

---

## Fixes from @reviews/processed/prism_headless_review.md

> **Source**: `reviews/prism_headless_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `prism_headless.py` entry point is the main launch point for the Prism Headless Engine. It handles both production (stdin/stdout IPC) and development (HTTP Echo-Bridge) modes. These fixes address network exposure in dev mode and silent failure handling that could complicate debugging.

### Phase 1: Default HTTP Host to Localhost

**Issue**: The `--host` argument defaults to `0.0.0.0`, binding to all network interfaces. While Echo-Bridge is development-only, accidental exposure on shared networks could allow unauthorized engine access.

**Location**: `src-tauri/python/prism_headless.py:60`

**Current Code**:
```python
parser.add_argument("--host", type=str, default="0.0.0.0", help="HTTP server port")
```

**Tasks**:
- [ ] Change default host from `"0.0.0.0"` to `"127.0.0.1"` in `prism_headless.py:60`
- [ ] Fix help text from `"HTTP server port"` to `"HTTP server host"`
- [ ] Document in help text that `--host 0.0.0.0` is needed for network access
- [ ] Test Echo-Bridge development workflow still works with localhost binding
- [ ] Verify `npm run tauri dev` connects successfully to localhost-bound server

**Suggested Fix**:
```python
parser.add_argument("--host", type=str, default="127.0.0.1", help="HTTP server host (use 0.0.0.0 for network access)")
```

### Phase 2: Log Warning on certifi Import Failure

**Issue**: When `certifi` is not available in a PyInstaller bundle, the ImportError is silently ignored. This could cause SSL certificate verification failures later that would be difficult to trace back to the missing setup.

**Location**: `src-tauri/python/prism_headless.py:24-25`

**Current Code**:
```python
try:
    import certifi

    os.environ["SSL_CERT_FILE"] = certifi.where()
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
except ImportError:
    pass
```

**Tasks**:
- [ ] Replace silent `pass` with informative stderr message in `prism_headless.py:24-25`
- [ ] Use `sys.stderr` to avoid polluting stdout IPC channel
- [ ] Keep message concise with `PRISM INFO:` prefix for consistency
- [ ] Test PyInstaller bundle without certifi → verify warning printed to stderr
- [ ] Verify HTTPS requests work with system certificates when certifi unavailable

**Suggested Fix**:
```python
try:
    import certifi

    os.environ["SSL_CERT_FILE"] = certifi.where()
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
except ImportError:
    # certifi not bundled - will use system certificates
    import sys
    print("  PRISM INFO: certifi not available, using system SSL certificates", file=sys.stderr)
```

### Verification Steps

1. Run `python prism_headless.py --help` → verify host help text is correct
2. Run `python prism_headless.py --http` → verify binds to 127.0.0.1 by default
3. Run `python prism_headless.py --http --host 0.0.0.0` → verify explicit network binding works
4. Build PyInstaller bundle without certifi → verify warning printed to stderr
5. Run `npm run tauri dev` → confirm development workflow unaffected

---

## Fixes from @reviews/processed/proxy_client_review.md

> **Source**: `@reviews/processed/proxy_client_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 3 Medium severity

### Context

The `proxy_client.py` module routes API calls through a Cloudflare Worker for API key protection. These fixes address input validation gaps, a security bypass in the resolution fallback, and transient failure handling—all consistent with the project's "API keys MUST be proxied" constraint in `AGENTS.md`.

### Phase 1: Add Symbol/Query Input Validation

**Issue**: User-provided ticker symbols and search queries are passed to the proxy API without validation. Defense-in-depth requires client-side validation to prevent malformed requests and reduce attack surface.

**Location**: `src-tauri/python/portfolio_src/data/proxy_client.py:135-169`

**Current Code**:
```python
def get_company_profile(self, symbol: str) -> ProxyResponse:
    return self._request(ProxyEndpoint.FINNHUB_PROFILE, payload={"symbol": symbol})

def get_quote(self, symbol: str) -> ProxyResponse:
    return self._request(ProxyEndpoint.FINNHUB_QUOTE, payload={"symbol": symbol})

def search_symbol(self, query: str) -> ProxyResponse:
    return self._request(ProxyEndpoint.FINNHUB_SEARCH, payload={"q": query})
```

**Tasks**:
- [ ] Add `SYMBOL_PATTERN` regex constant at module level: `re.compile(r'^[A-Z0-9.\-]{1,10}$')`
- [ ] Add `_validate_symbol()` method to `ProxyClient` class:
  ```python
  def _validate_symbol(self, symbol: str) -> str:
      """Validate and normalize stock symbol."""
      if not symbol or not isinstance(symbol, str):
          raise ValueError("Symbol must be a non-empty string")
      normalized = symbol.upper().strip()
      if not SYMBOL_PATTERN.match(normalized):
          raise ValueError(f"Invalid symbol format: {symbol}")
      return normalized
  ```
- [ ] Update `get_company_profile()` to validate and normalize symbol before request
- [ ] Update `get_quote()` to validate and normalize symbol before request
- [ ] Return `ProxyResponse(success=False, data=None, error=str(e), status_code=400)` on validation failure
- [ ] Add unit tests for: empty symbol, None, too long, special chars, lowercase normalization
- [ ] Test edge cases: "BRK.A", "BRK-B" should pass validation

### Phase 2: Remove Direct Finnhub API Fallback in Resolution

**Issue**: `resolution.py` falls back to direct Finnhub API calls using `FINNHUB_API_KEY` from environment when proxy fails. This violates the `AGENTS.md` constraint: "API keys MUST be proxied via Cloudflare Worker — never in client."

**Location**: `src-tauri/python/portfolio_src/data/resolution.py:476-498`

**Current Code**:
```python
if FINNHUB_API_KEY:
    try:
        response = requests.get(
            f"{FINNHUB_API_URL}/stock/profile2",
            params={"symbol": ticker},
            headers={"X-Finnhub-Token": FINNHUB_API_KEY},
            timeout=10,
        )
```

**Tasks**:
- [ ] Delete direct API fallback block in `_call_finnhub_with_status()` (lines 476-498 in `resolution.py`)
- [ ] Remove `FINNHUB_API_KEY` and `FINNHUB_API_URL` imports/references if no longer used
- [ ] Verify application runs correctly with `FINNHUB_API_KEY` environment variable unset
- [ ] Verify all Finnhub calls route through proxy
- [ ] Add comment at proxy call site: `# All Finnhub calls MUST go through proxy (see AGENTS.md)`

### Phase 3: Add Retry Logic for Transient Network Failures

**Issue**: The `_request` method makes a single attempt and returns failure immediately. Transient network issues (DNS resolution, connection drops) should be retried with exponential backoff.

**Location**: `src-tauri/python/portfolio_src/data/proxy_client.py:69-131`

**Current Code**:
```python
def _request(self, endpoint, method="POST", payload=None) -> ProxyResponse:
    # Single attempt, no retry
    try:
        response = self._session.post(...)
    except requests.exceptions.RequestException as e:
        return ProxyResponse(success=False, ...)  # Immediate failure
```

**Tasks**:
- [ ] Add `tenacity` to `requirements.txt` if not present (check existing deps first)
- [ ] Add `_request_with_retry()` internal method with exponential backoff:
  ```python
  from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
  
  @retry(
      stop=stop_after_attempt(3),
      wait=wait_exponential(multiplier=1, min=1, max=10),
      retry=retry_if_exception_type((requests.exceptions.ConnectionError, 
                                      requests.exceptions.Timeout)),
      reraise=True
  )
  def _request_with_retry(self, url, method, payload):
      if method == "POST":
          return self._session.post(url, json=payload or {}, timeout=self.timeout)
      return self._session.get(url, params=payload or {}, timeout=self.timeout)
  ```
- [ ] Update `_request()` to call `_request_with_retry()` instead of direct session calls
- [ ] Ensure rate limit errors (429) are NOT retried (return immediately)
- [ ] Add unit test simulating network interruption → verify retry occurs
- [ ] Add unit test for 429 response → verify no retry

### Verification Steps

1. Run `pytest src-tauri/python/tests/test_proxy_client.py` → all tests pass
2. Test with invalid symbol input → verify 400 error with clear message
3. Test with `FINNHUB_API_KEY` unset → verify app doesn't crash, uses proxy only
4. Simulate network timeout → verify retry with exponential backoff
5. Verify 429 rate limit errors return immediately without retry

---

## Fixes from vanguard_py_review.md

> **Source**: `reviews/vanguard_py_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `vanguard.py` adapter fetches ETF holdings data using multiple strategies: manual file upload, US Vanguard API, and German site scraping. These fixes address input validation and code quality issues—consistent with similar fixes applied to `ishares.py` and `xtrackers.py` adapters.

### Phase 1: ISIN Input Validation

**Issue**: ISIN parameter used directly in API URLs and file paths without validation, enabling potential path traversal in manual file lookup and unexpected behavior in URL construction.

**Location**: `src-tauri/python/portfolio_src/adapters/vanguard.py:107,333,432-433`

**Current Code**:
```python
@cache_adapter_data(ttl_hours=24)
def fetch_holdings(self, isin: str) -> pd.DataFrame:
    # isin used directly without validation
    logger.info(f"--- Running Vanguard holdings acquisition for {isin} ---")
    # ...
    
def _fetch_from_manual_file(self, isin: str) -> Optional[pd.DataFrame]:
    manual_dir = MANUAL_INPUTS_DIR
    xlsx_path = os.path.join(manual_dir, f"{isin}.xlsx")  # No validation
    csv_path = os.path.join(manual_dir, f"{isin}.csv")
```

**Tasks**:
- [ ] Import `is_valid_isin` from `portfolio_src.prism_utils.isin_validator` (or create if not exists)
- [ ] Add ISIN validation at start of `fetch_holdings()`:
  ```python
  if not isin or not is_valid_isin(isin):
      logger.error(f"Invalid ISIN format: {isin}")
      return pd.DataFrame()
  isin = isin.upper().strip()  # Normalize
  ```
- [ ] Test with valid ISINs (`IE00B4L5Y983`, `US67066G1040`) → should work
- [ ] Test with path traversal attempt (`../../../etc/passwd`) → should return empty DataFrame
- [ ] Test with empty string and malformed input → should return empty DataFrame
- [ ] Verify no path traversal possible in `_fetch_from_manual_file()`

### Phase 2: Remove Duplicate Logger Assignment

**Issue**: Logger is initialized twice in the module, suggesting copy-paste error from module reorganization. While functionally benign, it creates redundancy and could mask import order issues.

**Location**: `src-tauri/python/portfolio_src/adapters/vanguard.py:24,31`

**Current Code**:
```python
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)  # First assignment (line 24)

from portfolio_src.data.caching import cache_adapter_data
from portfolio_src.data.holdings_cache import ManualUploadRequired
from portfolio_src.prism_utils.logging_config import get_logger  # Duplicate import
from portfolio_src.config import MANUAL_INPUTS_DIR, RAW_DOWNLOADS_DIR

logger = get_logger(__name__)  # Second assignment (line 31)
```

**Tasks**:
- [ ] Remove duplicate `from portfolio_src.prism_utils.logging_config import get_logger` import (line ~27)
- [ ] Remove duplicate `logger = get_logger(__name__)` assignment (line 31)
- [ ] Remove unused import `RAW_DOWNLOADS_DIR` from config import
- [ ] Reorganize imports to follow standard pattern: stdlib → third-party → local
- [ ] Verify import order works correctly: `python -c "from portfolio_src.adapters.vanguard import VanguardAdapter"`
- [ ] Run existing tests: `pytest src-tauri/python/tests/ -k vanguard`

### Verification Steps

1. Run adapter tests: `pytest src-tauri/python/tests/ -k vanguard`
2. Test with invalid ISIN via Python REPL → verify error logged and empty DataFrame returned
3. Verify import works correctly after cleanup
4. Verify existing ETF fetches still work (`IE00B4L5Y983`)

---

## Fixes from dispatcher_review.md

> **Source**: `reviews/dispatcher_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `dispatcher.py` module routes IPC commands to handler functions. These fixes address security and correctness concerns: exception details exposed to clients and missing input type validation at the IPC boundary.

### Phase 1: Sanitize Exception Messages in Error Responses

**Issue**: Internal exception messages are returned to the client via `str(e)`, potentially leaking implementation details, file paths, or stack trace information.

**Location**: `src-tauri/python/portfolio_src/headless/dispatcher.py:55-57`

**Current Code**:
```python
except Exception as e:
    logger.error(f"Handler error for '{command}': {e}", exc_info=True)
    return error_response(cmd_id, "HANDLER_ERROR", str(e))
```

**Tasks**:
- [ ] Update exception handler to return generic message instead of raw exception:
  ```python
  except Exception as e:
      logger.error(f"Handler error for '{command}': {e}", exc_info=True)
      return error_response(
          cmd_id, 
          "HANDLER_ERROR", 
          "An internal error occurred. Check logs for details."
      )
  ```
- [ ] (Optional) Create `HandlerValidationError` in `portfolio_src/headless/exceptions.py` for expected validation errors that are safe to expose
- [ ] If validation error pattern is added, update handler to distinguish:
  ```python
  from portfolio_src.headless.exceptions import HandlerValidationError
  
  try:
      # ... handler invocation
  except HandlerValidationError as e:
      # Expected validation errors - safe to expose message
      return error_response(cmd_id, e.code, str(e))
  except Exception as e:
      logger.error(f"Handler error for '{command}': {e}", exc_info=True)
      return error_response(cmd_id, "HANDLER_ERROR", "Internal error occurred")
  ```
- [ ] Test: trigger exception in handler → verify client receives generic message
- [ ] Test: verify full exception details appear in server logs

### Phase 2: Add Input Type Validation for Command Structure

**Issue**: The `dispatch()` function accepts any dict without validating expected structure. Malformed input (e.g., `payload` is string instead of dict) could cause unexpected errors in handlers.

**Location**: `src-tauri/python/portfolio_src/headless/dispatcher.py:17-37`

**Current Code**:
```python
async def dispatch(cmd: dict[str, Any]) -> dict[str, Any]:
    command = cmd.get("command", "")
    cmd_id = cmd.get("id", 0)
    payload = cmd.get("payload", {})
```

**Tasks**:
- [ ] Add `validate_command()` helper function in `dispatcher.py`:
  ```python
  def validate_command(cmd: Any) -> tuple[str, int, dict[str, Any]]:
      """Validate and extract command components.
      
      Raises:
          ValueError: If command structure is invalid.
      """
      if not isinstance(cmd, dict):
          raise ValueError("Command must be a dict")
      
      command = cmd.get("command")
      if not isinstance(command, str):
          raise ValueError("Command 'command' field must be a string")
      
      cmd_id = cmd.get("id", 0)
      if not isinstance(cmd_id, int):
          raise ValueError("Command 'id' field must be an integer")
      
      payload = cmd.get("payload", {})
      if not isinstance(payload, dict):
          raise ValueError("Command 'payload' field must be a dict")
      
      return command, cmd_id, payload
  ```
- [ ] Update `dispatch()` to use validation at entry point:
  ```python
  async def dispatch(cmd: dict[str, Any]) -> dict[str, Any]:
      try:
          command, cmd_id, payload = validate_command(cmd)
      except ValueError as e:
          return error_response(0, "INVALID_COMMAND", str(e))
      
      # ... rest of dispatch logic
  ```
- [ ] Add test: `dispatch({"command": 123, "id": 1, "payload": {}})` → returns INVALID_COMMAND
- [ ] Add test: `dispatch({"command": "x", "id": "1", "payload": {}})` → returns INVALID_COMMAND
- [ ] Add test: `dispatch({"command": "x", "id": 1, "payload": "not a dict"})` → returns INVALID_COMMAND
- [ ] Run existing dispatcher tests: `pytest src-tauri/python/tests/headless/test_dispatcher.py`

### Verification Steps

1. Run `pytest src-tauri/python/tests/headless/test_dispatcher.py -v` → all tests pass
2. Trigger handler exception → confirm client receives generic "Internal error" message
3. Check logs → confirm full exception with traceback is logged
4. Send malformed command structure → confirm INVALID_COMMAND error with clear message
5. Verify normal commands still work correctly

---

## Fixes from ishares_py_review.md

> **Source**: `reviews/ishares_py_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `ISharesAdapter` fetches ETF holdings data from iShares via direct CSV download. These fixes address an undefined variable bug that breaks config persistence and missing input validation that could cause unexpected behavior.

### Phase 1: Fix Undefined Variable `ISHARES_CONFIG_PATH`

**Issue**: The `_save_config` method references `ISHARES_CONFIG_PATH` which is never defined. The correct variable is `CONFIG_PATH` (defined on line 16). This causes a `NameError` at runtime, preventing auto-discovered product IDs from persisting.

**Location**: `src-tauri/python/portfolio_src/adapters/ishares.py:41-46`

**Current Code**:
```python
def _save_config(self):
    try:
        os.makedirs(os.path.dirname(ISHARES_CONFIG_PATH), exist_ok=True)
        with open(ISHARES_CONFIG_PATH, "w") as f:
            json.dump(self.config, f, indent=4)
        logger.info(f"Updated iShares config saved to {ISHARES_CONFIG_PATH}")
    except Exception as e:
        logger.error(f"Failed to save iShares config: {e}")
```

**Tasks**:
- [ ] Replace all occurrences of `ISHARES_CONFIG_PATH` with `CONFIG_PATH` in `_save_config` method (lines 41, 42, 44)
- [ ] Verify no other undefined variable references exist: `grep -n "ISHARES_CONFIG_PATH" ishares.py`
- [ ] Test: `python -c "from portfolio_src.adapters.ishares import ISharesAdapter; a = ISharesAdapter(); a._save_config()"`
- [ ] Verify config file is created at expected path without `NameError`

### Phase 2: Add ISIN Input Validation

**Issue**: The `isin` parameter is used directly in URL construction and file paths without validation. Malformed input could cause unexpected behavior or be used for URL manipulation.

**Location**: `src-tauri/python/portfolio_src/adapters/ishares.py` (fetch_holdings method)

**Current Code**:
```python
@cache_adapter_data(ttl_hours=24)
def fetch_holdings(self, isin: str) -> pd.DataFrame:
    logger.info(f"--- Fetching holdings for {isin} ---")
    # isin used directly in URL without validation
```

**Tasks**:
- [ ] Import existing validator: `from portfolio_src.prism_utils.isin_validator import is_valid_isin`
- [ ] Add ISIN validation at start of `fetch_holdings()`:
  ```python
  if not isin or not is_valid_isin(isin):
      logger.warning(f"Invalid ISIN format: {isin}")
      return pd.DataFrame()
  
  isin = isin.upper().strip()  # Normalize
  ```
- [ ] Test with valid ISIN (`IE00B4L5Y983`) → should work normally
- [ ] Test with path traversal attempt (`../../../etc/passwd`) → should return empty DataFrame
- [ ] Test with empty string → should return empty DataFrame
- [ ] Test with malformed ISIN (`INVALID123`) → should return empty DataFrame with warning

### Verification Steps

1. Run `python -c "from portfolio_src.adapters.ishares import ISharesAdapter; a = ISharesAdapter(); a._save_config()"` → no NameError
2. Verify config file created at `~/.config/portfolioprism/ishares_config.json` (or equivalent)
3. Test adapter with invalid ISIN → verify warning logged and empty DataFrame returned
4. Run existing adapter tests: `pytest src-tauri/python/tests/ -k ishares`
5. Test with real ISIN to confirm normal operation is not affected

---

## Fixes from @reviews/processed/scrubber_ts_review.md

> **Source**: `reviews/scrubber_ts_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 3 Medium severity

### Context

The `scrubber.ts` module provides frontend PII scrubbing for error reporting. It mirrors the Python `reporter.py` scrubber for consistency across the stack. These fixes address hash algorithm mismatch with the backend, missing PII patterns, and a potential ReDoS vulnerability—all are correctness and security improvements for the privacy-first error reporting system.

### Phase 1: Align Hash Algorithm with Backend (SHA-256)

**Issue**: Frontend uses djb2-style hash while Python backend uses SHA-256. The same ISIN produces different hash outputs, making it impossible to correlate assets across frontend and backend error reports.

**Location**: `src/lib/scrubber.ts:17-25`

**Current Code**:
```typescript
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 8);
}
```

**Tasks**:
- [ ] Replace `simpleHash` with SHA-256 implementation in `src/lib/scrubber.ts`:
  ```typescript
  async function sha256Hash(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 8);
  }
  ```
- [ ] Update `scrubText` function signature to `async` and await the hash call
- [ ] Update all callers of `scrubText` to handle async (check `ErrorBoundary.tsx`)
- [ ] Verify hash output matches Python `Scrubber.hash_isin()` for test ISIN `US0378331005`
- [ ] Add unit test comparing frontend and backend hash outputs

### Phase 2: Add Missing PII Patterns

**Issue**: Scrubber covers common patterns but misses credit card numbers, SSNs, IP addresses, and file paths that could reveal usernames.

**Location**: `src/lib/scrubber.ts:7-13`

**Current Code**:
```typescript
export const PII_PATTERNS = [
  { pattern: /[A-Z]{2}[0-9]{2}(?:\s?[A-Z0-9]){12,30}/g, replacement: '[IBAN]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL]' },
  { pattern: /\+?[0-9]{1,4}[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,4}[-.\s]?[0-9]{1,9}/g, replacement: '[PHONE]' },
  { pattern: /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g, replacement: '[TOKEN]' },
  { pattern: /(?:key|secret|password|token|auth|bearer)\s*[:=]\s*['"]?[A-Za-z0-9-_]{16,}['"]?/gi, replacement: '[SENSITIVE_DATA]' },
];
```

**Tasks**:
- [ ] Add credit card number pattern to `PII_PATTERNS` in `src/lib/scrubber.ts`:
  ```typescript
  { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[CARD_NUMBER]' },
  ```
- [ ] Add SSN pattern:
  ```typescript
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
  ```
- [ ] Add IP address pattern:
  ```typescript
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_ADDRESS]' },
  ```
- [ ] Add file path pattern (captures macOS/Linux/Windows usernames):
  ```typescript
  { pattern: /(?:\/Users\/|\/home\/|C:\\Users\\)[^\s:'"]+/g, replacement: '[FILE_PATH]' },
  ```
- [ ] Add unit tests for each new pattern (credit card, SSN, IP, file path)
- [ ] Test for false positives in normal portfolio data (e.g., 4-digit years shouldn't match card pattern)

### Phase 3: Add Input Length Limit to Prevent ReDoS

**Issue**: Phone number regex with multiple optional groups and greedy quantifiers could cause exponential backtracking on malicious input, freezing the UI during error reporting.

**Location**: `src/lib/scrubber.ts:27-41`

**Current Code**:
```typescript
export function scrubText(text: string): string {
  if (!text) return '';
  
  let scrubbed = text;
  
  for (const { pattern, replacement } of PII_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, replacement);
  }
  // ...
}
```

**Tasks**:
- [ ] Add input length limit at start of `scrubText` function in `src/lib/scrubber.ts`:
  ```typescript
  export function scrubText(text: string): string {
    if (!text) return '';
    
    // Limit input length to prevent ReDoS on absurdly long strings
    const MAX_LENGTH = 100000;
    let scrubbed = text.length > MAX_LENGTH 
      ? text.substring(0, MAX_LENGTH) + '[TRUNCATED]' 
      : text;
    
    for (const { pattern, replacement } of PII_PATTERNS) {
      scrubbed = scrubbed.replace(pattern, replacement);
    }
    // ...
  }
  ```
- [ ] Add unit test with crafted input: `"+" + "0".repeat(10000)` → should complete in <100ms
- [ ] Add unit test for truncation: 150000 char input → output ends with `[TRUNCATED]`
- [ ] Verify normal error messages (under 100KB) process without truncation

### Verification Steps

1. Run `npm test src/lib/scrubber` → all tests pass
2. Compare hash outputs: run Python `Scrubber.hash_isin("US0378331005")` and frontend equivalent → hashes match
3. Test PII scrubbing with sample data:
   - Credit card: `4111-1111-1111-1111` → `[CARD_NUMBER]`
   - IP address: `192.168.1.1` → `[IP_ADDRESS]`
   - File path: `/Users/john/Documents/secret.txt` → `[FILE_PATH]`
4. Test ReDoS mitigation: input of 150000 `0` characters → completes quickly, output ends with `[TRUNCATED]`
5. Verify no false positives in normal portfolio error messages

---

## Fixes from Toast_review.md

> **Source**: `reviews/Toast_review.md`

---

## Fixes from App_tsx_review.md

> **Source**: `reviews/App_tsx_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 Medium severity

### Context

The `App.tsx` root component handles application initialization, view routing, and global UI. The review found one medium-severity performance issue where a console.log statement runs on every render instead of once on mount.

### Phase 1: Move Console Log to useEffect

**Issue**: Console log statement at line 65 is placed directly in the component body, causing it to execute on every render cycle. This is a performance anti-pattern and creates noisy console output during debugging.

**Location**: `src/App.tsx:65`

**Current Code**:
```typescript
    // Log environment on first render
    console.log(`[App] Running in ${getEnvironment()} environment`);
```

**Tasks**:
- [ ] Move the console.log into a `useEffect` with empty dependency array in `src/App.tsx`:
  ```typescript
  useEffect(() => {
      console.log(`[App] Running in ${getEnvironment()} environment`);
  }, []);
  ```
- [ ] Optionally, wrap in dev-only conditional to exclude from production:
  ```typescript
  useEffect(() => {
      if (import.meta.env.DEV) {
          console.log(`[App] Running in ${getEnvironment()} environment`);
      }
  }, []);
  ```
- [ ] Verify the log appears only once during app initialization
- [ ] Run `npm run build` to confirm no development logs in production bundle

### Verification Steps

1. Run `npm run tauri dev` → observe console output
2. Navigate between views multiple times → verify log does NOT repeat
3. Run `npm run build && npm run preview` → confirm no environment log in production
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `Toast.tsx` component displays glassmorphic toast notifications. These fixes address accessibility gaps—ensuring screen reader users can perceive and dismiss notifications effectively.

### Phase 1: Add Accessibility Attributes to Close Button

**Issue**: Close button lacks `aria-label` and `type` attribute, making it inaccessible to screen readers and potentially causing form submission issues.

**Location**: `src/components/ui/Toast.tsx:152-162`

**Current Code**:
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

**Tasks**:
- [ ] Add `aria-label` attribute to close button: `aria-label={`Dismiss ${toast.title} notification`}`
- [ ] Add `type="button"` attribute to prevent form submission issues
- [ ] Add `aria-hidden="true"` to the SVG icon (decorative, already labeled by button)
- [ ] Test with VoiceOver on macOS → verify button announces correctly
- [ ] Verify button is keyboard focusable (Tab key)

### Phase 2: Add ARIA Live Region to Toast Container

**Issue**: Toast container is not an ARIA live region; screen readers don't announce new notifications when they appear.

**Location**: `src/components/ui/Toast.tsx:173-194`

**Current Code**:
```typescript
<div style={styles.container}>
  {toasts.map((toast) => (
    <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
  ))}
</div>
```

**Tasks**:
- [ ] Add ARIA live region attributes to toast container:
  ```typescript
  <div 
    style={styles.container}
    role="region"
    aria-label="Notifications"
    aria-live="polite"
    aria-relevant="additions removals"
  >
  ```
- [ ] Test with VoiceOver: trigger toast programmatically → verify screen reader announces notification
- [ ] Test with NVDA (if Windows available) for cross-platform verification
- [ ] Verify existing toast functionality unaffected (visual appearance, dismiss behavior)

### Verification Steps

1. Run accessibility audit with axe-core or browser DevTools
2. Test with VoiceOver on macOS: trigger toast → confirm announcement
3. Keyboard test: Tab to close button → press Enter/Space → toast dismisses
4. Visual regression: verify toast appearance unchanged after a11y additions

---

## Fixes from pyproject_toml_review.md

> **Source**: `reviews/pyproject_toml_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `pyproject.toml` configuration for the Python sidecar has outdated dependencies and lacks automated vulnerability scanning. These fixes address supply chain security—critical for an application handling financial credentials and portfolio data.

### Phase 1: Update pytr Package to Latest Version

**Issue**: The `pytr` package (Trade Republic API client) is pinned to `>=0.4.2` but the latest version is `0.4.5`. This package handles authentication and sensitive financial data; staying current ensures security patches are applied.

**Location**: `src-tauri/python/pyproject.toml:23`

**Current Code**:
```toml
"pytr>=0.4.2",
```

**Tasks**:
- [ ] Update `pytr` version constraint from `>=0.4.2` to `>=0.4.5` in `src-tauri/python/pyproject.toml`
- [ ] Run `uv lock --upgrade-package pytr` to update lockfile
- [ ] Test Trade Republic authentication flow: `npm run tauri dev` → TR Login
- [ ] Verify portfolio sync still works after update

### Phase 2: Add Automated Dependency Vulnerability Scanning

**Issue**: No automated vulnerability scanning configured for Python dependencies. The application handles financial credentials and portfolio data, making automated security scanning essential.

**Location**: `src-tauri/python/pyproject.toml` (missing vulnerability scanning tooling)

**Current Code**:
```toml
[dependency-groups]
dev = [
    "pytest>=9.0.2",
]
```

**Tasks**:
- [ ] Add `pip-audit` to dev dependencies in `src-tauri/python/pyproject.toml`:
  ```toml
  [dependency-groups]
  dev = [
      "pytest>=9.0.2",
      "pip-audit>=2.7.0",
  ]
  ```
- [ ] Run `uv sync --group dev` to install pip-audit
- [ ] Run `pip-audit` locally and verify no known vulnerabilities
- [ ] Add pip-audit step to CI pipeline (`.github/workflows/ci.yml`):
  ```yaml
  - name: Python security audit
    run: |
      cd src-tauri/python
      uv sync --group dev
      pip-audit
  ```
- [ ] Create `.github/dependabot.yml` with Python ecosystem configuration:
  ```yaml
  version: 2
  updates:
    - package-ecosystem: "pip"
      directory: "/src-tauri/python"
      schedule:
        interval: "weekly"
      labels:
        - "dependencies"
        - "python"
  ```

### Verification Steps

1. Run `uv lock --upgrade-package pytr` → lockfile updated
2. Run `pip-audit` in `src-tauri/python/` → no critical vulnerabilities
3. Test TR login and portfolio sync → functionality preserved
4. Verify Dependabot config: `ls -la .github/dependabot.yml`
5. Verify CI pipeline includes security audit step

---

## Fixes from worker_review.md

> **Source**: `reviews/worker_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 High, 3 Medium severity

### Context

The Cloudflare Worker (`infrastructure/cloudflare/worker.js`) handles API key injection, CORS, rate limiting, and proxying requests to Finnhub and GitHub. These fixes address input validation gaps and security hardening—consistent with the project's "API keys MUST be proxied via Cloudflare Worker" constraint.

### Phase 1: Add Input Validation on Finnhub Endpoints (HIGH)

**Issue**: Symbol and query parameters are passed directly to Finnhub without validation. Allows resource abuse, quota exhaustion, and malformed API requests.

**Location**: `infrastructure/cloudflare/worker.js:260-269`

**Current Code**:
```javascript
case '/api/finnhub/profile':
    data = await proxyFinnhub('stock/profile2', { symbol: body.symbol }, env);
    break;

case '/api/finnhub/quote':
    data = await proxyFinnhub('quote', { symbol: body.symbol }, env);
    break;

case '/api/finnhub/search':
    data = await proxyFinnhub('search', { q: body.q }, env);
    break;
```

**Tasks**:
- [ ] Add `validateSymbol()` helper at top of `worker.js`:
  ```javascript
  function validateSymbol(symbol) {
      if (!symbol || typeof symbol !== 'string') return null;
      // Stock symbols: 1-10 uppercase letters, may include dots (BRK.A) or hyphens
      const cleaned = symbol.trim().toUpperCase();
      if (!/^[A-Z]{1,10}(?:[.-][A-Z]{1,5})?$/.test(cleaned)) return null;
      return cleaned;
  }
  ```
- [ ] Add `validateSearchQuery()` helper:
  ```javascript
  function validateSearchQuery(query) {
      if (!query || typeof query !== 'string') return null;
      const cleaned = query.trim().slice(0, 50); // Max 50 chars
      if (cleaned.length < 1) return null;
      return cleaned;
  }
  ```
- [ ] Update `/api/finnhub/profile` case to validate `body.symbol` and return 400 on invalid
- [ ] Update `/api/finnhub/quote` case to validate `body.symbol` and return 400 on invalid
- [ ] Update `/api/finnhub/search` case to validate `body.q` and return 400 on invalid
- [ ] Test with valid symbol (`AAPL`) → should work
- [ ] Test with invalid inputs (`""`, `123`, `"../../etc"`) → should return 400

### Phase 2: Add Feedback Input Size Validation (MEDIUM)

**Issue**: `/feedback` and `/report` endpoints accept user-provided `message` and `metadata` without size limits. Allows resource exhaustion and GitHub API abuse.

**Location**: `infrastructure/cloudflare/worker.js:155-178, 272-283`

**Current Code**:
```javascript
case '/feedback':
    const feedbackTitle = formatFeedbackTitle(body.type, body.message);
    const feedbackBody = formatFeedbackBody(body.message, body.metadata || {});
    // No size validation on body.message or body.metadata
```

**Tasks**:
- [ ] Add `validateFeedbackInput()` helper:
  ```javascript
  function validateFeedbackInput(body) {
      const errors = [];
      
      const validTypes = ['functional', 'feature', 'ui_ux', 'critical'];
      if (!body.type || !validTypes.includes(body.type)) {
          errors.push('Invalid feedback type');
      }
      
      if (!body.message || typeof body.message !== 'string') {
          errors.push('Message is required');
      } else if (body.message.length > 10000) {
          errors.push('Message exceeds 10,000 character limit');
      }
      
      if (body.metadata && JSON.stringify(body.metadata).length > 5000) {
          errors.push('Metadata exceeds 5KB limit');
      }
      
      return errors;
  }
  ```
- [ ] Update `/feedback` route to call `validateFeedbackInput()` and return 400 on errors
- [ ] Update `/report` route with similar validation for `title` and `body` fields
- [ ] Test with normal feedback → should work
- [ ] Test with 15,000 char message → should return 400
- [ ] Test with massive metadata object → should return 400

### Phase 3: Environment-Based CORS Origins (MEDIUM)

**Issue**: Production worker accepts requests from `http://localhost:1420` and `http://localhost:8501`. Allows malicious local scripts to access the API.

**Location**: `infrastructure/cloudflare/worker.js:43-48`

**Current Code**:
```javascript
const allowedOrigins = [
    'tauri://localhost',
    'http://localhost:1420',
    'http://localhost:8501',
    'https://localhost'
];
```

**Tasks**:
- [ ] Update `corsHeaders()` function to use environment-based origin configuration:
  ```javascript
  function corsHeaders(origin, env) {
      // Production origins
      const prodOrigins = ['tauri://localhost'];
      
      // Development origins (only in dev environment)
      const devOrigins = env.ENVIRONMENT === 'development' 
          ? ['http://localhost:1420', 'http://localhost:8501', 'https://localhost']
          : [];
      
      const allowedOrigins = [...prodOrigins, ...devOrigins];
      const corsOrigin = allowedOrigins.includes(origin) ? origin : prodOrigins[0];

      return {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
      };
  }
  ```
- [ ] Update all `corsHeaders(origin)` calls to `corsHeaders(origin, env)`
- [ ] Add `ENVIRONMENT` variable to `wrangler.toml`:
  ```toml
  [vars]
  ENVIRONMENT = "production"
  
  [env.dev.vars]
  ENVIRONMENT = "development"
  ```
- [ ] Test production deployment: requests from `http://localhost:1420` should be rejected
- [ ] Test dev deployment: localhost origins should work

### Phase 4: Migrate to Persistent Rate Limiting (MEDIUM)

**Issue**: In-memory rate limiting (`Map()`) resets on worker restarts and is not shared across edge locations. Attackers can bypass by waiting for isolate recycling.

**Location**: `infrastructure/cloudflare/worker.js:17-37`

**Current Code**:
```javascript
// In-memory rate limit store (use KV in production)
const rateLimitStore = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.windowMs;

    let entry = rateLimitStore.get(ip);
    if (!entry || entry.windowStart < windowStart) {
        entry = { windowStart: now, count: 0 };
    }

    entry.count++;
    rateLimitStore.set(ip, entry);

    return entry.count <= RATE_LIMIT.maxRequests;
}
```

**Tasks**:
- [ ] Create `RATE_LIMIT_KV` namespace in Cloudflare dashboard or via Wrangler CLI
- [ ] Add KV binding to `wrangler.toml`:
  ```toml
  [[kv_namespaces]]
  binding = "RATE_LIMIT_KV"
  id = "<your-kv-namespace-id>"
  ```
- [ ] Update `checkRateLimit()` to use KV with async pattern:
  ```javascript
  async function checkRateLimit(ip, env) {
      const now = Date.now();
      const key = `ratelimit:${ip}`;
      
      const stored = await env.RATE_LIMIT_KV.get(key, 'json');
      const windowStart = now - RATE_LIMIT.windowMs;
      
      let entry = stored && stored.windowStart > windowStart 
          ? stored 
          : { windowStart: now, count: 0 };
      entry.count++;
      
      await env.RATE_LIMIT_KV.put(key, JSON.stringify(entry), { 
          expirationTtl: 120 // 2 minutes, auto-cleanup
      });
      
      return entry.count <= RATE_LIMIT.maxRequests;
  }
  ```
- [ ] Update all `checkRateLimit(ip)` calls to `await checkRateLimit(ip, env)`
- [ ] Remove in-memory `rateLimitStore` Map
- [ ] Deploy with KV binding configured
- [ ] Test rate limit persists across multiple requests

### Verification Steps

1. Deploy worker to Cloudflare: `cd infrastructure/cloudflare && wrangler deploy`
2. Test Finnhub validation:
   - Valid: `curl -X POST -d '{"symbol":"AAPL"}' .../api/finnhub/profile` → 200
   - Invalid: `curl -X POST -d '{"symbol":""}' .../api/finnhub/profile` → 400
3. Test feedback size limits: oversized message returns 400
4. Test CORS in production: `http://localhost:1420` origin rejected
5. Test rate limiting: verify limits persist across edge locations
6. Verify KV entries have TTL expiration (check after 2+ minutes)

---

## Fixes from lib_rs_review.md

> **Source**: `reviews/lib_rs_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 Medium severity

### Context

The `lib.rs` file (206 lines) is the main Tauri application library handling single-instance enforcement, Python sidecar spawning, and IPC command registration. This fix addresses a defense-in-depth security improvement for error dialog rendering on macOS.

### Phase 1: Escape AppleScript Strings in Error Dialogs

**Issue**: Error messages are interpolated directly into osascript commands without escaping. While error messages come from system libraries (not user input), malformed error messages containing quotes or AppleScript syntax could theoretically escape the string context. Defense-in-depth suggests escaping these strings.

**Location**: `src-tauri/src/lib.rs:75-80, 107-116`

**Current Code**:
```rust
let _ = Command::new("osascript")
    .args(["-e", &format!(
        "display dialog \"{}\" buttons {{\"OK\"}} default button \"OK\" with icon stop with title \"Portfolio Prism\"",
        msg  // Unescaped error message
    )])
    .output();
```

**Tasks**:
- [ ] Add `escape_applescript()` helper function in `src-tauri/src/lib.rs`:
  ```rust
  fn escape_applescript(s: &str) -> String {
      s.replace('\\', "\\\\").replace('"', "\\\"")
  }
  ```
- [ ] Update first osascript call (lock file error dialog, ~line 75-80) to use escaped message:
  ```rust
  let escaped_msg = escape_applescript(&format!(
      "Another instance of Portfolio Prism is already running.\n\n\
       Please close the other instance first."
  ));
  let _ = Command::new("osascript")
      .args(["-e", &format!(
          "display dialog \"{}\" buttons {{\"OK\"}} default button \"OK\" with icon stop with title \"Portfolio Prism\"",
          escaped_msg
      )])
      .output();
  ```
- [ ] Update second osascript call (sidecar spawn error dialog, ~line 107-116) to escape the error message:
  ```rust
  let escaped_msg = escape_applescript(&format!(
      "Failed to start the analysis engine:\n\n{}\n\n\
       Please reinstall the application or contact support.",
      error_description
  ));
  ```
- [ ] Add unit test verifying escape function handles edge cases:
  - Input: `Test "quoted" message` → Output: `Test \"quoted\" message`
  - Input: `Path: C:\Users\test` → Output: `Path: C:\\Users\\test`
- [ ] Manual verification: trigger error with message containing `" buttons {"Hack"}` → dialog displays literal string

### Verification Steps

1. Build application: `npm run tauri build`
2. Force lock file error (run two instances) → verify dialog appears correctly
3. Force sidecar error (rename binary) → verify error dialog escapes any special characters
4. Run `cargo test` in `src-tauri/` → new unit test passes

---

## Fixes from prism_headless_review.md

> **Source**: `reviews/prism_headless_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `prism_headless.py` entry point is well-structured with clear separation between the thin entry point and business logic. These fixes address a security default (host binding) and an observability gap (silent exception swallowing) that complicate debugging.

### Phase 1: Change Default Host Binding from 0.0.0.0 to 127.0.0.1

---

## Fixes from @reviews/processed/default_json_review.md

> **Source**: `reviews/default_json_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `default.json` capability file defines shell permissions for the Tauri main window. These fixes address defense-in-depth security improvements—explicitly scoping shell permissions to allowed sidecars and documenting CSP trade-offs between development and production builds.

### Phase 1: Add Explicit Sidecar Scoping to Shell Permissions

**Issue**: Shell permissions (`shell:allow-spawn`, `shell:allow-execute`) are granted without explicit scope constraints. While Tauri v2's sidecar system inherently restricts execution to bundled binaries, best practice is to use scoped permissions that explicitly enumerate allowed commands.

**Location**: `src-tauri/capabilities/default.json:8-15`

**Current Code**:
```json
{
  "permissions": [
    "core:default",
    "shell:default",
    "shell:allow-spawn",
    "shell:allow-execute",
    "shell:allow-kill",
    "shell:allow-stdin-write"
  ]
}
```

**Tasks**:
- [ ] Update `src-tauri/capabilities/default.json` to use scoped shell permissions:
  ```json
  {
    "permissions": [
      "core:default",
      "shell:default",
      {
        "identifier": "shell:allow-spawn",
        "allow": [
          { "sidecar": true, "name": "prism-headless" },
          { "sidecar": true, "name": "tr-daemon" }
        ]
      },
      {
        "identifier": "shell:allow-execute",
        "allow": [
          { "sidecar": true, "name": "prism-headless" },
          { "sidecar": true, "name": "tr-daemon" }
        ]
      },
      "shell:allow-kill",
      "shell:allow-stdin-write"
    ]
  }
  ```
- [ ] Verify sidecar names match those declared in `tauri.conf.json` under `bundle.externalBin`
- [ ] Test `prism-headless` sidecar spawns correctly: `npm run tauri dev`
- [ ] Verify attempting to spawn non-whitelisted commands fails
- [ ] Run analytics engine connection test to confirm IPC still works

**References**:
- [Tauri v2 Shell Plugin Scoping](https://tauri.app/plugin/shell/)
- [Tauri Capability Scopes](https://tauri.app/reference/config/#permissions)

### Phase 2: Document CSP Trade-offs for Production Builds

**Issue**: The CSP includes `'unsafe-inline'` and `'unsafe-eval'` in `script-src`, weakening XSS protections. While required for Vite's HMR during development, production builds should ideally use stricter CSP.

**Location**: `src-tauri/tauri.conf.json:22`

**Current Code**:
```json
"csp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; ..."
```

**Tasks**:
- [ ] Investigate Tauri v2's support for environment-specific CSP configuration (check Tauri docs for build-time CSP options)
- [ ] Test production build without `'unsafe-inline'` and `'unsafe-eval'` directives:
  ```json
  "script-src 'self'"
  ```
- [ ] If stricter CSP breaks production, document the specific functionality requiring `unsafe-*` directives
- [ ] Create tracking issue for future Tauri version upgrade if build-time CSP is not currently supported
- [ ] Add CSP documentation explaining dev vs. prod trade-offs in `docs/security/CSP.md`:
  - Why `unsafe-inline` is needed for Vite HMR during development
  - Why `unsafe-eval` is needed (if applicable, document reason)
  - Recommendation for production hardening when Tauri supports environment-specific config
- [ ] Update capability description to document security rationale:
  ```json
  {
    "description": "Main window capability for Portfolio Prism. Shell permissions enable Python analytics sidecar (prism-headless) and Trade Republic daemon (tr-daemon) communication. stdin-write enables IPC command sending. kill enables clean process shutdown."
  }
  ```

### Verification Steps

1. Run `npm run tauri dev` → confirm analytics engine connects successfully
2. Build production app: `npm run tauri build`
3. Test all app functionality works with scoped permissions
4. Attempt to spawn unauthorized binary in dev mode → confirm blocked
5. Check browser console (Cmd+Option+I in app) for CSP violation errors

**Issue**: The `--host` argument defaults to `0.0.0.0`, binding to all network interfaces. If accidentally run in production or on a shared network, this could expose the development HTTP server to unauthorized access.

**Location**: `src-tauri/python/prism_headless.py:60`

**Current Code**:
```python
parser.add_argument("--host", type=str, default="0.0.0.0", help="HTTP server port")
```

**Tasks**:
- [ ] Update `--host` default value from `"0.0.0.0"` to `"127.0.0.1"` in `prism_headless.py:60`
- [ ] Fix help text from `"HTTP server port"` to `"HTTP server host"` (typo noted in review)
- [ ] Updated line should be:
  ```python
  parser.add_argument("--host", type=str, default="127.0.0.1", help="HTTP server host (use 0.0.0.0 for network access)")
  ```
- [ ] Verify development workflow still works with localhost binding
- [ ] Document explicit `--host 0.0.0.0` for cases where network access is needed (e.g., in `docs/` or inline comment)

### Phase 2: Add Logging for Silent Exception Handling

**Issue**: When `certifi` is not available in a PyInstaller bundle, the ImportError is caught and silently ignored with a bare `pass`. This could lead to SSL certificate verification failures later that would be difficult to debug.

**Location**: `src-tauri/python/prism_headless.py:24-25`

**Current Code**:
```python
try:
    import certifi

    os.environ["SSL_CERT_FILE"] = certifi.where()
    os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
except ImportError:
    pass
```

**Tasks**:
- [ ] Update exception handler to log informational message to stderr:
  ```python
  except ImportError:
      # certifi not bundled - will use system certificates
      # This is expected in some deployment configurations
      print("  PRISM INFO: certifi not available, using system SSL certificates", file=sys.stderr)
  ```
- [ ] Build PyInstaller bundle without certifi → verify warning is printed to stderr
- [ ] Confirm HTTPS requests still work with system certificates

### Verification Steps

1. Run `python prism_headless.py --help` → verify `--host` help text says "HTTP server host"
2. Run `python prism_headless.py --http` → verify binds to `127.0.0.1:5001` by default
3. Run `python prism_headless.py --http --host 0.0.0.0` → verify binds to all interfaces when explicitly requested
4. Build PyInstaller bundle without certifi → verify info message printed to stderr
5. Verify existing tests pass: `pytest src-tauri/python/tests/`

---

## Fixes from wrangler_toml_review.md

> **Source**: `reviews/wrangler_toml_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `wrangler.toml` configuration for the Cloudflare Worker proxy follows good security practices for secret management. These fixes address production hardening concerns—observability settings that may log sensitive data and rate limiting that resets on worker restarts.

### Phase 1: Harden Observability Settings for Production

**Issue**: Invocation logs enabled with `persist = true` could capture sensitive API responses (e.g., user portfolio data from Finnhub, GitHub issue contents with user feedback). The current configuration logs 100% of requests.

**Location**: `infrastructure/cloudflare/wrangler.toml:18-22`

**Current Code**:
```toml
[observability.logs]
enabled = true
head_sampling_rate = 1
persist = true
invocation_logs = true
```

**Tasks**:
- [ ] Add environment-specific observability configuration for production vs. development:
  ```toml
  # Default (production) - conservative logging
  [observability.logs]
  enabled = true
  head_sampling_rate = 0.1  # Sample 10% of requests
  persist = true
  invocation_logs = false   # Disable invocation details in production

  # Development environment - full debugging
  [env.development.observability.logs]
  enabled = true
  head_sampling_rate = 1    # Log all requests
  persist = true
  invocation_logs = true    # Full invocation details for debugging
  ```
- [ ] Reduce trace sampling in production:
  ```toml
  [observability.traces]
  enabled = true
  persist = true
  head_sampling_rate = 0.1  # Sample 10% of traces
  
  [env.development.observability.traces]
  enabled = true
  persist = true
  head_sampling_rate = 1    # Full tracing in development
  ```
- [ ] Document environment deployment in `infrastructure/cloudflare/README.md`:
  - Production: `wrangler deploy` (default)
  - Development: `wrangler deploy --env development`
- [ ] Review Cloudflare dashboard logs for any existing PII exposure
- [ ] Verify compliance with data retention policies (GDPR, etc.)

### Phase 2: Enable KV-Based Persistent Rate Limiting

**Issue**: Rate limiting uses in-memory storage which resets on worker restarts and is not shared across Cloudflare edge instances. Determined attackers could exhaust API quota by triggering worker recycling. Deployments also reset rate limits.

**Location**: `infrastructure/cloudflare/wrangler.toml:29-35`

**Current Code**:
```toml
# Rate limiting can be enhanced with Cloudflare's Rate Limiting product
# For now, we use in-memory limiting (resets on worker restart)

# KV namespace for persistent rate limiting (optional)
# [[kv_namespaces]]
# binding = "RATE_LIMIT_KV"
# id = "your-kv-namespace-id"
```

**Tasks**:
- [ ] Create KV namespace via Wrangler CLI:
  ```bash
  cd infrastructure/cloudflare
  wrangler kv:namespace create "RATE_LIMIT_KV"
  ```
- [ ] Copy the generated namespace ID from the CLI output
- [ ] Uncomment and update KV binding in `wrangler.toml`:
  ```toml
  [[kv_namespaces]]
  binding = "RATE_LIMIT_KV"
  id = "<paste-namespace-id-here>"
  ```
- [ ] Update `worker.js` to use KV for rate limit storage (coordinate with `worker_review.md` fixes—Phase 4 in that spec):
  ```javascript
  async function checkRateLimit(ip, env) {
      const now = Date.now();
      const key = `ratelimit:${ip}`;
      
      const stored = await env.RATE_LIMIT_KV.get(key, 'json');
      const windowStart = now - RATE_LIMIT.windowMs;
      
      let entry = stored && stored.windowStart > windowStart 
          ? stored 
          : { windowStart: now, count: 0 };
      entry.count++;
      
      await env.RATE_LIMIT_KV.put(key, JSON.stringify(entry), { 
          expirationTtl: 120 // 2 minutes, auto-cleanup
      });
      
      return entry.count <= RATE_LIMIT.maxRequests;
  }
  ```
- [ ] Remove in-memory `rateLimitStore` Map from `worker.js`
- [ ] Deploy and test rate limiting persists across multiple requests
- [ ] Document KV namespace in `infrastructure/cloudflare/README.md`

### Verification Steps

1. Deploy development environment: `wrangler deploy --env development` → full logging enabled
2. Deploy production: `wrangler deploy` → reduced sampling (10%)
3. Check Cloudflare dashboard → production logs show sampled subset, not 100%
4. Test rate limiting:
   - Make 10 rapid requests → hit rate limit
   - Wait for worker recycle (or redeploy) → verify limit still applies
5. Verify KV entries in Cloudflare dashboard → entries have TTL expiration

---

## Fixes from LoginForm_review.md

> **Source**: `reviews/LoginForm_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 High, 2 Medium severity

### Context

The `LoginForm.tsx` component (320 lines) handles Trade Republic authentication with phone number and PIN entry. The component itself is well-implemented with good input validation and error handling. However, the underlying IPC layer logs credentials on error, and frontend validation is too restrictive for international users.

**Note**: The HIGH severity credential logging issue is in `ipc.ts`, not `LoginForm.tsx` itself. This overlaps with fixes specified in `ipc_ts_review.md` (Phase 1: Scrub Credentials Before Error Logging). Coordinate implementation to avoid duplication.

### Phase 1: Sanitize Credentials in IPC Error Logging (HIGH)

**Issue**: The `callCommand` function in `ipc.ts` logs the entire payload to backend system logs when an error occurs. For `tr_login` commands, this payload contains `{ phone, pin, remember }` — meaning plaintext credentials could be persisted to SQLite logs.

**Location**: `src/lib/ipc.ts:68-72`

**Current Code**:
```typescript
logEvent('ERROR', `Backend Error: ${errorMsg}`, { 
  command, 
  code: errorCode,
  payload  // <-- Contains { phone, pin, remember } for tr_login!
}, 'pipeline', 'api_error');
```

**Tasks**:
- [ ] Add `sanitizePayload()` helper to `src/lib/ipc.ts`:
  ```typescript
  function sanitizePayload(command: string, payload: Record<string, unknown>): Record<string, unknown> {
    const sensitiveCommands = ['tr_login', 'tr_submit_2fa', 'tr_get_stored_credentials'];
    if (sensitiveCommands.includes(command)) {
      const { pin, phone, code, ...safe } = payload as any;
      return {
        ...safe,
        phone: phone ? `${String(phone).slice(0, 6)}***` : undefined,
        pin: pin ? '****' : undefined,
        code: code ? '****' : undefined,
      };
    }
    return payload;
  }
  ```
- [ ] Update `logEvent` call in `callCommand` to use `sanitizePayload(command, payload)` instead of raw `payload`
- [ ] Add unit test: fail `tr_login` with wrong credentials, verify logged payload contains masked values
- [ ] Manual verification: check `system_logs` table after failed login → PIN/phone masked or absent

**Related**: Coordinate with `ipc_ts_review.md` Phase 1 to avoid duplicate implementation.

### Phase 2: Expand Phone Validation for Trade Republic Markets (MEDIUM)

**Issue**: Phone validation regex is hard-coded to only accept German phone numbers (`+49`). Trade Republic operates in multiple EU countries (Austria, France, Netherlands, Spain, Italy). Users in other markets will see validation errors despite having valid phone numbers.

**Location**: `src/components/auth/LoginForm.tsx:151-154`

**Current Code**:
```typescript
const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^\+49\d{9,15}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};
```

**Tasks**:
- [ ] Update `validatePhone` function to accept all Trade Republic markets:
  ```typescript
  const validatePhone = (phone: string): boolean => {
    // Trade Republic markets: DE (+49), AT (+43), FR (+33), NL (+31), ES (+34), IT (+39)
    const e164Regex = /^\+(?:49|43|33|31|34|39)\d{7,15}$/;
    return e164Regex.test(phone.replace(/\s/g, ''));
  };
  ```
- [ ] Update `formatPhone` function to handle non-German country codes:
  ```typescript
  const formatPhone = (value: string): string => {
    let cleaned = value.replace(/[^\d+]/g, '');
    
    // If starts with 0, assume German and convert to +49
    if (cleaned.startsWith('0') && !cleaned.startsWith('00')) {
      cleaned = '+49' + cleaned.slice(1);
    }
    
    // If no country code, default to +49 for backwards compatibility
    if (!cleaned.startsWith('+')) {
      cleaned = '+49' + cleaned;
    }
    
    return cleaned;
  };
  ```
- [ ] Update unit tests in `LoginForm.test.tsx`:
  - [ ] Add test: Austrian number `+436641234567` is accepted
  - [ ] Add test: French number `+33612345678` is accepted
  - [ ] Add test: Invalid country code `+1234567890` is rejected
- [ ] Verify backend validation still works (Trade Republic will reject truly invalid numbers)

### Phase 3: Add PIN State Timeout for Security (MEDIUM)

**Issue**: PIN is stored in React component state (`useState`) and remains in memory for the lifetime of the component. If the user leaves the form open without submitting, the PIN could be accessed via React DevTools or memory inspection tools.

**Location**: `src/components/auth/LoginForm.tsx:122`

**Current Code**:
```typescript
const [pin, setPin] = useState('');
```

**Tasks**:
- [ ] Add cleanup effect to clear PIN on component unmount:
  ```typescript
  useEffect(() => {
    return () => {
      // Clear PIN from memory on unmount
      setPin('');
    };
  }, []);
  ```
- [ ] Add inactivity timeout to clear PIN after 5 minutes:
  ```typescript
  useEffect(() => {
    if (pin.length === 4) {
      const timeout = setTimeout(() => {
        setPin('');
        setError('PIN cleared for security. Please re-enter.');
      }, 5 * 60 * 1000); // 5 minutes
      return () => clearTimeout(timeout);
    }
  }, [pin]);
  ```
- [ ] Add unit test: verify PIN cleared after unmount (mock timer, trigger cleanup)
- [ ] Consider: also clear phone number after extended inactivity (lower priority)

### Verification Steps

1. Run `npm test src/components/auth/LoginForm` → all tests pass
2. Run `npm test src/lib/ipc` → credential masking tests pass
3. Test login error path:
   - Enter wrong PIN and submit
   - Query SQLite: `SELECT * FROM system_logs WHERE message LIKE '%tr_login%'`
   - Verify PIN shows as `****` and phone is partially masked
4. Test international phone numbers:
   - Enter `+436641234567` (Austria) → accepted by frontend validation
   - Enter `+33612345678` (France) → accepted by frontend validation
5. Test PIN timeout:
   - Fill in PIN, wait 5 minutes without submitting
   - Verify PIN field is cleared and user notification shown
6. Check React DevTools during 2FA wait → confirm no PIN in state after submission

---

## Fixes from tr_bridge_review.md

> **Source**: `reviews/tr_bridge_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `tr_bridge.py` module manages subprocess communication between the Tauri app and the Trade Republic daemon. These fixes address credential handling documentation and response ID validation—both are defense-in-depth improvements that prevent protocol desync and clarify security posture.

### Phase 1: Document Credential Transmission Security Model

**Issue**: Credentials (phone, PIN) are transmitted as plaintext JSON via stdin pipe to daemon subprocess. While acceptable for a desktop app where both processes run under the same user, this should be documented for security clarity.

**Location**: `src-tauri/python/portfolio_src/core/tr_bridge.py:245-247`

**Current Code**:
```python
def login(self, phone: str, pin: str, **kwargs) -> Dict[str, Any]:
    """Initiate login process."""
    return self._send_command(TRMethod.LOGIN.value, phone=phone, pin=pin, **kwargs)
```

**Tasks**:
- [ ] Update `login()` docstring to document security model:
  ```python
  def login(self, phone: str, pin: str, **kwargs) -> Dict[str, Any]:
      """
      Initiate login process.
      
      Security Note: Credentials are sent via stdin pipe to daemon subprocess.
      This is acceptable as both processes run under the same user context
      and stdin is not externally accessible. No network transmission occurs.
      """
      return self._send_command(TRMethod.LOGIN.value, phone=phone, pin=pin, **kwargs)
  ```
- [ ] Verify no debug logging of request params exists in `_send_command()` or serialization
- [ ] Add code comment at `_send_command()` confirming params are not logged:
  ```python
  # SECURITY: params may contain credentials - never log or persist
  ```
- [ ] Grep for any `logger.debug` calls that might output credentials: `grep -rn "logger.*phone\|logger.*pin" src-tauri/python/`

### Phase 2: Add Response ID Validation

**Issue**: Response ID is captured but never validated against request ID. If daemon sends out-of-order or stale response, it would be processed incorrectly. The `_command_lock` mitigates concurrent requests, but this adds defense-in-depth.

**Location**: `src-tauri/python/portfolio_src/core/tr_bridge.py:226-236`

**Current Code**:
```python
# Parse response
response_data = json.loads(response_line.strip())
response = TRResponse(
    result=response_data.get("result"),
    error=response_data.get("error"),
    id=response_data.get("id"),  # Captured but never verified
)

if response.error:
    raise RuntimeError(f"Daemon error: {response.error}")

return response.result or {}  # ID match not checked
```

**Tasks**:
- [ ] Add ID validation after parsing response in `_send_command()`:
  ```python
  # Parse response
  response_data = json.loads(response_line.strip())
  response = TRResponse(
      result=response_data.get("result"),
      error=response_data.get("error"),
      id=response_data.get("id"),
  )

  # Validate response matches request
  if response.id != request_id:
      logger.error(
          f"Response ID mismatch: expected {request_id}, got {response.id}"
      )
      raise RuntimeError(
          f"Protocol desync: response ID mismatch. Resetting daemon."
      )
      
  if response.error:
      raise RuntimeError(f"Daemon error: {response.error}")

  return response.result or {}
  ```
- [ ] Add unit test that simulates ID mismatch scenario → verify `RuntimeError` raised
- [ ] Verify daemon correctly echoes request ID in all responses (check daemon implementation)
- [ ] Test with normal login flow → verify ID validation passes silently

### Verification Steps

1. Run `pytest src-tauri/python/tests/ -k tr_bridge` → all tests pass
2. Verify `login()` docstring includes security note: `grep -A5 "def login" src-tauri/python/portfolio_src/core/tr_bridge.py`
3. Grep for credential logging: `grep -rn "logger.*phone\|logger.*pin" src-tauri/python/` → no matches
4. Test ID mismatch: mock daemon response with wrong ID → confirm `RuntimeError` raised
5. Test normal login flow: `npm run tauri dev` → TR Login → verify no regressions

---

## Fixes from tr_sync_review.md

> **Source**: `reviews/tr_sync_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `TRDataFetcher` class in `tr_sync.py` fetches portfolio data from Trade Republic via the daemon and optionally saves to CSV. The code is well-structured with appropriate error handling. These fixes address manual CSV escaping (should use stdlib) and lack of dedicated unit tests.

### Phase 1: Replace Manual CSV Escaping with stdlib csv Module

**Issue**: Custom CSV escaping logic may fail on complex inputs (embedded newlines, BOM, etc.). Python's stdlib `csv` module is battle-tested and handles many more edge cases.

**Location**: `src-tauri/python/portfolio_src/data/tr_sync.py:126-128`

**Current Code**:
```python
# Escape name for CSV
name = pos["name"].replace('"', '""')
if "," in name or '"' in name:
    name = f'"{name}"'

f.write(
    f"{pos['isin']},{pos['quantity']:.6f},{pos['avg_cost']:.4f},"
    f"{pos['current_price']:.4f},{pos['net_value']:.2f},{name}\n"
)
```

**Tasks**:
- [ ] Add `import csv` at top of `tr_sync.py` if not already present
- [ ] Refactor `save_to_csv()` method to use `csv.writer`:
  ```python
  def save_to_csv(self, positions: List[Dict], output_path: Path) -> int:
      output_path.parent.mkdir(parents=True, exist_ok=True)
      
      with open(output_path, "w", encoding="utf-8", newline="") as f:
          writer = csv.writer(f)
          writer.writerow(["ISIN", "Quantity", "AvgCost", "CurrentPrice", "NetValue", "TR_Name"])
          for pos in positions:
              writer.writerow([
                  pos["isin"],
                  f"{pos['quantity']:.6f}",
                  f"{pos['avg_cost']:.4f}",
                  f"{pos['current_price']:.4f}",
                  f"{pos['net_value']:.2f}",
                  pos["name"],
              ])
      
      logger.info(f"Saved {len(positions)} positions to {output_path}")
      return len(positions)
  ```
- [ ] Remove manual escaping logic for `name` field
- [ ] Test with instrument names containing: `"Company, Inc."`, `"O'Reilly"`, `"Line1\nLine2"`
- [ ] Verify CSV opens correctly in Excel/Numbers
- [ ] Verify existing integration tests pass

### Phase 2: Add Unit Tests for TRDataFetcher

**Issue**: `TRDataFetcher` is only tested via mocks in integration tests but has no dedicated unit tests that verify its actual logic (position transformation, malformed handling, empty portfolio, CSV generation).

**Location**: `src-tauri/python/portfolio_src/data/tr_sync.py` (no test file exists)

**Tasks**:
- [ ] Create `src-tauri/python/tests/data/test_tr_sync.py`
- [ ] Add test: `test_fetch_portfolio_success` - verify position transformation (string to float conversion)
- [ ] Add test: `test_fetch_portfolio_skips_malformed` - verify malformed positions are skipped
- [ ] Add test: `test_fetch_portfolio_empty` - verify empty portfolio handling
- [ ] Add test: `test_save_to_csv` - verify CSV generation with edge case names

**Test Template**:
```python
import pytest
from pathlib import Path
from unittest.mock import Mock

from portfolio_src.data.tr_sync import TRDataFetcher


class TestTRDataFetcher:
    @pytest.fixture
    def mock_bridge(self):
        return Mock()

    def test_fetch_portfolio_success(self, mock_bridge):
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {
                        "instrumentId": "DE0007236101",
                        "name": "Siemens AG",
                        "netSize": "10.5",
                        "averageBuyIn": "120.50",
                        "netValue": 1300.25,
                    }
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        
        assert len(positions) == 1
        assert positions[0]["isin"] == "DE0007236101"
        assert positions[0]["quantity"] == 10.5
        assert positions[0]["avg_cost"] == 120.50

    def test_fetch_portfolio_skips_malformed(self, mock_bridge):
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {
                "positions": [
                    {"instrumentId": "VALID123456", "netSize": "10", "averageBuyIn": "100", "netValue": 1000},
                    {"netSize": "invalid"},  # Missing instrumentId
                ]
            },
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        
        assert len(positions) == 1  # Malformed position skipped

    def test_fetch_portfolio_empty(self, mock_bridge):
        mock_bridge.fetch_portfolio.return_value = {
            "status": "success",
            "data": {"positions": [], "cash": [{"amount": 100}]},
        }
        fetcher = TRDataFetcher(mock_bridge)
        positions = fetcher.fetch_portfolio_sync()
        
        assert positions == []

    def test_save_to_csv(self, mock_bridge, tmp_path):
        fetcher = TRDataFetcher(mock_bridge)
        positions = [
            {"isin": "US123", "name": "Test, Inc.", "quantity": 10.0, "avg_cost": 50.0, "current_price": 55.0, "net_value": 550.0}
        ]
        output_path = tmp_path / "output.csv"
        
        count = fetcher.save_to_csv(positions, output_path)
        
        assert count == 1
        content = output_path.read_text()
        assert "ISIN,Quantity" in content
        assert "US123" in content
```

- [ ] Run tests: `pytest src-tauri/python/tests/data/test_tr_sync.py -v`
- [ ] Verify coverage of edge cases

### Verification Steps

1. Run `pytest src-tauri/python/tests/data/test_tr_sync.py -v` → all tests pass
2. Test CSV generation with special characters: names containing commas, quotes, newlines
3. Verify CSV opens correctly in spreadsheet application (Excel/Numbers)
4. Existing integration tests pass: `pytest src-tauri/python/tests/ -k tr`

---

## Fixes from default_json_review.md

> **Source**: `reviews/default_json_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `default.json` Tauri capability file defines permissions for the main window. These fixes address defense-in-depth security improvements—explicit sidecar scoping and CSP hardening for production builds.

### Phase 1: Add Explicit Sidecar Scoping to Shell Permissions

**Issue**: Shell permissions (`shell:allow-spawn`, `shell:allow-execute`) are granted without explicit scoping to specific sidecars. While Tauri v2's sidecar system inherently restricts execution to bundled binaries declared in `tauri.conf.json`, explicit scoping provides defense-in-depth and clearer security intent.

**Location**: `src-tauri/capabilities/default.json:8-15`

**Current Code**:
```json
{
  "permissions": [
    "core:default",
    "shell:default",
    "shell:allow-spawn",
    "shell:allow-execute",
    "shell:allow-kill",
    "shell:allow-stdin-write"
  ]
}
```

**Tasks**:
- [ ] Update `src-tauri/capabilities/default.json` to use scoped permissions:
  ```json
  {
    "permissions": [
      "core:default",
      "shell:default",
      {
        "identifier": "shell:allow-spawn",
        "allow": [
          { "sidecar": true, "name": "prism-headless" },
          { "sidecar": true, "name": "tr-daemon" }
        ]
      },
      {
        "identifier": "shell:allow-execute",
        "allow": [
          { "sidecar": true, "name": "prism-headless" },
          { "sidecar": true, "name": "tr-daemon" }
        ]
      },
      "shell:allow-kill",
      "shell:allow-stdin-write"
    ]
  }
  ```
- [ ] Verify sidecar names match those declared in `src-tauri/tauri.conf.json` (check `bundle.externalBin` array)
- [ ] Test that `prism-headless` sidecar still spawns correctly: `npm run tauri dev`
- [ ] Verify analytics engine connects and responds to IPC commands
- [ ] Attempt to spawn non-whitelisted command programmatically → verify it fails

### Phase 2: Harden CSP for Production Builds

**Issue**: The CSP includes `'unsafe-inline'` and `'unsafe-eval'` in `script-src`, weakening XSS protection. While needed for Vite HMR during development, production builds should use stricter policies.

**Location**: `src-tauri/tauri.conf.json:22`

**Current Code**:
```json
"csp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; ..."
```

**Tasks**:
- [ ] Investigate Tauri v2 build-time CSP configuration options (check Tauri docs for environment-specific CSP)
- [ ] Test production build without `'unsafe-inline'` and `'unsafe-eval'`:
  ```bash
  npm run tauri build
  ```
  Then modify CSP in `tauri.conf.json` to:
  ```json
  "script-src 'self'"
  ```
- [ ] If stricter CSP breaks production functionality, document the specific requirement
- [ ] If build-time CSP differentiation is not possible in Tauri v2, create tracking issue for future investigation
- [ ] Add CSP rationale documentation in `docs/security/CSP.md` or inline comment explaining dev vs prod trade-offs

### Verification Steps

1. Build application: `npm run tauri build`
2. Test sidecar spawning: verify analytics engine starts correctly with scoped permissions
3. Attempt to spawn unauthorized binary → confirm permission denied
4. Check browser console (Cmd+Option+I in app) for CSP violation errors
5. Verify all app features work with updated configuration

---

## Fixes from useAppStore_review.md

> **Source**: `reviews/useAppStore_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `useAppStore.ts` Zustand store is well-structured with proper separation of state and actions. These fixes address timer cleanup issues for notification and toast auto-dismiss that could cause memory leaks and stale callbacks.

### Phase 1: Timer Cleanup for Notification Auto-Dismiss

**Issue**: Timeout timers for notification auto-dismiss are created but never tracked. If a notification is manually dismissed before the timeout fires, the callback still executes. This could cause unnecessary state updates and memory leaks if notifications are added/dismissed frequently.

**Location**: `src/store/useAppStore.ts:197-202`

**Current Code**:
```typescript
// Auto-dismiss if duration is set
if (notification.duration) {
  setTimeout(() => {
    get().dismissNotification(id);
  }, notification.duration);
}
```

**Tasks**:
- [ ] Update `addNotification` to check if notification still exists before dismissing:
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
- [ ] Test: add notification with 3s duration, manually dismiss before 3s, verify no errors after 3s
- [ ] Test: add many notifications rapidly, dismiss all, verify no memory growth

### Phase 2: Timer Cleanup for Toast Auto-Dismiss

**Issue**: Same pattern as notifications—toasts with duration create untracked timeouts. If toast is manually dismissed, stale callback still executes.

**Location**: `src/store/useAppStore.ts:280-285`

**Current Code**:
```typescript
// Auto-dismiss after duration
if (duration > 0) {
  setTimeout(() => {
    get().dismissToast(id);
  }, duration);
}
```

**Tasks**:
- [ ] Update `addToast` to check if toast still exists before dismissing:
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
- [ ] Test: add toast with 2s duration, manually dismiss before 2s, verify no errors after timeout fires

### Verification Steps

1. Run `npm test src/store/useAppStore` → all tests pass
2. Add notification with 3s duration, manually dismiss → no console errors after 3s
3. Add toast with 2s duration, manually dismiss → no state updates after 2s
4. Stress test: rapidly add/dismiss 50 notifications → verify no memory growth in DevTools

---

## Fixes from python_engine_review.md

> **Source**: `reviews/python_engine_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `python_engine.rs` file (193 lines) is the Python Engine IPC Manager that handles communication with the Python headless sidecar process via stdin/stdout JSON protocol. These fixes address a potential race condition in request cleanup and missing input validation—both are defense-in-depth improvements for correctness and security.

### Phase 1: Document Race Condition Safety Invariants

**Issue**: Multiple async operations on `pending` HashMap acquire the lock separately. While this is safe in practice due to sequential command IDs, the safety invariant should be documented to prevent future regressions.

**Location**: `src-tauri/src/python_engine.rs:112-115, 130-131, 143-148`

**Current Code**:
```rust
// Insert with lock
{
    let mut pending = self.pending.lock().await;
    pending.insert(id, tx);
}  // Lock released here

// ... write to child ...

// Remove with new lock acquisition
self.pending.lock().await.remove(&id);
```

**Tasks**:
- [ ] Add safety documentation above `send_command` function in `src-tauri/src/python_engine.rs`:
  ```rust
  /// # Safety Invariants
  /// 
  /// Command IDs are monotonically increasing via `AtomicU64::fetch_add`.
  /// Only one task ever operates on a given ID, so racing is not possible.
  /// The pending HashMap is only accessed to:
  /// 1. Insert when sending (line 113-115)
  /// 2. Remove on write failure (line 131)
  /// 3. Remove on timeout/channel closed (lines 143-148)
  /// 4. Remove on response received (handle_response)
  /// 
  /// Since each ID is unique and owned by a single task, no races can occur.
  ```
- [ ] Update timeout/channel closed error handling to use `let _` pattern for clarity:
  ```rust
  Ok(Err(_)) => {
      // Channel sender was dropped - might be normal shutdown
      let _ = self.pending.lock().await.remove(&id);
      Err("Response channel closed".to_string())
  }
  Err(_) => {
      let _ = self.pending.lock().await.remove(&id);
      Err(format!("Command timed out after {} seconds", COMMAND_TIMEOUT_SECS))
  }
  ```
- [ ] Add stress test: send 100 concurrent commands, verify no pending requests leak
- [ ] Verify HashMap size is 0 after all commands complete

### Phase 2: Add Command Name and Payload Validation

**Issue**: Command strings and JSON payloads are passed through without validation. Defense-in-depth suggests validating inputs before transmission to Python sidecar.

**Location**: `src-tauri/src/python_engine.rs:94-123`

**Current Code**:
```rust
pub async fn send_command(
    &self,
    command: &str,  // No validation
    payload: Value,  // No size limit
) -> Result<EngineResponse, String> {
    // ... directly used without checks ...
    let cmd = json!({
        "id": id,
        "command": command,
        "payload": payload
    });
```

**Tasks**:
- [ ] Add validation constants at top of `python_engine.rs`:
  ```rust
  /// Maximum payload size in bytes (10MB)
  const MAX_PAYLOAD_SIZE: usize = 10 * 1024 * 1024;
  /// Maximum command name length
  const MAX_COMMAND_LENGTH: usize = 64;
  ```
- [ ] Add command name validation at start of `send_command`:
  ```rust
  // Validate command name
  if command.is_empty() || command.len() > MAX_COMMAND_LENGTH {
      return Err(format!(
          "Invalid command name length: {} (expected 1-{})",
          command.len(),
          MAX_COMMAND_LENGTH
      ));
  }
  if !command.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
      return Err("Command name must contain only lowercase letters, digits, and underscores".to_string());
  }
  if !command.chars().next().map(|c| c.is_ascii_lowercase()).unwrap_or(false) {
      return Err("Command name must start with lowercase letter".to_string());
  }
  ```
- [ ] Add payload size validation:
  ```rust
  // Validate payload size
  let payload_str = serde_json::to_string(&payload)
      .map_err(|e| format!("Failed to serialize payload: {}", e))?;
  if payload_str.len() > MAX_PAYLOAD_SIZE {
      return Err(format!(
          "Payload too large: {} bytes (max {})",
          payload_str.len(),
          MAX_PAYLOAD_SIZE
      ));
  }
  ```
- [ ] Test with empty command name → should return error
- [ ] Test with special characters in command (`get-data`, `GET_DATA`) → should return error
- [ ] Test with 100MB payload → should return error before transmission
- [ ] Verify existing commands still work (`sync_portfolio`, `get_dashboard`, etc.)

### Verification Steps

1. Build application: `cargo build` in `src-tauri/`
2. Run `npm run tauri dev` → verify existing IPC commands work
3. Add unit test for command validation edge cases:
   - Empty command name → error
   - Command with uppercase → error
   - Command with hyphen → error
   - Valid command `sync_portfolio` → accepted
4. Add unit test for payload size limit:
   - 100MB payload → error
   - 1KB payload → accepted
5. Stress test: concurrent commands → verify no race condition symptoms (leaked pending requests, wrong responses)

---

## Fixes from tr_auth_handlers_review.md

> **Source**: `reviews/tr_auth_handlers_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 High, 1 Medium severity

### Context

The `tr_auth.py` handler module manages Trade Republic authentication flow including login, 2FA verification, and credential retrieval. These fixes address credential exposure via IPC and path traversal vulnerabilities—both are security issues critical to the project's "privacy-first" philosophy.

### Phase 1: Stop Returning Plaintext Credentials via IPC (HIGH)

**Issue**: `handle_tr_get_stored_credentials` returns full phone number and PIN to the frontend for form pre-fill. This exposes credentials to any code running in the WebView context; an XSS vulnerability or malicious plugin could exfiltrate them.

**Location**: `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py:139-145`

**Current Code**:
```python
if phone and pin:
    masked = f"***{phone[-4:]}" if len(phone) > 4 else "****"
    logger.info(f"Returning stored credentials for phone ending {masked}")
    return success_response(
        cmd_id,
        {
            "hasCredentials": True,
            "phone": phone,        # Full phone number exposed
            "pin": pin,            # Full PIN exposed
        },
    )
```

**Tasks**:
- [ ] Update `handle_tr_get_stored_credentials` to return only existence flag and masked phone:
  ```python
  return success_response(
      cmd_id,
      {
          "hasCredentials": True,
          "maskedPhone": masked,  # Display only
          # Do NOT return phone or pin
      },
  )
  ```
- [ ] Update frontend `TradeRepublicView.tsx` or `LoginForm.tsx` to remove pre-fill logic that depends on raw credentials
- [ ] Update `handle_tr_login` to accept a `useStoredCredentials: true` flag that triggers backend-side credential retrieval:
  ```python
  if payload.get("useStoredCredentials"):
      phone, pin = auth_manager.get_stored_credentials()
  else:
      phone = payload.get("phone", "")
      pin = payload.get("pin", "")
  ```
- [ ] Update frontend login flow to send `{ useStoredCredentials: true }` when user has stored credentials
- [ ] Test: Open React DevTools during login → verify no phone/pin visible in IPC responses
- [ ] Test: Attempt login with stored credentials → verify flow still works

### Phase 2: Validate Session Cookie File Path (MEDIUM)

**Issue**: `PRISM_DATA_DIR` environment variable is used to construct the cookie file path without path traversal validation. An attacker controlling env vars could write cookies to arbitrary locations.

**Location**: `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py:76-80`

**Current Code**:
```python
data_dir = os.environ.get(
    "PRISM_DATA_DIR",
    os.path.expanduser("~/Library/Application Support/PortfolioPrism"),
)
cookies_file = os.path.join(data_dir, "tr_cookies.txt")
```

**Tasks**:
- [ ] Refactor to use `pathlib.Path` and add validation:
  ```python
  from pathlib import Path

  default_dir = Path.home() / "Library" / "Application Support" / "PortfolioPrism"
  data_dir = Path(os.environ.get("PRISM_DATA_DIR", str(default_dir)))

  # Ensure path is absolute (reject relative paths that could escape)
  if not data_dir.is_absolute():
      logger.warning(f"Rejecting relative PRISM_DATA_DIR: {data_dir}")
      data_dir = default_dir

  cookies_file = data_dir / "tr_cookies.txt"

  # Validate resolved path doesn't escape via symlinks or traversal
  try:
      resolved = cookies_file.resolve()
      resolved.relative_to(data_dir.resolve())
  except ValueError:
      logger.error("Invalid cookie file path - potential path traversal")
      cookies_file = default_dir / "tr_cookies.txt"
  ```
- [ ] Add unit test: `PRISM_DATA_DIR=../../tmp` → verify path traversal is blocked, fallback to default
- [ ] Add unit test: `PRISM_DATA_DIR=/tmp/symlink_to_etc` → verify symlink attack is blocked
- [ ] Verify normal operation with default `PRISM_DATA_DIR` unchanged

### Verification Steps

1. Run `npm run tauri dev` → complete TR login flow → verify authentication works
2. Check IPC traffic in DevTools Network tab → confirm no plaintext phone/PIN in `get_stored_credentials` response
3. Test with `PRISM_DATA_DIR=../../tmp python -c "..."` → verify path traversal blocked
4. Run existing auth tests: `pytest src-tauri/python/tests/ -k tr_auth`
5. Verify cookies are written to correct location: `ls ~/Library/Application\ Support/PortfolioPrism/tr_cookies.txt`

---

## Fixes from TradeRepublicView_review.md

> **Source**: `reviews/TradeRepublicView_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `TradeRepublicView.tsx` component (601 lines) manages Trade Republic authentication, session restoration, and portfolio syncing. The component correctly delegates credential handling to child components and properly memoizes callbacks. These fixes address credential lifecycle management and error message sanitization—both are defense-in-depth security improvements.

### Phase 1: Add Credential Cleanup on Component Unmount

**Issue**: Phone and PIN credentials are stored in React state via `loginCredentials` during 2FA flow. While credentials are cleared on 2FA success (line 251), they persist if the component unmounts before completion (e.g., user navigates away during 2FA). This extends the window where credentials exist in memory.

**Location**: `src/components/views/TradeRepublicView.tsx:205, 241-245`

**Current Code**:
```typescript
const [loginCredentials, setLoginCredentials] = useState<{ phone: string; pin: string; remember: boolean } | null>(null);

// Later, on login success:
if (credentials) {
  setLoginCredentials(credentials);
}
```

**Tasks**:
- [ ] Add cleanup effect to clear credentials on component unmount in `TradeRepublicView.tsx`:
  ```typescript
  useEffect(() => {
    return () => {
      // Clear sensitive data on unmount
      setLoginCredentials(null);
    };
  }, []);
  ```
- [ ] Verify credentials are already cleared on 2FA success (line 251) — existing implementation is correct
- [ ] Verify credentials are cleared when user cancels 2FA modal
- [ ] Test: navigate away during 2FA flow → verify no credentials persist in React DevTools
- [ ] Test: complete 2FA successfully → verify credentials cleared

### Phase 2: Sanitize Error Messages Before Display

**Issue**: Error messages from the backend are displayed directly to users via toast notifications without sanitization. Error messages could potentially reveal sensitive information such as whether a phone number is registered, session timing information, or internal error codes.

**Location**: `src/components/views/TradeRepublicView.tsx:271, 275, 306, 341-346`

**Current Code**:
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

**Tasks**:
- [ ] Create `sanitizeErrorMessage` helper in `src/lib/errors.ts` (if not exists):
  ```typescript
  export function sanitizeErrorMessage(message: string): string {
    // Remove internal codes, stack traces, and sensitive patterns
    return message
      .replace(/\[.+?\]/g, '') // Remove bracketed codes
      .replace(/session_id=\w+/gi, '')
      .replace(/token=\w+/gi, '')
      .replace(/\d{10,}/g, '[ID]') // Mask long numeric IDs
      .trim() || 'An error occurred';
  }
  ```
- [ ] Import `sanitizeErrorMessage` in `TradeRepublicView.tsx`
- [ ] Update error handler at line 271 (auto-sync catch block):
  ```typescript
  const rawMessage = error instanceof Error ? error.message : 'Sync failed';
  const message = sanitizeErrorMessage(rawMessage);
  ```
- [ ] Update error handler at line 306 (handleSync catch block) with same pattern
- [ ] Update error handler at line 341-346 (manual sync error) with same pattern
- [ ] Test with simulated backend error containing session_id → verify sanitized in toast
- [ ] Test normal error messages → verify user-friendly messages still displayed

### Verification Steps

1. Run `npm test src/components/views/TradeRepublicView` → all tests pass
2. Navigate away during 2FA flow → check React DevTools for credential state (should be null)
3. Complete successful 2FA → verify credentials cleared from state
4. Trigger sync error with internal codes → verify sanitized message in toast
5. Verify error toast messages remain helpful for common error scenarios

---

## Fixes from hive_client_review.md

> **Source**: `reviews/hive_client_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 3 Medium severity

### Context

The `hive_client.py` module handles community asset universe sync with Supabase, providing local caching and contribution mechanisms. These fixes address input validation, timezone-aware datetime handling, and silent failure logging—all defense-in-depth improvements for the identity resolution system.

### Phase 1: Add ISIN Input Validation

**Issue**: User-provided ISINs are passed to Supabase RPCs and used in cache lookups without client-side format validation. Adding validation reduces unnecessary API calls for invalid inputs and provides defense-in-depth.

**Location**: `src-tauri/python/portfolio_src/data/hive_client.py:329-342`

**Current Code**:
```python
def lookup(self, isin: str) -> Optional[AssetEntry]:
    """
    Look up an ISIN in the universe.
    Returns from cache if available, None otherwise.
    """
    # Ensure cache is populated
    if not self._universe_cache or not self._is_cache_valid():
        self.sync_universe()

    # Check cache
    if isin in self._universe_cache:
        return self._universe_cache[isin]

    return None
```

**Tasks**:
- [ ] Add `re` import at top of `hive_client.py` (if not already imported)
- [ ] Add ISIN validation pattern as module constant:
  ```python
  import re
  
  ISIN_PATTERN = re.compile(r'^[A-Z]{2}[A-Z0-9]{9}[0-9]$')
  ```
- [ ] Add `_validate_isin()` helper method to `HiveClient` class:
  ```python
  def _validate_isin(self, isin: str) -> bool:
      """Validate ISIN format (basic check, not checksum)."""
      return bool(isin and ISIN_PATTERN.match(isin.upper()))
  ```
- [ ] Update `lookup()` to validate before processing:
  ```python
  def lookup(self, isin: str) -> Optional[AssetEntry]:
      """
      Look up an ISIN in the universe.
      Returns from cache if available, None otherwise.
      """
      if not self._validate_isin(isin):
          logger.debug(f"Invalid ISIN format: {isin}")
          return None
          
      # Ensure cache is populated
      if not self._universe_cache or not self._is_cache_valid():
          self.sync_universe()

      # Check cache
      if isin in self._universe_cache:
          return self._universe_cache[isin]

      return None
  ```
- [ ] Apply same validation to `batch_lookup()` method (filter invalid ISINs from input list)
- [ ] Apply same validation to `resolve_ticker()` and contribution functions
- [ ] Add unit tests for invalid ISIN formats: empty string, None, special characters, wrong length
- [ ] Verify existing functionality works with valid ISINs

### Phase 2: Fix Cache Expiry Timezone Handling

**Issue**: Cache validation compares `datetime.now()` (timezone-naive) with a datetime parsed from ISO format that may be timezone-aware. This comparison can fail or behave unexpectedly depending on the cache file contents.

**Location**: `src-tauri/python/portfolio_src/data/hive_client.py:196-199`

**Current Code**:
```python
cached_at = data.get("cached_at")
if cached_at:
    cached_time = datetime.fromisoformat(cached_at)
    if datetime.now() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
        return False  # Cache expired
```

**Tasks**:
- [ ] Update `_load_cache()` to normalize timezone-aware datetimes before comparison:
  ```python
  cached_at = data.get("cached_at")
  if cached_at:
      cached_time = datetime.fromisoformat(cached_at)
      # Ensure both are timezone-naive for comparison
      if cached_time.tzinfo is not None:
          cached_time = cached_time.replace(tzinfo=None)
      if datetime.now() - cached_time > timedelta(hours=self.CACHE_TTL_HOURS):
          return False  # Cache expired
  ```
- [ ] Add unit test with cache file containing timezone-aware timestamp (`2026-01-18T12:00:00+00:00`)
- [ ] Add unit test with cache file containing timezone-naive timestamp (`2026-01-18T12:00:00`)
- [ ] Verify cache expiry works correctly in both cases

### Phase 3: Improve Fallback Logging for RLS-Blocked Queries

**Issue**: When RPC fails and fallback to direct table queries also fails (due to RLS restrictions for anonymous users), the error is silently swallowed with `pass`. This makes debugging connection issues difficult.

**Location**: `src-tauri/python/portfolio_src/data/hive_client.py:879-887`

**Current Code**:
```python
except Exception as e:
    logger.warning(f"Failed to sync assets: {e}")
    # Fallback: try direct query (may fail due to RLS)
    try:
        response = client.from_("assets").select("*").execute()
        if response.data:
            result["assets"] = response.data
    except Exception:
        pass  # Silent failure
```

**Tasks**:
- [ ] Update fallback exception handlers in `sync_identity_domain()` to log debug messages:
  ```python
  except Exception as e:
      logger.warning(f"Failed to sync assets via RPC: {e}")
      # Note: Direct table access will fail due to RLS for anon users
      # This fallback is only useful for service role connections
      try:
          response = client.from_("assets").select("*").execute()
          if response.data:
              result["assets"] = response.data
              logger.info(f"Fallback direct query succeeded for assets: {len(response.data)} rows")
      except Exception as fallback_error:
          logger.debug(f"Direct table fallback also failed (expected with anon key): {fallback_error}")
  ```
- [ ] Apply same pattern to listings fallback (lines 895-902)
- [ ] Apply same pattern to aliases fallback (lines 910-917)
- [ ] Verify appropriate log messages are generated when Supabase is unreachable
- [ ] Confirm RPC functions exist and work with anon key in normal operation

### Verification Steps

1. Run unit tests: `pytest src-tauri/python/tests/ -k hive_client`
2. Test invalid ISIN handling:
   - Call `lookup("")` → returns `None`, logs debug message
   - Call `lookup("INVALID")` → returns `None`, logs debug message
   - Call `lookup("US67066G1040")` → normal lookup behavior
3. Test cache timezone handling:
   - Create cache file with timezone-aware timestamp → cache loads correctly
   - Create cache file with timezone-naive timestamp → cache loads correctly
4. Test with Supabase unreachable → verify debug logs for fallback failures
5. Run full sync: `npm run tauri dev` → Hive sync completes without errors

---

## Fixes from feedback_ts_review.md

> **Source**: `reviews/feedback_ts_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `feedback.ts` module handles user feedback submission to the Cloudflare Worker, which creates GitHub issues. These fixes address PII exposure in user-submitted messages and missing request timeout—both are correctness and privacy issues consistent with the project's "privacy-first" philosophy.

### Phase 1: Scrub PII from Feedback Payload

**Issue**: User-submitted feedback messages are sent to the Cloudflare Worker without PII scrubbing. Users may inadvertently include account numbers, email addresses, phone numbers, or ISINs when describing issues. This data then appears in public GitHub issues.

**Location**: `src/lib/api/feedback.ts:48-57`

**Current Code**:
```typescript
const requestBody = JSON.stringify({
  ...payload,
  metadata: {
    ...payload.metadata,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    version: import.meta.env.VITE_APP_VERSION || 'dev',
    platform: platformName,
  },
});
```

**Tasks**:
- [ ] Import `scrubText` and `scrubObject` from `@/lib/scrubber` in `feedback.ts`
- [ ] Create scrubbed payload before JSON serialization:
  ```typescript
  import { scrubText, scrubObject } from '@/lib/scrubber';
  
  // ... in sendFeedback function, before JSON.stringify
  const scrubbedPayload = {
    type: payload.type,
    message: scrubText(payload.message),
    metadata: scrubObject({
      ...payload.metadata,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      version: import.meta.env.VITE_APP_VERSION || 'dev',
      platform: platformName,
    }),
  };
  
  const requestBody = JSON.stringify(scrubbedPayload);
  ```
- [ ] Test with IBAN input (`DE89370400440532013000`) → verify replaced with `[IBAN]`
- [ ] Test with email input (`user@example.com`) → verify replaced with `[EMAIL]`
- [ ] Test with phone input (`+49 123 456 7890`) → verify replaced with `[PHONE]`

### Phase 2: Add Request Timeout with AbortController

**Issue**: The `fetch()` call has no timeout configured. If the Cloudflare Worker is slow or unresponsive, the UI will show "Sending..." indefinitely with no way to recover.

**Location**: `src/lib/api/feedback.ts:59-65`

**Current Code**:
```typescript
const response = await fetch(`${workerUrl}/feedback`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: requestBody,
});
```

**Tasks**:
- [ ] Add `AbortController` with 15-second timeout:
  ```typescript
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const response = await fetch(`${workerUrl}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    // ... rest of response handling
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  }
  ```
- [ ] Test with worker URL pointing to a non-responsive server → verify timeout fires after 15 seconds
- [ ] Verify error message is user-friendly: `"Request timed out. Please try again."`
- [ ] Verify normal successful requests still work after refactor

### Verification Steps

1. Run `npm run typecheck` → no type errors
2. Submit feedback containing test IBAN `DE89370400440532013000` → GitHub issue shows `[IBAN]` instead
3. Submit feedback containing email `test@example.com` → GitHub issue shows `[EMAIL]` instead
4. Test timeout: temporarily break worker URL → verify 15-second timeout and clear error message
5. Test normal flow: submit real feedback → verify issue created successfully

---

## Fixes from caching_py_review.md

> **Source**: `reviews/caching_py_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 2 Medium severity

### Context

The `caching.py` module provides JSON file-based caching for enrichment data and a decorator for caching adapter DataFrame results. These fixes address defense-in-depth ISIN validation and path consistency with project conventions.

### Phase 1: Add ISIN Validation to cache_adapter_data Decorator

**Issue**: The `cache_adapter_data` decorator uses ISIN in file path construction without validation, unlike the JSON cache functions (`save_to_cache`, `auto_clean_cache`) which properly validate ISINs. An invalid or malformed ISIN could be used in file path construction.

**Location**: `src-tauri/python/portfolio_src/data/caching.py:156-158`

**Current Code**:
```python
def wrapper(self, isin: str, *args, **kwargs):
    class_name = self.__class__.__name__
    cache_file = os.path.join(CACHE_DIR, f"{isin}_{class_name}.csv")
```

**Tasks**:
- [ ] Add ISIN validation at start of `wrapper` function in `cache_adapter_data` decorator:
  ```python
  def wrapper(self, isin: str, *args, **kwargs):
      # Validate ISIN before using in file path
      if not is_valid_isin(isin):
          logger.warning(f"Invalid ISIN passed to adapter cache: {isin}")
          tracker.increment_system_metric("cache_invalid_key")
          return func(self, isin, *args, **kwargs)  # Skip caching, proceed with fetch
      
      class_name = self.__class__.__name__
      cache_file = os.path.join(CACHE_DIR, f"{isin}_{class_name}.csv")
      # ... rest of logic
  ```
- [ ] Verify `is_valid_isin` is already imported (line 9 confirms it is)
- [ ] Add unit test with invalid ISIN: call adapter with `"../../../etc/passwd"` → verify no file created outside CACHE_DIR
- [ ] Add unit test: verify fetch still works with invalid ISIN (just uncached)
- [ ] Test with valid ISIN (`IE00B4L5Y983`) → verify caching works as expected

### Phase 2: Migrate to config.WORKING_DIR for Path Consistency

**Issue**: The module uses hardcoded relative paths (`"data/working/cache/adapter_cache"`) instead of `config.WORKING_DIR`. This is inconsistent with other data modules (`holdings_cache.py`, `database.py`, `state_manager.py`) which use centralized config paths.

**Location**: `src-tauri/python/portfolio_src/data/caching.py:13-16`

**Current Code**:
```python
CACHE_DIR = "data/working/cache/adapter_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

ENRICHMENT_CACHE_FILE = "data/working/cache/enrichment_cache.json"
```

**Tasks**:
- [ ] Import config at top of `caching.py`:
  ```python
  from portfolio_src import config
  ```
- [ ] Update `CACHE_DIR` to use config path:
  ```python
  CACHE_DIR = config.WORKING_DIR / "cache" / "adapter_cache"
  ```
- [ ] Update `ENRICHMENT_CACHE_FILE` to use config path:
  ```python
  ENRICHMENT_CACHE_FILE = config.WORKING_DIR / "cache" / "enrichment_cache.json"
  ```
- [ ] Remove import-time `os.makedirs()` call (line 14) - defer to first use pattern:
  ```python
  _cache_dir_created = False

  def _ensure_cache_dir():
      """Lazy initialization of cache directory."""
      global _cache_dir_created
      if not _cache_dir_created:
          CACHE_DIR.mkdir(parents=True, exist_ok=True)
          _cache_dir_created = True
  ```
- [ ] Update functions that need the directory to call `_ensure_cache_dir()` first
- [ ] Convert `os.path.join()` calls to use `Path` operations for consistency
- [ ] Verify paths resolve correctly in both dev and bundled mode: `npm run tauri dev` and `npm run tauri build`
- [ ] Run existing tests to ensure no path regressions: `pytest src-tauri/python/tests/ -k cache`

### Verification Steps

1. Run `pytest src-tauri/python/tests/` → all tests pass
2. Test with invalid ISIN in adapter call → verify warning logged and empty DataFrame returned
3. Test with valid ISIN → verify caching works correctly
4. Verify paths are consistent: `grep -r "WORKING_DIR" src-tauri/python/portfolio_src/data/` → `caching.py` now included
5. Run `npm run tauri dev` → verify app loads data correctly with new paths
6. Build application: `npm run tauri build` → verify paths resolve correctly in bundled mode

---

## Fixes from main_tsx_review.md

> **Source**: `reviews/main_tsx_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 Medium severity

### Context

The `main.tsx` file is the React application entry point. It sets up global error handlers and renders the root component tree. This fix addresses a defensive coding gap in root element initialization that could cause an uncatchable crash.

### Phase 1: Add Root Element Null Check with Fallback

**Issue**: Root element lookup uses non-null assertion `document.getElementById('root')!` which throws an uncaught error if the element is missing (e.g., malformed HTML). This error occurs before `ErrorBoundary` mounts, so users see a blank page with no feedback.

**Location**: `src/main.tsx:35`

**Current Code**:
```typescript
ReactDOM.createRoot(document.getElementById('root')!).render(
```

**Tasks**:
- [ ] Replace non-null assertion with explicit null check and user-friendly fallback:
  ```typescript
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    document.body.innerHTML = '<div style="color: white; padding: 20px; font-family: sans-serif;"><h1>Application Error</h1><p>Failed to initialize. Please reload the page.</p></div>';
    throw new Error('Root element not found');
  }
  ReactDOM.createRoot(rootElement).render(
  ```
- [ ] Verify `eslint` no longer flags non-null assertion on this line
- [ ] Test by temporarily renaming `root` in `index.html` → verify fallback message displays

### Verification Steps

1. Rename `root` to `root-broken` in `index.html`
2. Run `npm run dev` → verify fallback message appears instead of blank page
3. Restore `root` and verify app loads normally
4. Run `npm run typecheck` → no errors
5. Run `npm run lint` → no new warnings

---

## Fixes from tauri_ts_review.md

> **Source**: `reviews/tauri_ts_review.md`
> **Reviewed**: 2026-01-18
> **Actionable Items**: 1 Medium severity

### Context

The `tauri.ts` module provides type-safe wrappers around Tauri's invoke and listen APIs with graceful browser fallbacks. The code is well-structured, properly typed, and has good test coverage. This fix addresses a performance optimization where dynamic imports are performed on every API call instead of being cached.

### Phase 1: Cache Tauri API Module Imports

**Issue**: Every call to `invoke`, `listen`, `once`, and `emit` performs a dynamic import of the Tauri API modules. While module bundlers cache dynamic imports after the first resolution, there's still overhead from the promise creation and module lookup on each call. For a frequently-called API wrapper, this can add up.

**Location**: `src/lib/tauri.ts:36,59,75,95`

**Current Code**:
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

**Tasks**:
- [ ] Add module-level cache variables at top of `src/lib/tauri.ts`:
  ```typescript
  // Module-level cache for Tauri APIs
  let cachedInvoke: typeof import('@tauri-apps/api/core')['invoke'] | null = null;
  let cachedEventApi: typeof import('@tauri-apps/api/event') | null = null;
  ```
- [ ] Add `getTauriInvoke()` helper function:
  ```typescript
  async function getTauriInvoke() {
    if (!cachedInvoke) {
      const { invoke } = await import('@tauri-apps/api/core');
      cachedInvoke = invoke;
    }
    return cachedInvoke;
  }
  ```
- [ ] Add `getTauriEventApi()` helper function:
  ```typescript
  async function getTauriEventApi() {
    if (!cachedEventApi) {
      cachedEventApi = await import('@tauri-apps/api/event');
    }
    return cachedEventApi;
  }
  ```
- [ ] Update `invoke()` function to use cached import:
  ```typescript
  const tauriInvoke = await getTauriInvoke();
  return tauriInvoke(command, args);
  ```
- [ ] Update `listen()` function to use cached event API:
  ```typescript
  const { listen: tauriListen } = await getTauriEventApi();
  return tauriListen(event, (e) => handler(e.payload as TauriEvents[K]));
  ```
- [ ] Update `once()` function to use cached event API:
  ```typescript
  const { once: tauriOnce } = await getTauriEventApi();
  return tauriOnce(event, (e) => handler(e.payload as TauriEvents[K]));
  ```
- [ ] Update `emit()` function to use cached event API:
  ```typescript
  const { emit: tauriEmit } = await getTauriEventApi();
  return tauriEmit(event, payload);
  ```

### Verification Steps

1. Run existing tests: `npm test src/lib/tauri.test.ts` → all tests pass
2. Verify module loading in browser dev tools (should show single import per module)
3. Run `npm run typecheck` → no type errors
4. Test IPC functionality: `npm run tauri dev` → verify commands and events work correctly
5. Optional: Add performance test comparing cached vs uncached imports