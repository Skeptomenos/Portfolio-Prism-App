# Echo-Sentinel Architecture

> **Purpose:** Zero-effort crash reporting with privacy-first design.
> **Scope:** Error capture, batching, deduplication, and GitHub issue creation.
> **Style:** ASCII Block Diagrams (MVP Style)

---

## 1. High-Level Architecture

Echo-Sentinel is a **passive observability system** that captures errors locally, batches them on next startup, and reports deduplicated issues to GitHub via Cloudflare Worker.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Echo-Sentinel System                         │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    Error Capture Layer                      │   │
│   │                                                             │   │
│   │   ┌───────────────┐         ┌───────────────┐               │   │
│   │   │ Python Errors │         │ React Errors  │               │   │
│   │   │ (excepthook)  │         │ (ErrorBoundary│               │   │
│   │   └───────┬───────┘         └───────┬───────┘               │   │
│   │           │                         │                       │   │
│   │           └────────────┬────────────┘                       │   │
│   │                        ▼                                    │   │
│   │              ┌─────────────────────┐                        │   │
│   │              │  SQLiteLogHandler   │                        │   │
│   │              │  (Auto-Categorize)  │                        │   │
│   │              └──────────┬──────────┘                        │   │
│   └─────────────────────────┼───────────────────────────────────┘   │
│                             │                                       │
│                             ▼                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                     SQLite Database                         │   │
│   │                                                             │   │
│   │   system_logs                                               │   │
│   │   ┌────────────────────────────────────────────────────┐    │   │
│   │   │ id | session_id | level | component | category |   │    │   │
│   │   │    | error_hash | message | processed | reported_at│    │   │
│   │   └────────────────────────────────────────────────────┘    │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                             │                                       │
│                             │ Next Startup (5s delay)               │
│                             ▼                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                      Sentinel Auditor                       │   │
│   │                                                             │   │
│   │   ┌───────────────┐   ┌───────────────┐   ┌─────────────┐   │   │
│   │   │ Query Errors  │──►│ Batch by Type │──►│ Deduplicate │   │   │
│   │   │ (processed=0) │   │ (component:   │   │ (by hash)   │   │   │
│   │   │               │   │  category)    │   │             │   │   │
│   │   └───────────────┘   └───────────────┘   └──────┬──────┘   │   │
│   └──────────────────────────────────────────────────┼──────────┘   │
│                                                      │              │
│                                                      ▼              │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    Telemetry Reporter                       │   │
│   │                                                             │   │
│   │   ┌───────────────┐   ┌───────────────┐   ┌─────────────┐   │   │
│   │   │ Rate Limiter  │──►│ PII Scrubber  │──►│ HTTP POST   │   │   │
│   │   │ (1/ISIN/day)  │   │ (Tokens, PII) │   │ /report     │   │   │
│   │   └───────────────┘   └───────────────┘   └──────┬──────┘   │   │
│   └──────────────────────────────────────────────────┼──────────┘   │
│                                                      │              │
│                                                      ▼              │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                   Cloudflare Worker                         │   │
│   │                                                             │   │
│   │   ┌───────────────┐   ┌───────────────┐   ┌─────────────┐   │   │
│   │   │ Search GitHub │──►│ Issue Exists? │──►│ Create or   │   │   │
│   │   │ (by hash)     │   │               │   │ Comment     │   │   │
│   │   └───────────────┘   └───────────────┘   └──────┬──────┘   │   │
│   └──────────────────────────────────────────────────┼──────────┘   │
│                                                      │              │
│                                                      ▼              │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                      GitHub Issues                          │   │
│   │                                                             │   │
│   │   Issue #42: [CRASH] Database connection failed             │   │
│   │   ├── Body: Error details + <!-- error_hash: abc123 -->     │   │
│   │   └── Comments: "Additional occurrence from user X"         │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Error Capture Flow

Errors are captured at multiple layers and funneled into SQLite with rich metadata.

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Error Capture Points                          │
│                                                                     │
│   Python Layer                          React Layer                 │
│   ────────────                          ───────────                 │
│                                                                     │
│   ┌─────────────────┐                   ┌─────────────────┐         │
│   │ sys.excepthook  │                   │ ErrorBoundary   │         │
│   │ (Unhandled)     │                   │ (Component)     │         │
│   └────────┬────────┘                   └────────┬────────┘         │
│            │                                     │                  │
│   ┌────────▼────────┐                   ┌────────▼────────┐         │
│   │ logger.error()  │                   │ window.onerror  │         │
│   │ (Explicit)      │                   │ (Global)        │         │
│   └────────┬────────┘                   └────────┬────────┘         │
│            │                                     │                  │
│            │                                     │                  │
│            └──────────────┬──────────────────────┘                  │
│                           │                                         │
│                           ▼                                         │
│            ┌──────────────────────────────┐                         │
│            │      SQLiteLogHandler        │                         │
│            │                              │                         │
│            │  1. Format message           │                         │
│            │  2. Apply PII filter         │                         │
│            │  3. Auto-categorize          │                         │
│            │  4. Calculate error_hash     │                         │
│            │  5. INSERT into system_logs  │                         │
│            └──────────────────────────────┘                         │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Auto-Categorization Logic

The `SQLiteLogHandler` automatically assigns `component` and `category` based on logger name and error type.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Auto-Categorization Rules                        │
│                                                                     │
│   Logger Name Pattern          Component        Category            │
│   ───────────────────          ─────────        ────────            │
│                                                                     │
│   tr_bridge, tr_auth      ──►  integrations     api_error           │
│   database, schema        ──►  data             data_corruption     │
│   scraper, adapter        ──►  integrations     scraper_failed      │
│   resolver                ──►  pipeline         isin_resolution     │
│   (with exc_info)         ──►  (any)            crash               │
│   (default)               ──►  pipeline         general             │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    Example Mapping                          │   │
│   │                                                             │   │
│   │   logger.error("TR API timeout", exc_info=True)             │   │
│   │         │                                                   │   │
│   │         ▼                                                   │   │
│   │   ┌─────────────────────────────────────────────────────┐   │   │
│   │   │ component: "integrations"                           │   │   │
│   │   │ category:  "crash"  (exc_info overrides api_error)  │   │   │
│   │   │ error_hash: "a1b2c3d4..."                           │   │   │
│   │   └─────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Error Hash Calculation

Stable hashing enables deduplication across users and sessions.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Error Hash Algorithm                           │
│                                                                     │
│   Input: LogRecord                                                  │
│          │                                                          │
│          ▼                                                          │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                  Has Exception Info?                        │   │
│   └─────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│              ┌──────────────┴──────────────┐                        │
│              │                             │                        │
│              ▼ YES                         ▼ NO                     │
│   ┌─────────────────────┐       ┌─────────────────────┐             │
│   │ Extract Traceback   │       │ Use Formatted Msg   │             │
│   │ (first 500 chars)   │       │                     │             │
│   └──────────┬──────────┘       └──────────┬──────────┘             │
│              │                             │                        │
│              ▼                             │                        │
│   ┌─────────────────────┐                  │                        │
│   │ Normalize Addresses │                  │                        │
│   │ 0x12345678 → 0xADDR │                  │                        │
│   └──────────┬──────────┘                  │                        │
│              │                             │                        │
│              └──────────────┬──────────────┘                        │
│                             │                                       │
│                             ▼                                       │
│              ┌─────────────────────────────┐                        │
│              │ seed = f"{level}:{content}" │                        │
│              └──────────────┬──────────────┘                        │
│                             │                                       │
│                             ▼                                       │
│              ┌─────────────────────────────┐                        │
│              │ hash = MD5(seed).hexdigest()│                        │
│              └─────────────────────────────┘                        │
│                                                                     │
│   Result: "a1b2c3d4e5f6..." (32 char hex string)                    │
│                                                                     │
│   Properties:                                                       │
│   • Same error → Same hash (across users/sessions)                  │
│   • Memory addresses normalized (stable across runs)                │
│   • First 500 chars of traceback (ignores minor code changes)       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Sentinel Startup Audit

On each app startup, the Sentinel audits the previous session's errors.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Sentinel Startup Sequence                        │
│                                                                     │
│   [App Starts]                                                      │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              prism_headless.py                              │   │
│   │                                                             │   │
│   │   @app.on_event("startup")  OR  run_stdin_loop()            │   │
│   │        │                                                    │   │
│   │        ▼                                                    │   │
│   │   asyncio.create_task(audit_previous_session())             │   │
│   │        │                                                    │   │
│   │        │  (Non-blocking, runs in background)                │   │
│   │        │                                                    │   │
│   └────────┼────────────────────────────────────────────────────┘   │
│            │                                                        │
│            ▼                                                        │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              sentinel.py: audit_previous_session()          │   │
│   │                                                             │   │
│   │   1. await asyncio.sleep(5)  # Let app stabilize            │   │
│   │        │                                                    │   │
│   │   2. Query: SELECT * FROM system_logs                       │   │
│   │             WHERE processed = 0                             │   │
│   │             AND level IN ('ERROR', 'CRITICAL')              │   │
│   │        │                                                    │   │
│   │   3. Group by component:category                            │   │
│   │        │                                                    │   │
│   │        ▼                                                    │   │
│   │   ┌─────────────────────────────────────────────────────┐   │   │
│   │   │ Batches:                                            │   │   │
│   │   │   integrations:api_error    → [log1, log2]          │   │   │
│   │   │   pipeline:crash            → [log3]                │   │   │
│   │   │   data:data_corruption      → [log4, log5, log6]    │   │   │
│   │   └─────────────────────────────────────────────────────┘   │   │
│   │        │                                                    │   │
│   │   4. For each batch: telemetry.report_error(...)            │   │
│   │        │                                                    │   │
│   │   5. mark_logs_processed(log_ids)                           │   │
│   │                                                             │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. Telemetry Rate Limiting

Prevents spam by limiting reports per ISIN per day.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Rate Limiting Strategy                          │
│                                                                     │
│   State File: ~/.prism/.telemetry_state.json                        │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ {                                                           │   │
│   │   "session_id": "a0625c73",                                 │   │
│   │   "reported_isins": {                                       │   │
│   │     "adapter_not_found:US1234567890": "2025-12-22",         │   │
│   │     "api_error:DE0001234567": "2025-12-22"                  │   │
│   │   },                                                        │   │
│   │   "daily_count": { "2025-12-22": 5 }                        │   │
│   │ }                                                           │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Decision Flow:                                                    │
│                                                                     │
│   report_error(category, isin, ...)                                 │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              _should_report(category, isin)                 │   │
│   │                                                             │   │
│   │   key = f"{category}:{isin}"                                │   │
│   │                                                             │   │
│   │   if key in reported_isins:                                 │   │
│   │       if reported_isins[key] == today:                      │   │
│   │           return False  # Already reported today            │   │
│   │                                                             │   │
│   │   if daily_count[today] >= MAX_DAILY_REPORTS:               │   │
│   │       return False  # Daily limit reached                   │   │
│   │                                                             │   │
│   │   return True  # OK to report                               │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 7. Cloudflare Worker Deduplication

Server-side deduplication using GitHub's search API.

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker: /report                         │
│                                                                     │
│   POST /report                                                      │
│   {                                                                 │
│     "type": "crash",                                                │
│     "title": "[CRASH] Database connection failed",                  │
│     "message": "Error details...",                                  │
│     "labels": ["crash", "auto-report"],                             │
│     "error_hash": "a1b2c3d4e5f6..."                                 │
│   }                                                                 │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │              handleReport(body, env)                        │   │
│   │                                                             │   │
│   │   1. findExistingIssue(error_hash, env)                     │   │
│   │        │                                                    │   │
│   │        ▼                                                    │   │
│   │   ┌─────────────────────────────────────────────────────┐   │   │
│   │   │ GitHub Search API:                                  │   │   │
│   │   │                                                     │   │   │
│   │   │ GET /search/issues?q=                               │   │   │
│   │   │     repo:owner/repo                                 │   │   │
│   │   │     is:issue                                        │   │   │
│   │   │     is:open                                         │   │   │
│   │   │     "a1b2c3d4e5f6"                                  │   │   │
│   │   │                                                     │   │   │
│   │   │ Searches issue body for the hash in HTML comment:   │   │   │
│   │   │ <!-- error_hash: a1b2c3d4e5f6 -->                   │   │   │
│   │   └─────────────────────────────────────────────────────┘   │   │
│   │        │                                                    │   │
│   │        ▼                                                    │   │
│   │   ┌─────────────────────────────────────────────────────┐   │   │
│   │   │              Issue Found?                           │   │   │
│   │   └─────────────────────────┬───────────────────────────┘   │   │
│   │                             │                               │   │
│   │              ┌──────────────┴──────────────┐                │   │
│   │              │                             │                │   │
│   │              ▼ YES                         ▼ NO             │   │
│   │   ┌─────────────────────┐       ┌─────────────────────┐     │   │
│   │   │ addIssueComment()   │       │ createGitHubIssue() │     │   │
│   │   │                     │       │                     │     │   │
│   │   │ POST /issues/42/    │       │ POST /issues        │     │   │
│   │   │      comments       │       │                     │     │   │
│   │   │                     │       │ Body includes:      │     │   │
│   │   │ "Additional         │       │ <!-- error_hash:    │     │   │
│   │   │  occurrence..."     │       │  a1b2c3d4e5f6 -->   │     │   │
│   │   └──────────┬──────────┘       └──────────┬──────────┘     │   │
│   │              │                             │                │   │
│   │              ▼                             ▼                │   │
│   │   { status: "updated" }       { status: "created" }         │   │
│   │                                                             │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. GitHub Issue Structure

How issues are formatted for maximum usefulness.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    GitHub Issue Format                              │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ Title: [CRASH] Database connection failed                   │   │
│   │                                                             │   │
│   │ Labels: crash, auto-report, pipeline                        │   │
│   ├─────────────────────────────────────────────────────────────┤   │
│   │ Body:                                                       │   │
│   │                                                             │   │
│   │ ## Error Details                                            │   │
│   │                                                             │   │
│   │ **Component:** data                                         │   │
│   │ **Category:** data_corruption                               │   │
│   │ **Session:** a0625c73                                       │   │
│   │                                                             │   │
│   │ ```                                                         │   │
│   │ sqlite3.OperationalError: database is locked                │   │
│   │   File "database.py", line 42, in get_connection            │   │
│   │   File "pipeline.py", line 100, in run                      │   │
│   │ ```                                                         │   │
│   │                                                             │   │
│   │ ## Context                                                  │   │
│   │                                                             │   │
│   │ | Field     | Value           |                             │   │
│   │ |-----------|-----------------|                             │   │
│   │ | Version   | 0.1.0           |                             │   │
│   │ | Platform  | macOS 14.2      |                             │   │
│   │ | Timestamp | 2025-12-22 18:30|                             │   │
│   │                                                             │   │
│   │ ---                                                         │   │
│   │ *Auto-reported by Portfolio Prism Sentinel*                 │   │
│   │                                                             │   │
│   │ <!-- error_hash: a1b2c3d4e5f6g7h8i9j0 -->                   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Subsequent occurrences add comments:                              │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ Comment #1:                                                 │   │
│   │                                                             │   │
│   │ ## Additional Occurrence                                    │   │
│   │                                                             │   │
│   │ Same error reported from another session.                   │   │
│   │ Session: b1c2d3e4                                           │   │
│   │ Timestamp: 2025-12-23 09:15                                 │   │
│   │                                                             │   │
│   │ *Auto-updated by Portfolio Prism Sentinel*                  │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 9. Telemetry Mode Settings

User-controlled privacy settings in the Health dashboard.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Telemetry Mode Options                           │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    Health Dashboard UI                      │   │
│   │                                                             │   │
│   │   ┌─────────┐  ┌─────────┐  ┌─────────┐                     │   │
│   │   │  AUTO   │  │ REVIEW  │  │   OFF   │                     │   │
│   │   │ [████]  │  │ [    ]  │  │ [    ]  │                     │   │
│   │   └─────────┘  └─────────┘  └─────────┘                     │   │
│   │                                                             │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Mode Behaviors:                                                   │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                                                             │   │
│   │   AUTO                                                      │   │
│   │   ────                                                      │   │
│   │   • Errors captured → SQLite                                │   │
│   │   • Next startup → Auto-report to GitHub                    │   │
│   │   • No user interaction required                            │   │
│   │   • ErrorBoundary auto-sends crash reports                  │   │
│   │                                                             │   │
│   │   REVIEW                                                    │   │
│   │   ──────                                                    │   │
│   │   • Errors captured → SQLite                                │   │
│   │   • Next startup → Queue for review                         │   │
│   │   • User sees "N Reports Waiting for Review"                │   │
│   │   • User can: Send All | Dismiss All | Review Each          │   │
│   │                                                             │   │
│   │   OFF                                                       │   │
│   │   ───                                                       │   │
│   │   • Errors captured → SQLite (for local debugging)          │   │
│   │   • No reporting to GitHub                                  │   │
│   │   • Sentinel skips audit on startup                         │   │
│   │                                                             │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Data Flow Summary

Complete end-to-end flow from error to GitHub issue.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Complete Data Flow                               │
│                                                                     │
│   SESSION 1 (Error Occurs)                                          │
│   ─────────────────────────                                         │
│                                                                     │
│   [Error] ──► [SQLiteLogHandler] ──► [system_logs]                  │
│                     │                     │                         │
│                     │ Auto-categorize     │ processed=0             │
│                     │ Calculate hash      │ error_hash=abc123       │
│                     ▼                     │                         │
│               component: data             │                         │
│               category: crash             │                         │
│                                           │                         │
│   [App Closes]                            │                         │
│                                           │                         │
│   ─────────────────────────────────────────────────────────────     │
│                                                                     │
│   SESSION 2 (Next Startup)                                          │
│   ────────────────────────                                          │
│                                           │                         │
│   [App Starts] ──► [Sentinel]  ◄──────────┘                         │
│                        │                                            │
│                        │ Query unprocessed                          │
│                        │ Group by type                              │
│                        │ Check telemetry_mode                       │
│                        ▼                                            │
│                   ┌─────────┐                                       │
│                   │  AUTO?  │                                       │
│                   └────┬────┘                                       │
│                        │                                            │
│           ┌────────────┼────────────┐                               │
│           │            │            │                               │
│           ▼            ▼            ▼                               │
│        [AUTO]      [REVIEW]      [OFF]                              │
│           │            │            │                               │
│           │            │            └──► (Skip)                     │
│           │            │                                            │
│           │            └──► [Queue for UI]                          │
│           │                                                         │
│           ▼                                                         │
│   [Telemetry.report_error()]                                        │
│           │                                                         │
│           │ Rate limit check                                        │
│           │ PII scrub                                               │
│           ▼                                                         │
│   [POST /report] ──► [Cloudflare Worker]                            │
│                              │                                      │
│                              │ Search GitHub                        │
│                              │ Deduplicate                          │
│                              ▼                                      │
│                      [GitHub Issue]                                 │
│                              │                                      │
│                              │ created OR updated                   │
│                              ▼                                      │
│   [Mark processed=1, reported_at=NOW()]                             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 11. Configuration Requirements

What needs to be set up for Echo-Sentinel to work.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Configuration Checklist                          │
│                                                                     │
│   Cloudflare Worker                                                 │
│   ─────────────────                                                 │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ cd infrastructure/cloudflare                                │   │
│   │                                                             │   │
│   │ # Set secrets                                               │   │
│   │ wrangler secret put GITHUB_TOKEN                            │   │
│   │ # (Paste token with 'repo' scope)                           │   │
│   │                                                             │   │
│   │ wrangler secret put GITHUB_REPO                             │   │
│   │ # (Enter: owner/repo, e.g., Skeptomenos/Portfolio-Prism)    │   │
│   │                                                             │   │
│   │ # Deploy                                                    │   │
│   │ wrangler deploy                                             │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Python Engine (Optional)                                          │
│   ────────────────────────                                          │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ # If using custom worker URL:                               │   │
│   │ export PROXY_URL="https://your-worker.workers.dev"          │   │
│   │                                                             │   │
│   │ # To disable telemetry entirely:                            │   │
│   │ export TELEMETRY_ENABLED="false"                            │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│   Status Without Configuration                                      │
│   ────────────────────────────                                      │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ If worker is not deployed:                                  │   │
│   │                                                             │   │
│   │ ✓ Errors still captured locally (SQLite)                    │   │
│   │ ✓ Sentinel still runs and batches                           │   │
│   │ ✓ Reports cached in .telemetry_state.json                   │   │
│   │ ✗ No GitHub issues created                                  │   │
│   │                                                             │   │
│   │ → Deploy worker when ready, cached reports will be sent     │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 12. File Reference

Key files implementing Echo-Sentinel.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        File Reference                               │
│                                                                     │
│   Python (src-tauri/python/)                                        │
│   ──────────────────────────                                        │
│                                                                     │
│   portfolio_src/prism_utils/                                        │
│   ├── logging_config.py      # SQLiteLogHandler, PIIFilter          │
│   ├── sentinel.py            # audit_previous_session()             │
│   └── telemetry.py           # Telemetry class, rate limiting       │
│                                                                     │
│   portfolio_src/data/                                               │
│   ├── database.py            # log_system_event(), get_unprocessed  │
│   └── schema.sql             # system_logs table definition         │
│                                                                     │
│   prism_headless.py          # Startup hooks, global_exception_handler│
│                                                                     │
│   TypeScript (src/)                                                 │
│   ─────────────────                                                 │
│                                                                     │
│   store/useAppStore.ts       # telemetryMode, sessionId             │
│   components/common/ErrorBoundary.tsx  # React error capture        │
│   components/views/HealthView.tsx      # Telemetry settings UI      │
│   lib/ipc.ts                 # logEvent(), getRecentReports()       │
│                                                                     │
│   Infrastructure                                                    │
│   ──────────────                                                    │
│                                                                     │
│   infrastructure/cloudflare/                                        │
│   ├── worker.js              # /report endpoint, deduplication      │
│   └── wrangler.toml          # Worker configuration                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```
