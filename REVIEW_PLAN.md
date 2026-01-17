# Code Review Plan

## Summary

| Metric | Value |
|--------|-------|
| **Review Target** | codebase |
| **Branch** | main |
| **Base** | main |
| **Total Files** | 42 |
| **Reviewed** | 6 |
| **Findings** | 34 (0 critical, 2 high) |
| **Status** | In Progress |

## Project Context

- **Architecture**: Tauri v2 (Rust) + React + Python Sidecar
- **Stack**: TypeScript/React frontend, Rust shell, Python analytics engine
- **Security Model**: API keys proxied via Cloudflare Worker, credentials in macOS Keychain
- **Data**: Local-first SQLite, optional Supabase (Hive) sync

## Review Items

### Priority 0 - Critical (Security, Auth, Credentials)

| Status | File | Focus Areas | Findings |
|--------|------|-------------|----------|
| [x] | `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py` | Credential handling, session management, 2FA flow | 1 High, 1 Medium, 1 Low |
| [x] | `src-tauri/python/portfolio_src/core/tr_bridge.py` | Trade Republic API integration, auth state | 2 Medium, 1 Low |
| [x] | `src-tauri/python/portfolio_src/core/tr_protocol.py` | WebSocket auth protocol, session tokens | 3 Medium, 2 Low, 1 Info |
| [x] | `src-tauri/python/portfolio_src/data/hive_client.py` | Supabase auth, API key handling | 3 Medium, 2 Low, 1 Info |
| [x] | `src-tauri/python/portfolio_src/data/proxy_client.py` | API proxy calls, secret injection | 2 Medium, 3 Low, 1 Info |
| [x] | `infrastructure/cloudflare/worker.js` | Rate limiting, CORS, API key injection, input validation | 1 High, 3 Medium, 3 Low, 2 Info |
| [ ] | `src-tauri/src/commands.rs` | IPC command validation, file path handling | - |
| [ ] | `src-tauri/capabilities/default.json` | Tauri security permissions | - |
| [ ] | `src/components/auth/LoginForm.tsx` | Credential input, phone/PIN handling | - |
| [ ] | `src/components/auth/TwoFactorModal.tsx` | 2FA code entry, timing attacks | - |
| [ ] | `src/lib/scrubber.ts` | PII scrubbing for error reports | - |

### Priority 1 - Core Logic (Business Logic, APIs, IPC)

| Status | File | Focus Areas | Findings |
|--------|------|-------------|----------|
| [ ] | `src-tauri/src/lib.rs` | Sidecar spawning, event handling, single-instance | - |
| [ ] | `src-tauri/src/python_engine.rs` | IPC protocol, command timeouts, error handling | - |
| [ ] | `src-tauri/python/prism_headless.py` | Entry point, IPC loop, error handling | - |
| [ ] | `src-tauri/python/portfolio_src/headless/dispatcher.py` | Command routing, validation | - |
| [ ] | `src-tauri/python/portfolio_src/headless/state.py` | Singleton state, lazy init | - |
| [ ] | `src-tauri/python/portfolio_src/core/pipeline.py` | Data processing pipeline, error handling | - |
| [ ] | `src/lib/ipc.ts` | Frontend IPC layer, command validation | - |
| [ ] | `src/lib/tauri.ts` | Tauri API wrappers, fallback logic | - |
| [ ] | `src/hooks/usePortfolioData.ts` | Data fetching, cache invalidation | - |
| [ ] | `src/store/useAppStore.ts` | Zustand state, auth state management | - |

### Priority 2 - Integration (External Services, DB, Adapters)

| Status | File | Focus Areas | Findings |
|--------|------|-------------|----------|
| [ ] | `src-tauri/python/portfolio_src/data/database.py` | SQL injection, connection handling | - |
| [ ] | `src-tauri/python/portfolio_src/data/tr_sync.py` | Trade Republic sync, data validation | - |
| [ ] | `src-tauri/python/portfolio_src/data/caching.py` | Cache invalidation, data freshness | - |
| [ ] | `src-tauri/python/portfolio_src/adapters/ishares.py` | ETF data parsing, input validation | - |
| [ ] | `src-tauri/python/portfolio_src/adapters/vanguard.py` | ETF data parsing, input validation | - |
| [ ] | `src-tauri/python/portfolio_src/adapters/xtrackers.py` | ETF data parsing, input validation | - |
| [ ] | `src/lib/api/feedback.ts` | Feedback API, error handling | - |

