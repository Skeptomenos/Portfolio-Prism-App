# Implementation Plan

> Generated from `specs/review-fixes.md` analysis  
> Last Updated: 2026-01-18

---

## Overview

This plan consolidates **40 code review findings** into a prioritized implementation sequence. The reviews identified **6 HIGH severity** and **~75 MEDIUM severity** issues across security, correctness, and code quality domains.

### Severity Distribution
| Severity | Count | Focus Areas |
|----------|-------|-------------|
| HIGH | 6 | Credential leakage, input validation bypass |
| MEDIUM | ~75 | ISIN validation, error sanitization, timer cleanup, test coverage |

---

## Phase 1: Security Critical (HIGH Severity)

**Goal:** Eliminate all credential leakage and security bypass vulnerabilities.

### 1.1 Credential Leakage Prevention
**Scope:** Stop credentials from appearing in logs, error messages, or React props.

| Task | File | Issue | Est. | Status |
|------|------|-------|------|--------|
| 1.1.1 | `src/lib/ipc.ts:67-72` | Scrub phone/PIN from error logs before writing to system_logs | 15m | **DONE** (v0.1.0) |
| 1.1.2 | `src/components/auth/TwoFactorModal.tsx:112-114` | Remove credential retention in React props during 2FA flow | 20m | **DONE** (v0.1.1) |
| 1.1.3 | `src/components/auth/LoginForm.tsx` | Sanitize credentials in IPC error logging (uses ipc.ts) | 10m | |
| 1.1.4 | `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py:139-145` | Stop returning plaintext credentials via IPC response | 20m | |

**Verification:**
- [ ] Search codebase for credential logging: `grep -r "phone\|pin\|password" --include="*.log"`
- [ ] Run auth flow, inspect system_logs table for credential exposure
- [ ] Review IPC response payloads for sensitive data

### 1.2 Input Validation (Security Bypass)
**Scope:** Prevent resource abuse and injection attacks.

| Task | File | Issue | Est. |
|------|------|-------|------|
| 1.2.1 | `infrastructure/cloudflare/worker.js:260-269` | Add Finnhub symbol/query input validation (HIGH) | 30m |
| 1.2.2 | `src-tauri/python/portfolio_src/data/proxy_client.py` | Remove direct Finnhub API fallback (security bypass) | 20m |

**Verification:**
- [ ] Test Finnhub endpoint with malicious inputs (SQL injection, path traversal)
- [ ] Confirm proxy_client only routes through Worker, no direct API calls

---

## Phase 2: Input Validation (ISIN + Security)

**Goal:** Implement consistent ISIN validation across all entry points.

### 2.1 ISIN Validation Pattern
Create shared validator, then apply to all entry points.

| Task | File | Issue | Est. |
|------|------|-------|------|
| 2.1.1 | `src-tauri/src/commands.rs` | Add ISIN format validation (12 chars, 2-letter prefix, checksum) | 25m |
| 2.1.2 | `src-tauri/python/portfolio_src/adapters/xtrackers.py` | Add ISIN input validation | 10m |
| 2.1.3 | `src-tauri/python/portfolio_src/adapters/vanguard.py` | Add ISIN input validation | 10m |
| 2.1.4 | `src-tauri/python/portfolio_src/adapters/ishares.py` | Add ISIN input validation + **fix undefined `ISHARES_CONFIG_PATH` bug** | 20m |
| 2.1.5 | `src-tauri/python/portfolio_src/data/proxy_client.py` | Add symbol/query input validation | 15m |
| 2.1.6 | `src-tauri/python/portfolio_src/data/hive_client.py` | Add ISIN input validation | 10m |
| 2.1.7 | `src-tauri/python/portfolio_src/data/caching.py` | Add ISIN validation to cache decorator | 15m |

**Note:** Task 2.1.4 includes a **bug fix** - `ISHARES_CONFIG_PATH` is undefined in ishares.py.

**Verification:**
- [ ] Unit tests for ISIN validation (valid, invalid prefix, wrong length, bad checksum)
- [ ] Integration test with malformed ISINs through each adapter

---

## Phase 3: Error & Message Sanitization

**Goal:** Prevent information disclosure via error messages.

