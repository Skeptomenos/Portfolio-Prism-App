# Logging Standards (2026)

> **Classification: Superseded — V1 only.** Archived 2026-09-07.
> Read when: Retained to explain prior decisions and unfinished V1 work. Follow the current project plan and instructions for V2.
> Current authority: [project index](../../../index.md) and [V2 runtime contracts](../../../v2/README.md). Original requirements, commands, status and paths below are historical; they do not govern V2.

> **Mandate:** Logs must be machine-readable (JSON) and filterable (Levels).

## 1. The "No Console" Rule
- **Problem:** `console.log` prints unstructured text.
  - Hard to parse in Datadog/CloudWatch.
  - No "Level" (Debug vs Error).
  - No metadata (User ID, Request ID).
- **Rule:** `console.log`, `console.error`, `console.warn` are **FORBIDDEN** in backend/production code.

## 2. Best Practice: Structured Logging
Use a library that outputs **JSON objects**.

### Recommended Libraries
1.  **Pino (Node.js/Backend):**
    - *Why:* Fastest logger. Native JSON.
    - *Usage:* `logger.info({ userId: '123' }, 'User logged in')`
2.  **Consola (Frontend/Fullstack):**
    - *Why:* Browser-friendly, nice CLI output in dev, JSON in prod.

### The JSON Standard
Your logs should look like this:
```json
{
  "level": "error",
  "time": 1678888888,
  "msg": "Database connection failed",
  "context": {
    "requestId": "req_123",
    "dbHost": "localhost",
    "error": "ConnectionRefused"
  }
}
```

## 3. Log Levels (When to use what)
- **DEBUG:** Verbose details for dev (e.g., "Parsed API response").
- **INFO:** Key events (e.g., "User logged in", "Job started").
- **WARN:** Unexpected but handled (e.g., "Rate limit hit, retrying").
- **ERROR:** Something broke (e.g., "DB query failed"). **Must alert.**
- **FATAL:** App crashed.

## 4. Implementation (Frontend vs Backend)
- **Backend (Server):** Use **Pino**. Capture `requestId` in middleware and attach to every log.
- **Frontend (Client):** Use a wrapper (e.g., `logger.error`).
  - *Dev:* Print nicely to console.
  - *Prod:* Send critical errors to Sentry/PostHog (do not just print to user console).

## 5. ⚠️ Negative Patterns
- **NO** logging Sensitive Data (Passwords, Tokens). Use `{ redshift: ['password'] }`.
- **NO** `JSON.stringify(error)`. Log the raw Error object so stack traces are preserved.
