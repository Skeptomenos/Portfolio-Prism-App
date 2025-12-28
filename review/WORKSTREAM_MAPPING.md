# Code Review Findings → Workstream Mapping
**Purpose:** Link code review issues to active workstreams and backlog  
**Date:** 2025-12-28

---

## Overview

This document maps the 11 code review issues (3 critical + 8 warnings) to existing workstreams and tasks in `keystone/project/`.

**Current Board Status:**
- Total: 57 tasks | Open: 2 | In Progress: 0 | Blocked: 8 | Done: 44 | Archive: 3
- **Blocker:** SN-001 (logging) prevents SN-002 through SN-009 (8 tasks)

---

## 🔴 CRITICAL ISSUE #1: Logging Anti-Pattern (48 prints)

### Current Blocking Situation
**Workstream:** `silent-night` | **Owner:** TBD  
**Blocked Tasks:** SN-002, SN-003, SN-004, SN-005, SN-006, SN-007, SN-008, SN-009

```
SN-001 (OPEN): Replace prints in tr_daemon.py
└─ SN-002 (BLOCKED): Replace prints in tr_bridge.py
└─ SN-003 (BLOCKED): Replace prints in validation.py
└─ SN-004 (BLOCKED): Replace prints in position_keeper.py
└─ SN-005 (BLOCKED): Replace prints in hive_client.py
└─ SN-006 (BLOCKED): Replace prints in adapters
└─ SN-007 (BLOCKED): Replace prints in pdf_parser.py
└─ SN-008 (BLOCKED): Replace prints in remaining files
└─ SN-009 (BLOCKED): Final verification and commit
```

### Code Review Finding
**Files with prints (48 total):**
- tr_daemon.py (2) — IPC protocol, can corrupt JSON
- position_keeper.py (2) — Demo output
- validation.py (1) — Test case
- ishares.py (5) — Interactive prompts
- vaneck.py (4) — Test output
- vanguard.py (4) — Test output
- amundi.py (3) — Module-level execution
- xtrackers.py (3) — Module-level execution
- hive_client.py (8) — Error fallbacks
- pdf_parser.py (10) — Progress logging
- echo_bridge.py (2) — Error messaging
- stdin_loop.py (3) — IPC framing
- metrics.py (1) — Error message

### Recommended Action
**For SN-001:**
```
1. Replace tr_daemon.py prints with logger (15 min)
   - Line 262: Debug output → logger.debug()
   - Line 280, 282: Protocol output → logger.debug()

2. Create unified print() check script:
   grep -rn "print(" src-tauri/python/portfolio_src/ --include="*.py" \
     | grep -v "def print" | grep -v "# print" | grep -v "__main__"

3. Document pattern for remaining tasks (SN-002 through SN-008)
```

**For downstream tasks (SN-002 → SN-009):**
- Each task replaces prints in one file/module
- Follow pattern: `logger.level("message with context")`
- Special case: Interactive code → check `sys.stdout.isatty()`
- Final task (SN-009): Verify zero prints in production code

**Timeline:** 2-3 hours total (unblocks 8 tasks)

---

## 🔴 CRITICAL ISSUE #2: Adapter Sequential Execution

### Current Status
**Workstream:** `data-engine` | **Owner:** TBD  
**Related Task:** TASK-612 (Open) — "Implement Async I/O for Adapters"

```
TASK-612 (OPEN): Implement Async I/O for Adapters
├── Currently blocking Phase 6 performance targets
├── 50 ETFs = 250+ seconds (unacceptable)
└── Target: 50 seconds with 5-parallel requests
```

### Code Review Finding
**All adapters are synchronous:**
- ishares.py:165 — `requests.get(url, timeout=30)`
- vanguard.py — Multiple sequential requests
- amundi.py, vaneck.py, xtrackers.py — All blocking calls

**No concurrency wrapper exists** in:
- `src-tauri/python/portfolio_src/adapters/async_registry.py` ← Should create
- `src-tauri/python/portfolio_src/core/pipeline.py` ← Should integrate

### Recommended Action

**Create implementation plan for TASK-612:**
1. New file: `adapters/async_registry.py` (AsyncAdapterRegistry class)
2. New file: `adapters/rate_limiter.py` (respect API limits)
3. Update: `core/pipeline.py` to use async wrapper
4. Benchmark: 50 ETFs with 10 runs

**Detailed code provided in `FINDINGS_WITH_FIXES.md`**

**Timeline:** 4-6 hours (estimate: 5 hours)

**Success Criteria:**
- [ ] 50 ETFs decomposed in <60 seconds (vs current 250s)
- [ ] Respects rate limits (5 parallel requests max)
- [ ] No breaking changes to existing API
- [ ] Unit tests for AsyncAdapterRegistry

### Dependency Check
**Depends on:** None (can start immediately)  
**Blocks:** Phase 6 performance validation

---

## 🔴 CRITICAL ISSUE #3: Type Safety (6 `as any` casts)

### Current Status
**Workstream:** `frontend` (implied) | **Owner:** TBD  
**Related:** TypeScript strict mode already enabled