| Task | File | Issue | Est. |
|------|------|-------|------|
| 3.1 | `src-tauri/python/portfolio_src/headless/dispatcher.py` | Sanitize exception messages in error responses | 15m |
| 3.2 | `src-tauri/python/portfolio_src/core/tr_protocol.py` | Add type validation in deserialize_response | 15m |
| 3.3 | `src-tauri/src/lib.rs` | Escape AppleScript strings in error dialogs | 15m |
| 3.4 | `src/components/views/TradeRepublicView.tsx` | Sanitize error messages before display | 10m |
| 3.5 | `src/lib/scrubber.ts` | Add missing PII patterns (credit cards, SSN, IP, file paths) + ReDoS protection | 30m |

**Verification:**
- [ ] Test error handling with stack traces, file paths, credentials in errors
- [ ] Verify scrubber catches all PII patterns

---

## Phase 4: Security Configuration

**Goal:** Harden build configuration and enable security tooling.

### 4.1 Dependency Security Scanning

| Task | File | Issue | Est. |
|------|------|-------|------|
| 4.1.1 | `src-tauri/Cargo.toml` | Tighten version constraints + add cargo-deny | 20m |
| 4.1.2 | `package.json` | Pin critical Tauri deps + configure Dependabot | 15m |
| 4.1.3 | `src-tauri/python/pyproject.toml` | Update pytr + add pip-audit scanning | 15m |

### 4.2 CSP & Security Hardening

| Task | File | Issue | Est. |
|------|------|-------|------|
| 4.2.1 | `src-tauri/tauri.conf.json` | Remove unsafe CSP directives for production | 20m |
| 4.2.2 | `src-tauri/capabilities/default.json` | Add explicit sidecar scoping, harden CSP | 20m |
| 4.2.3 | `infrastructure/cloudflare/wrangler.toml` | Harden observability, enable KV rate limiting | 15m |
| 4.2.4 | `infrastructure/cloudflare/worker.js` | Environment-based CORS, migrate to KV rate limiting, feedback size validation | 30m |

**Verification:**
- [ ] `cargo deny check` passes
- [ ] `npm audit` passes
- [ ] `pip-audit` passes
- [ ] CSP tested in production build

---

## Phase 5: Code Correctness & Cleanup

**Goal:** Fix bugs, remove dead code, improve robustness.

### 5.1 Bug Fixes

