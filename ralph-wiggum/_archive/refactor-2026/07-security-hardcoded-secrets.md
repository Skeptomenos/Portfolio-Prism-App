# Spec: Remove Hardcoded Secret Fallbacks

> **Goal**: Eliminate hardcoded secret fallbacks in both frontend and backend to comply with `rules/security.md`.
> **Estimated Time**: 15 minutes.
> **Priority**: CRITICAL

## 1. Overview

The codebase contains hardcoded fallback secrets that provide a "backdoor" if environment variables are not configured. This violates the mandate: "NO secrets in code. Load from ENV."

### Rule Reference
`rules/security.md` Section 3 (Data Protection):
> "Secrets: NO secrets in code. NO secrets in Docker images. Load from ENV."

## 2. Current Violations

### 2.1 Frontend (TypeScript)
**File:** `src/lib/ipc.ts`  
**Line:** 77

```typescript
// CURRENT (BAD)
const echoToken = import.meta.env.VITE_ECHO_BRIDGE_TOKEN || 'dev-echo-bridge-secret'
```

### 2.2 Backend (Python)
**File:** `src-tauri/python/portfolio_src/headless/transports/echo_bridge.py`  
**Line:** 304

```python
# CURRENT (BAD)
echo_token = os.environ.get("PRISM_ECHO_TOKEN", "dev-echo-bridge-secret")
```

## 3. Implementation Steps

### 3.1 Frontend Fix

**File to modify:** `src/lib/ipc.ts`

1. Locate the `echoToken` assignment around line 77
2. Replace with environment variable check that throws on missing:

```typescript
// REQUIRED (GOOD)
function getEchoToken(): string {
  const token = import.meta.env.VITE_ECHO_BRIDGE_TOKEN
  if (!token) {
    throw new Error(
      '[IPC] VITE_ECHO_BRIDGE_TOKEN environment variable is required for Echo Bridge mode. ' +
      'Set it in your .env file or disable Echo Bridge.'
    )
  }
  return token
}

// Use lazily to avoid throwing during module load in production (non-echo) mode
let cachedEchoToken: string | null = null
function getEchoBridgeToken(): string {
  if (cachedEchoToken === null) {
    cachedEchoToken = getEchoToken()
  }
  return cachedEchoToken
}
```

3. Update all usages of `echoToken` to call `getEchoBridgeToken()`

### 3.2 Backend Fix

**File to modify:** `src-tauri/python/portfolio_src/headless/transports/echo_bridge.py`

1. Locate the `echo_token` assignment around line 304
2. Replace with explicit check:

```python
# REQUIRED (GOOD)
def _get_echo_token() -> str:
    """Get Echo Bridge token from environment. Raises if not set."""
    token = os.environ.get("PRISM_ECHO_TOKEN")
    if not token:
        raise RuntimeError(
            "PRISM_ECHO_TOKEN environment variable is required for Echo Bridge mode. "
            "Set it in your environment or disable Echo Bridge."
        )
    return token

# Call when initializing the Echo Bridge transport
ECHO_TOKEN = _get_echo_token()
```

3. Update the token validation logic to use this function

### 3.3 Update .env.example

**File to modify:** `.env.example`

Ensure both tokens are documented with clear instructions:

```bash
# =============================================================================
# ECHO BRIDGE (Development HTTP Transport) - REQUIRED for dev:browser mode
# =============================================================================
# SECURITY: You MUST set these values. No defaults are provided.
# Generate strong random tokens: openssl rand -hex 32

# Frontend token (Vite/TypeScript side)
VITE_ECHO_BRIDGE_TOKEN=

# Backend token (Python engine side)  
PRISM_ECHO_TOKEN=

# NOTE: Both tokens must match for authentication to succeed.
```

## 4. Testing Verification

### 4.1 Test Missing Token Behavior
```bash
# Unset the environment variables
unset VITE_ECHO_BRIDGE_TOKEN
unset PRISM_ECHO_TOKEN

# Attempt to start dev:browser mode
npm run dev:browser

# EXPECTED: Clear error message about missing tokens
# NOT: Silent fallback to hardcoded secret
```

### 4.2 Test Valid Token Behavior
```bash
# Set matching tokens
export VITE_ECHO_BRIDGE_TOKEN="test-token-123"
export PRISM_ECHO_TOKEN="test-token-123"

# Start dev:browser mode
npm run dev:browser

# EXPECTED: App starts successfully
```

## 5. Acceptance Criteria

- [ ] No hardcoded strings containing "secret", "token", or similar in source code
- [ ] Running `grep -r "dev-echo-bridge-secret" src/ src-tauri/` returns 0 matches
- [ ] Missing environment variable produces clear, actionable error message
- [ ] Application fails fast on startup if secrets are missing (not silently degraded)
- [ ] `.env.example` documents both required tokens

## 6. Related Files

| File | Action |
|------|--------|
| `src/lib/ipc.ts` | Remove fallback, add validation |
| `src-tauri/python/portfolio_src/headless/transports/echo_bridge.py` | Remove fallback, add validation |
| `.env.example` | Update documentation |
