# Review: .env.example

**File**: `.env.example`
**Reviewer**: Automated
**Date**: 2026-01-18
**Result**: PASSED (1 Medium, 3 Low, 2 Info)

---

## Summary

The `.env.example` file is a documentation-only template for environment variables. It follows security best practices by:
- Using commented placeholders instead of real values
- Clearly documenting which secrets are Cloudflare Worker secrets vs local config
- Warning users never to commit `.env` to version control
- Properly distinguishing between client-safe keys (anon key) and server-only keys (service role key)

The file is properly excluded from git via `.gitignore` patterns for `.env`, `.env.local`, and `.env.*.local`.

---

## [MEDIUM] Hardcoded Default Token in Echo Bridge

> A default development token is hardcoded in echo_bridge.py

**File**: `src-tauri/python/portfolio_src/headless/transports/echo_bridge.py:306`
**Category**: Security
**Severity**: Medium

### Description

While `.env.example` documents `PRISM_ECHO_TOKEN` is not required, the echo bridge transport uses a hardcoded default token `dev-echo-bridge-secret`. If the echo bridge is accidentally exposed in production without setting a custom token, this default could be exploited.

### Current Code

```python
# In echo_bridge.py:306
echo_token = os.environ.get("PRISM_ECHO_TOKEN", "dev-echo-bridge-secret")
```

### Suggested Fix

Document `PRISM_ECHO_TOKEN` in `.env.example` to ensure developers are aware they should set it:

```bash
# Echo Bridge Token (for development HTTP transport)
# Set a strong random token when using echo bridge in any shared environment
# PRISM_ECHO_TOKEN=your-strong-random-token-here
```

### Verification

1. Confirm echo bridge is only used in development
2. If used in shared environments, ensure token is set via environment

---

## [LOW] Missing OPENFIGI_API_KEY Documentation

> Environment variable used but not documented

**File**: `.env.example`
**Category**: Maintainability
**Severity**: Low

### Description

The code references `OPENFIGI_API_KEY` in `security_mapper.py:8`:
```python
OPENFIGI_API_KEY = os.getenv("OPENFIGI_API_KEY")
```

But this is not documented in `.env.example`. Users may not know this optional API key exists.

### Suggested Fix

Add to `.env.example`:

```bash
# =============================================================================
# OPTIONAL: OpenFIGI API (for security identifier resolution)
# =============================================================================
# Free tier available at: https://www.openfigi.com/api
# OPENFIGI_API_KEY=your_openfigi_api_key_here
```

---

## [LOW] Missing ENRICHMENT_RATE_LIMIT_MS Documentation

> Configurable rate limit not documented

**File**: `.env.example`
**Category**: Maintainability
**Severity**: Low

### Description

The enrichment module allows configuring rate limits via `ENRICHMENT_RATE_LIMIT_MS` (default 100ms), but this is not documented.

### Suggested Fix

Add to the Local Development section:

```bash
# Rate limit between enrichment API calls (default: 100ms)
# ENRICHMENT_RATE_LIMIT_MS=100
```

---

## [LOW] Missing DEBUG_PIPELINE Documentation

> Debug mode not documented

**File**: `.env.example`
**Category**: Maintainability
**Severity**: Low

### Description

`DEBUG_PIPELINE` is used in `pipeline.py:164` but not documented in `.env.example`.

### Suggested Fix

Add to Local Development section:

```bash
# Enable verbose pipeline logging (default: false)
# DEBUG_PIPELINE=true
```

---

## [INFO] Good Practice: Clear Separation of Secrets

**Category**: Security
**Severity**: Info

### Description

The file correctly separates:
1. **Cloudflare Worker secrets** (lines 8-23) - Set via `wrangler secret put`
2. **Supabase keys** (lines 25-37) - Distinguishes anon (client-safe) vs service role (server-only)
3. **Local development** (lines 47-56) - Clearly marked as optional/testing only

This clear organization helps prevent accidental exposure of server-side secrets in client code.

---

## [INFO] Finnhub Direct API Fallback Bypasses Proxy

**Category**: Security
**Severity**: Info

### Description

As noted in `REVIEW_PLAN.md`, `resolution.py:476-498` has a fallback that directly calls Finnhub API when `FINNHUB_API_KEY` is set in the environment. This bypasses the Cloudflare Worker proxy, which is noted as a design intent violation.

The `.env.example` correctly documents `FINNHUB_API_KEY` as a Cloudflare Worker secret (lines 12-14), implying it should NOT be set locally. However, this isn't explicitly stated.

### Suggested Improvement

Add a warning to `.env.example`:

```bash
# Finnhub API Key (for stock data)
# Get one at: https://finnhub.io/register
# WARNING: Set this ONLY in Cloudflare Worker via `wrangler secret put FINNHUB_API_KEY`
# Do NOT set locally - the app will use the Worker proxy by default.
# FINNHUB_API_KEY=your_finnhub_api_key_here
```

---

## Checklist Results

### Security
- [x] No secrets or real values in example file
- [x] Clear documentation of secret handling
- [x] Proper .gitignore coverage for .env files
- [x] Distinguishes client-safe vs server-only keys
- [x] No hardcoded credentials in example

### Correctness
- [x] Valid bash comment syntax
- [x] Placeholder format consistent
- [x] No typos in variable names
- [x] URLs are valid examples

### Maintainability
- [x] Well-organized sections
- [x] Comments explain purpose and source
- [ ] Missing some optional environment variables (see Low findings)

### Testing
- N/A (configuration file)

---

## Final Verdict

**PASSED** - The `.env.example` file follows security best practices. The medium finding relates to code in another file that should be documented here. Low findings are documentation improvements only.