```
Files with type casting violations:
├── HoldingsUpload.tsx:55 — File path cast
└── ActionQueue.tsx:72 — Error type cast
```

### Code Review Finding
```typescript
// ❌ WRONG (HoldingsUpload.tsx:55)
const filePath = (file as any).path || file.name;

// ❌ WRONG (ActionQueue.tsx:72)
{failure.error || (failure as any).issue}
```

### Recommended Action
1. **New file:** `src/types/index.ts` additions
   - FileWithPath interface
   - APIFailure interface
   - Type guards (isFileWithPath, isAPIFailure)

2. **Update HoldingsUpload.tsx**
   - Use FileWithPath interface
   - Add runtime check before accessing .path

3. **Update ActionQueue.tsx**
   - Define APIFailure error shape
   - Use type guard or safe accessor

4. **Validation:** `npm run build` (zero TypeScript errors)

**Timeline:** 1 hour (mostly type definitions)

**Success Criteria:**
- [ ] 0 `as any` casts in tsx/ts files
- [ ] `npm run build` passes with zero warnings
- [ ] All existing tests still pass

---

## 🟡 WARNINGS → BACKLOG MAPPING

### W1. Database Connection Inconsistency
**Workstream:** `data-engine` | **New task:** DB-CONSISTENCY-001

```
Current violation (database.py):
├── Line 237-250: update_sync_state() — manual commit
├── Line 262-282: log_system_event() — manual commit
└── Line 299-308: mark_logs_processed() — manual commit

Pattern should be:
└── Use: with transaction() as conn: (auto-commit)
```

**Action:** Refactor 3 functions to use `transaction()` pattern  
**Timeline:** 30 minutes  
**Priority:** Medium (prevents connection leaks)

---

### W2. Error Handling Inconsistency
**Workstream:** `data-engine` | **New task:** ERROR-LOGGING-001

```
Current violation (multiple files):
├── hive_client.py (8 instances) — logger.error() without exc_info=True
├── proxy_client.py (suspected)
└── resolution.py (suspected)

Fix pattern:
└── logger.error(msg, exc_info=True) or logger.exception(msg)
```

**Action:** Grep + replace all instances  
**Timeline:** 20 minutes  
**Impact:** Lost tracebacks in production logs

---

### W3. IPC Type Drift
**Workstream:** `frontend` | **New task:** IPC-VALIDATION-001

```
Current (no validation):
├── lib/ipc.ts — invoke() returns unknown
├── HoldingsView.tsx:49 — assumes TrueHoldingsResponse shape
└── No runtime check if backend changes

Fix:
└── Add Zod schema validation to all IPC calls
```

**Action:** Create `lib/ipc-schemas.ts`, add validation layer  
**Timeline:** 1 hour  
**Dependency:** Requires `npm install zod`

---

### W4. ISIN Validator Missing
**Workstream:** `data-engine` | **New task:** ISIN-VALIDATION-001

```
Current (no input validation):
├── resolution.py:70 — resolve() accepts any string
├── No Pydantic validation on ticker/name
└── Risk: SQL injection if IPC input corrupted

Fix:
└── Add ResolutionRequest Pydantic model
```

**Action:** Add input validation before API calls  
**Timeline:** 45 minutes  
**Dependency:** Requires `pydantic` (already installed)

---

### W5. Normalizer Redundant Instances
**Workstream:** `data-engine` | **New task:** NORMALIZER-AUDIT-001

```
Current (potential duplication):
├── resolution.py:84 — get_name_normalizer() ✅ Correct
├── Other files — may create NameNormalizer() directly ❌
└── State inconsistency if cache/learning enabled

Fix:
└── Audit all files for NameNormalizer() usage
└── Enforce use of factory functions
```

**Action:** Grep audit + document factory pattern  
**Timeline:** 30 minutes  
**Impact:** Low (unlikely to manifest)

---

### W6. Environment Variable Validation
**Workstream:** `data-engine` | **New task:** ENV-VALIDATION-001

```
Current (no validation):
├── resolution.py:36 — FINNHUB_API_KEY = os.getenv(...)
└── No check if empty or invalid

Fix:
└── Add validate_environment() in prism_headless.py
└── Call at startup, set feature flags
```

**Action:** Add env validation at main() entry point  
**Timeline:** 30 minutes  
**Impact:** Prevents crash after 30min of work

---

### W7. React Dependencies (useMemo)
**Workstream:** `frontend` | **New task:** REACT-DEPS-001

```
Current (missing dependency):
├── HoldingsView.tsx:66-103 — useMemo([], [filter, sort, searchQuery])
└── Missing: holdings (used in line 67)

Fix:
└── Add holdings to dependency array
```

**Action:** Add ESLint plugin, fix warnings  
**Timeline:** 15 minutes  
**Dependency:** Configure `eslint-plugin-react-hooks`

---

### W8. PyInstaller Path Logic
**Workstream:** `data-engine` | **New task:** BUNDLING-FRAGILE-001

```
Current (fragile):
├── database.py:52 — getattr(sys, "_MEIPASS", None)
└── Using undocumented private attribute

Fix:
└── Use sys.frozen and check _MEIPASS existence
```