| Task | File | Issue | Est. |
|------|------|-------|------|
| 5.1.1 | `src-tauri/python/portfolio_src/core/pipeline.py` | Use atomic write for debug JSON snapshots | 15m |
| 5.1.2 | `src-tauri/python/portfolio_src/core/pipeline.py` | Fix private attribute access in telemetry | 10m |
| 5.1.3 | `src-tauri/python/portfolio_src/headless/state.py` | Thread-safe singleton (double-checked locking) | 20m |
| 5.1.4 | `src-tauri/python/portfolio_src/data/database.py` | Propagate migration failures (don't swallow) | 15m |
| 5.1.5 | `src-tauri/python/portfolio_src/data/hive_client.py` | Fix cache expiry timezone handling | 15m |
| 5.1.6 | `src/hooks/usePortfolioData.ts` | Fix useXRayData portfolioId mismatch + add query invalidation | 20m |

### 5.2 Dead Code Removal

| Task | File | Issue | Est. |
|------|------|-------|------|
| 5.2.1 | `src-tauri/python/portfolio_src/headless/state.py` | Remove/integrate unused get_pipeline() | 10m |
| 5.2.2 | `src-tauri/python/portfolio_src/data/database.py` | Remove unused connection cache | 10m |
| 5.2.3 | `src-tauri/python/portfolio_src/adapters/vanguard.py` | Remove duplicate logger assignment | 5m |

### 5.3 Timer & Resource Cleanup

| Task | File | Issue | Est. |
|------|------|-------|------|
| 5.3.1 | `src/store/useAppStore.ts` | Timer cleanup for notification auto-dismiss | 15m |
| 5.3.2 | `src/store/useAppStore.ts` | Timer cleanup for toast auto-dismiss | 15m |
| 5.3.3 | `src/components/auth/TwoFactorModal.tsx` | Fix useEffect race condition | 20m |
| 5.3.4 | `src/components/views/TradeRepublicView.tsx` | Add credential cleanup on unmount | 15m |

---

## Phase 6: Documentation & Observability

**Goal:** Document security decisions, improve logging.

| Task | File | Issue | Est. |
|------|------|-------|------|
| 6.1 | `.env.example` | Document Echo Bridge token requirement + runtime warning | 10m |
| 6.2 | `src-tauri/python/prism_headless.py` | Change default host 0.0.0.0 → 127.0.0.1 + log silent exceptions | 15m |
| 6.3 | `src-tauri/python/portfolio_src/core/tr_bridge.py` | Document credential transmission security model | 10m |
| 6.4 | `src-tauri/src/python_engine.rs` | Document race condition safety invariants + add payload validation | 20m |
| 6.5 | `src-tauri/python/portfolio_src/data/hive_client.py` | Improve fallback logging | 10m |

---

## Phase 7: Accessibility & UX

**Goal:** Improve accessibility compliance.

| Task | File | Issue | Est. |
|------|------|-------|------|
| 7.1 | `src/components/ui/Toast.tsx` | Add accessibility attributes to close button + ARIA live region | 15m |
| 7.2 | `src/App.tsx` | Move console.log to useEffect (runs on every render) | 5m |
| 7.3 | `src/main.tsx` | Add root element null check with fallback | 5m |
| 7.4 | `src/lib/tauri.ts` | Cache Tauri API module imports for performance | 10m |

---

## Phase 8: Test Coverage

**Goal:** Add tests for uncovered security-sensitive code.

| Task | File | Issue | Est. |
|------|------|-------|------|
| 8.1 | `src/components/feedback/FeedbackDialog.tsx` | Add test coverage | 30m |
| 8.2 | `src-tauri/python/portfolio_src/data/tr_sync.py` | Add unit tests + replace manual CSV escaping with stdlib | 30m |
| 8.3 | `src/lib/scrubber.ts` | Align hash algorithm with backend (SHA-256) | 15m |
| 8.4 | `src/lib/api/feedback.ts` | Scrub PII from payload + add request timeout | 20m |
| 8.5 | `src/components/auth/LoginForm.tsx` | Expand phone validation for TR markets | 15m |
| 8.6 | `src/components/auth/LoginForm.tsx` | Add PIN state timeout | 15m |
| 8.7 | `src/components/auth/TwoFactorModal.tsx` | Add local rate limiting on 2FA attempts | 20m |

---

## Phase 9: Component Refactoring (Optional)

**Goal:** Improve maintainability via decomposition.

| Task | File | Issue | Est. |
|------|------|-------|------|
| 9.1 | `src/components/views/Dashboard.tsx` | Component decomposition (320→150 lines) | 45m |
| 9.2 | `src/components/views/Dashboard.tsx` | Null safety for history array | 10m |

---

## Execution Priority

| Priority | Phase | Rationale |
|----------|-------|-----------|
| P0 | Phase 1 (Security Critical) | Credential leakage is actively harmful |
| P1 | Phase 2 (ISIN Validation) | Prevents injection + fixes ishares bug |
| P1 | Phase 3 (Error Sanitization) | Prevents information disclosure |
| P2 | Phase 4 (Security Config) | Defense in depth |
| P2 | Phase 5 (Bug Fixes) | Correctness improvements |
| P3 | Phase 6-8 | Documentation, a11y, tests |
| P4 | Phase 9 | Nice-to-have refactoring |

---

## Estimated Effort

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1 | 6 | 1.5 hours |
| Phase 2 | 7 | 1.5 hours |
| Phase 3 | 5 | 1.5 hours |
| Phase 4 | 7 | 2 hours |
| Phase 5 | 12 | 3 hours |
| Phase 6 | 5 | 1 hour |
| Phase 7 | 4 | 30 mins |
| Phase 8 | 7 | 2.5 hours |
| Phase 9 | 2 | 1 hour |
| **Total** | **55** | **~14.5 hours** |

---

## Notes

- All tasks reference specific file paths and line numbers from `specs/review-fixes.md`
- Each task should be implemented with corresponding test coverage
- Phase 1 is **blocking** for any production deployment
- Phases can be parallelized across multiple sessions (Phase 1 must complete first)
