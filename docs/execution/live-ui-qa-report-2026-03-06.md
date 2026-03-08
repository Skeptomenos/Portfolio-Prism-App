# Portfolio Prism Live UI QA Report

| Field | Value |
|-------|-------|
| **Date** | 2026-03-06 |
| **App URL** | `http://127.0.0.1:1420` |
| **App Root** | `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism` |
| **Startup Mode** | Persistent handoff shells (`pnpm dev:engine` and `pnpm dev`) |
| **Artifacts** | `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood` |
| **Status** | Completed for this test pass. This document was updated during active testing to survive compaction. |

## Scope

- Real user-authenticated session with Trade Republic
- Live portfolio sync and persisted local database inspection
- Browser-first UI validation across dashboard and top-level routes
- Console and runtime error capture during navigation and interaction

## Working Runtime Process

The reliable local startup path in this environment is:

1. Engine shell:
   `cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism && set -a && source .env && set +a && export UV_CACHE_DIR=/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/.tmp/uv-cache && pnpm dev:engine`
2. Frontend shell:
   `cd /Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism && export TAURI_DEV_HOST=127.0.0.1 && pnpm dev`

`./scripts/codex/dev-up.sh` is useful for one-shot validation but not reliable for browser handoff after the script exits.

## Persistence Check

Real portfolio data is now persisted locally in:

- `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/src-tauri/python/data/prism.db`

Latest verification snapshot:

- `trade_republic | 2026-03-06 17:51:10 | success | Synced 30 positions`
- `assets = 30`
- `positions = 30`
- `transactions = 0`
- `historical_prices = 0`

Current conclusion:

- Latest synced holdings are persisted locally and available without re-pulling immediately on page load.
- The active sync path is not yet persisting transaction history.
- Historical holdings snapshots over time are not yet implemented in the live app path.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 2 |
| Medium | 1 |
| Low | 0 |
| **Total** | **4** |

## Verified Working Surfaces

- Trade Republic sync persists the latest holdings locally in `prism.db`.
- Dashboard renders real portfolio totals and top holdings after sync.
- Holdings list renders real positions, search/filter controls are present, and selecting a holding opens its breakdown panel.
- Feedback dialog opens with category options and a disabled-until-complete submit control.
- X-Ray progress UI starts and the backend pipeline really does run.
- Health `Run Diagnostics` triggers a fresh sync plus analytics pipeline execution on the backend.

## Findings

### ISSUE-001: Auth bootstrap schema rejects valid backend `null` fields and breaks session restore initialization

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional / console |
| **URL** | `http://127.0.0.1:1420/` |
| **Evidence** | `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/issue-auth-schema-console.log` |

**Description**

The frontend logs IPC validation failures during auth bootstrap because saved-session payloads include `null` values for optional fields while the frontend schema expects strings. The visible result is that a previously authenticated state shows a restore prompt, but startup produces validation errors instead of treating the saved data as valid nullable state.

Observed errors:

- `tr_check_saved_session` rejects `phoneNumber: null`
- `tr_get_auth_status` rejects `lastError: null`

Visible symptoms during this run:

- The saved-session screen surfaced the raw error text inline beside the account summary.
- The shell chrome simultaneously showed `Connected` and `Last sync: Never` even though the local database recorded a successful Trade Republic sync.

**Expected**

Saved-session bootstrap should accept nullable backend fields and allow restore-state initialization without console errors.

**Actual**

Bootstrap emits validation errors and the restore path appears brittle/noisy even though a persisted authenticated state exists.

---

### ISSUE-002: X-Ray analysis flow returns to "No Pipeline Data Available" after running deep analysis

| Field | Value |
|-------|-------|
| **Severity** | high |
| **Category** | functional |
| **URL** | `http://127.0.0.1:1420/xray` |
| **Evidence** | `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/xray-before-run.png`, `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/xray-loading.png`, `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/xray-after-run.png` |

**Description**

On the X-Ray route, clicking `Run Deep Analysis` shows a detailed progress UI and opens the SSE progress stream, but the screen still returns to `No Pipeline Data Available` instead of surfacing analysis results for the synced real portfolio. The backend did execute the pipeline and write report files, so the failure is not just "pipeline never ran" but "frontend did not successfully consume/render the report payload."

**Expected**

Running deep analysis should either render report data or show a specific failure reason tied to the pipeline run.

**Actual**

The screen falls back to the empty-state message with no visible result payload.

Observed frontend behavior during this run:

- SSE connected successfully.
- The browser console repeatedly logged `get_pipeline_report` validation failures with `expected number, received undefined`.
- After the pipeline summary event arrived, the UI still returned to the empty state.

Observed backend behavior during the same run:

- The engine logged `Starting analytics pipeline...` and `Pipeline complete`.
- Output files were written to `/Users/david.helmus/Library/Application Support/PortfolioPrism/outputs/`.

---

### ISSUE-003: `get_pipeline_report` contract mismatch breaks Health and Holdings secondary report consumers

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Category** | functional / console |
| **URL** | `http://127.0.0.1:1420/health`, `http://127.0.0.1:1420/holdings` |
| **Evidence** | `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/health-view.png`, `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/holdings-view.png`, `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/frontend-console.log` |

**Description**

The same frontend report-schema problem that breaks X-Ray also affects Health and Holdings. Both views render their main shells, but the browser console shows `get_pipeline_report` validation failures from `HealthView.tsx` and `HoldingsView.tsx`, which means auxiliary report-dependent metrics are not reliably loading.

**Expected**

Health and Holdings should either consume a valid pipeline report or show an explicit degraded-state message tied to the actual backend result.

**Actual**

Health displays stale generic values such as `Never` and `N/A`, while Holdings logs the same report-retrieval failures in the console even though the direct holdings list itself renders.

---
### ISSUE-004: The backend pipeline completes but produces critically untrustworthy analytics for this real portfolio

| Field | Value |
|-------|-------|
| **Severity** | critical |
| **Category** | functional / data quality |
| **URL** | `http://127.0.0.1:1420/xray` |
| **Evidence** | `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/pipeline_health.json`, `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/pipeline_errors.json`, `/Users/david.helmus/repos/ai-dev/apps/Portfolio-Prism/Portfolio-Prism/output/playwright/dogfood/true_exposure_report.csv` |

**Description**

The backend analytics pipeline does execute, but its own health output marks the result as untrustworthy. In this run, all `10` ETF positions failed decomposition with `NO_ADAPTER`, `etfs_processed` was `0`, and aggregation quality was critically wrong.

Key backend output from this run:

- `tier1_failed = 10`
- `etfs_processed = 0`
- `TOTAL_MISMATCH_LARGE`: aggregated total differs from expected by `84.8%`
- `PERCENTAGE_SUM_LOW`: portfolio percentages sum to only `15.2%`
- `quality_score = 0.65`
- `is_trustworthy = false`

**Expected**

The pipeline should either produce trustworthy exposure results for the synced portfolio or stop with a clear blocking failure instead of completing as if analysis succeeded.

**Actual**

The backend reported `Pipeline complete`, wrote result files, and the frontend offered no trustworthy-result warning because it failed earlier on report validation.

---

## Open Test Areas

- Re-test session restore path after fresh reload
- Health toggle persistence (`Auto` / `Review` / `Off`)
- Feedback submission itself with a non-test destination policy
- Full desktop-shell behavior in Tauri instead of browser-only dev mode

## Notes

- The report is intentionally live-edited during the session so findings survive compaction.
- Screenshots and console captures are being persisted under the app repo `output/playwright/dogfood` directory.
- Browser automation in this run used a headless agent session, not the visible browser window the user may have had open.