### Priority 3 - UI/Presentation

| Status | File | Focus Areas | Findings |
|--------|------|-------------|----------|
| [ ] | `src/App.tsx` | Root component, routing, session check | - |
| [ ] | `src/main.tsx` | Entry point, error boundaries | - |
| [ ] | `src/components/views/Dashboard.tsx` | Data display, XSS prevention | - |
| [ ] | `src/components/views/TradeRepublicView.tsx` | Auth flow UI, state handling | - |
| [ ] | `src/components/views/XRayView.tsx` | Data display, user input | - |
| [ ] | `src/components/common/ErrorBoundary.tsx` | Error handling, info leakage | - |
| [ ] | `src/components/ui/Toast.tsx` | Notification display | - |
| [ ] | `src/components/feedback/FeedbackDialog.tsx` | User input, PII concerns | - |

### Priority 4 - Configuration

| Status | File | Focus Areas | Findings |
|--------|------|-------------|----------|
| [ ] | `src-tauri/tauri.conf.json` | CSP headers, permissions, bundled binaries | - |
| [ ] | `infrastructure/cloudflare/wrangler.toml` | Worker config, secrets | - |
| [ ] | `vite.config.ts` | Build config, env exposure | - |
| [ ] | `.env.example` | Environment variables, secrets | - |
| [ ] | `package.json` | Dependency security | - |
| [ ] | `src-tauri/Cargo.toml` | Rust dependency security | - |
| [ ] | `src-tauri/python/pyproject.toml` | Python dependency security | - |

## Known Concerns

From AGENTS.md and project context:

- API keys MUST be proxied via Cloudflare Worker - never in client
- Trade Republic credentials stored in macOS Keychain via `keyring`
- Session cookies stored in `PRISM_DATA_DIR/tr_cookies.txt`
- CSP allows `*.workers.dev` for Cloudflare proxy
- Rate limiting uses in-memory store (resets on worker restart)
- Single-instance lock file prevents multiple app instances

**Found during review:**

- `resolution.py:476-498` has fallback to direct Finnhub API bypassing proxy (violates design intent)
- `proxy_client.py` lacks input validation on symbol parameters
- No retry logic for transient network failures in proxy client

## Approval Criteria

- [ ] No critical severity findings
- [ ] No high severity findings unaddressed
- [ ] All security concerns documented
- [ ] Code follows project conventions (from AGENTS.md)
- [ ] Credential handling is secure (Keychain, not plaintext)
- [ ] API keys never exposed to client
- [ ] Input validation on all IPC boundaries
- [ ] SQL injection prevention verified

## Review Log

| Date | File | Reviewer | Result |
|------|------|----------|--------|
| 2026-01-18 | `src-tauri/python/portfolio_src/headless/handlers/tr_auth.py` | Automated | NEEDS_ACTION (1H, 1M, 1L) |
| 2026-01-18 | `src-tauri/python/portfolio_src/core/tr_bridge.py` | Automated | PASSED (2M, 1L) |
| 2026-01-18 | `src-tauri/python/portfolio_src/core/tr_protocol.py` | Automated | PASSED (3M, 2L, 1I) |
| 2026-01-18 | `src-tauri/python/portfolio_src/data/hive_client.py` | Automated | PASSED (3M, 2L, 1I) |
| 2026-01-18 | `src-tauri/python/portfolio_src/data/proxy_client.py` | Automated | PASSED (2M, 3L, 1I) |
| 2026-01-18 | `infrastructure/cloudflare/worker.js` | Automated | NEEDS_ACTION (1H, 3M, 3L, 2I) |
