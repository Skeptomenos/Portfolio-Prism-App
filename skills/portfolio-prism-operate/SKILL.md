---
name: portfolio-prism-operate
description: Run Portfolio Prism V2, inspect saved portfolio coverage and diagnostics, or verify a local instance through supported commands and read APIs without handling broker credentials.
---

# Operate Portfolio Prism

Establish which instance and data directory the user intends to operate. Report saved amounts, dates, gaps and next actions together.

## Route

1. Locate the project root containing `v2/` and `CONTRIBUTING.md`. Read `v2/README.md` for current runtime commands. The public checkout works without `_planning` or private captures.
2. For a credential-free demonstration or environment check, follow [the SDK synthetic journey](../../docs/plugin-sdk.md#run-the-synthetic-source-to-panel-journey). It uses a new temporary SQLite database and a loopback port. Do not point it at a real portfolio.
3. For the user's application, identify the exact loopback origin and `PRISM_V2_DATA_DIR` before starting another process. Do not silently reuse another running instance's database or port. The README owns startup and copied-data preview procedures.
4. Read supported `/api/financial/overview`, `/api/financial/exposure`, `/api/financial/coverage`, `/api/financial/diagnostics` or `/api/connections` on that confirmed origin. Prefer the typed clients in `v2/sdk/browser.ts`; [financial-view contract](../../docs/financial-view-contract.md) owns response semantics. These reads may contain private financial facts: keep outputs local and summarize only what is needed.
5. For login or session approval, direct the user to the application's Trade Republic login controls. The user enters credentials themselves. Never request, log, copy or automate their password, PIN, approval code or stored session material.
6. For an authorized refresh, use the app's explicit sync/refresh controls and observe status, last-success dates and correlated diagnostics. Do not treat a read request as refresh permission. `PRISM_V2_OFFLINE=1` suppresses automatic work, but explicit UI controls still perform writes/network operations.
7. On failure, retain saved data. Report the operation/diagnostic reference, safe classification and resolution path, plus which holdings/quotes/compositions remain old or unknown. Never paste raw broker errors or source payloads into a public report.

## Done means

- The requested instance and operation are identified; no unrelated instance or database changed.
- Saved values and coverage gaps are visible with their original dates. Unknown is not zero; synthetic compatibility is not live broker acceptance.
- Hand back the commands/read routes used, observed result and any remaining user-operated login or source gate. Do not claim reconciliation or returns from source connectivity.