**Action:** Update path detection logic  
**Timeline:** 15 minutes  
**Impact:** Low (works now, fragile for future)

---

## Backlog Integration

### Proposed New Tasks (for code-review)

Add to `keystone/project/backlog.md`:

```markdown
## Code Review Backlog (2025-12-28)

### Critical
- [ ] **LOGGING-REFACTOR-001:** Fix 48 print() statements (2-3h)
  - Dependencies: None
  - Unblocks: SN-001
  
- [ ] **ASYNC-ADAPTERS-001:** Implement AsyncAdapterRegistry (4-6h)
  - Dependencies: None
  - Related: TASK-612
  
- [ ] **TYPE-SAFETY-001:** Replace 6 `as any` casts (1h)
  - Dependencies: None
  - Related: TypeScript strict mode

### Medium
- [ ] **DB-CONSISTENCY-001:** Fix connection patterns (30m)
- [ ] **ERROR-LOGGING-001:** Add exc_info=True (20m)
- [ ] **IPC-VALIDATION-001:** Add Zod schemas (1h)
- [ ] **ISIN-VALIDATION-001:** Add Pydantic validation (45m)

### Low
- [ ] **NORMALIZER-AUDIT-001:** Verify singletons (30m)
- [ ] **ENV-VALIDATION-001:** Startup checks (30m)
- [ ] **REACT-DEPS-001:** Fix useMemo deps (15m)
- [ ] **BUNDLING-FRAGILE-001:** PyInstaller path (15m)
```

---

## Workstream Status After Fixes

### `silent-night` Unblock Path
```
BEFORE:
├─ SN-001 (OPEN)
└─ SN-002 → SN-009 (BLOCKED by SN-001)

AFTER (with LOGGING-REFACTOR-001):
├─ SN-001 (Done) — tr_daemon.py fixed
├─ SN-002 (Open) — tr_bridge.py ready
├─ SN-003 (Open) — validation.py ready
├─ ...
└─ SN-009 (Open) — final verification

Remaining work: ~4-6 hours (1 file per hour)
```

### `data-engine` New Work
```
Current open: TASK-612 (Async I/O)
After code review:
├─ TASK-612 (Ready) — Can start immediately
├─ ASYNC-ADAPTERS-001 (New) — Implementation plan available
├─ DB-CONSISTENCY-001 (New, 30m)
├─ ERROR-LOGGING-001 (New, 20m)
├─ ISIN-VALIDATION-001 (New, 45m)
└─ NORMALIZER-AUDIT-001 (New, 30m)

Total additional: ~2.5 hours

ESTIMATED PHASE 6 TIMELINE:
├─ Week 1: Logging fixes (SN unblock)
├─ Week 2: Type safety + IPC validation
├─ Week 3: Async adapters (TASK-612)
└─ Week 4: Final polish

Total estimate: 11-13 hours across 4 weeks
```

### `frontend` New Work
```
After code review:
├─ TYPE-SAFETY-001 (New, 1h)
├─ IPC-VALIDATION-001 (New, 1h)
└─ REACT-DEPS-001 (New, 15m)

Total: ~2.25 hours

Can be done in parallel with data-engine work
```

---

## Summary Table

| Issue | Workstream | New Task | Effort | Unblocks |
|-------|-----------|----------|--------|----------|
| Print() anti-pattern | silent-night | LOGGING-REFACTOR-001 | 2-3h | SN-001→009 |
| Async I/O | data-engine | ASYNC-ADAPTERS-001 | 4-6h | Phase 6 perf |
| Type safety | frontend | TYPE-SAFETY-001 | 1h | Build quality |
| DB consistency | data-engine | DB-CONSISTENCY-001 | 30m | Stability |
| Error logging | data-engine | ERROR-LOGGING-001 | 20m | Observability |
| IPC validation | frontend | IPC-VALIDATION-001 | 1h | Reliability |
| ISIN validator | data-engine | ISIN-VALIDATION-001 | 45m | Security |
| Normalizer audit | data-engine | NORMALIZER-AUDIT-001 | 30m | Consistency |
| Env validation | data-engine | ENV-VALIDATION-001 | 30m | Robustness |
| useMemo deps | frontend | REACT-DEPS-001 | 15m | Stability |
| PyInstaller path | data-engine | BUNDLING-FRAGILE-001 | 15m | Future-proof |

**Total estimated effort: 11-13 hours**  
**Distribution: 7-8h data-engine, 2.25h frontend, 2-3h silent-night**

---

## Recommendation for Project Lead

1. **Immediate (Today):** Create LOGGING-REFACTOR-001 task, assign to SN session
2. **This Week:** Fix SN-001, unblock SN-002 → SN-009
3. **Next Week:** Create remaining 10 new tasks in backlog
4. **Concurrent:** Start TASK-612 (async adapters) once logging is fixed
5. **Final:** Schedule 1-week polish sprint for all remaining issues

**Expected Phase 5 completion:** 3-4 weeks (22-26 hours of work)

---

**Mapping document prepared by Code Review Agent**  
All detailed fixes available in `FINDINGS_WITH_FIXES.md`
