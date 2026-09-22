# DEV-280 — phone approval UX

## Delivered behavior

The connection panel follows the backend login attempt through request, phone approval, automatic portfolio import and terminal result. While a login is active, the approval state replaces the phone/PIN form and shows a real status message, a keyboard-accessible cancel action and concise next-step guidance. The badge says **Waiting for approval** during the phone step.

Cancellation, timeout and authentication failures show distinct recovery guidance. A disconnected state keeps the connect form available. A completed login reports successful approval separately from partial downstream valuation or transaction results, and keeps the normal sync action available. The UI does not invent progress, completion or countdown state. Broker auth capabilities and server behavior are unchanged.

## Evidence

Read-only primary diagnostics on 2026-09-22 show that the fresh phone approval succeeded and holdings were saved. The same portfolio attempt ended partial because downstream transaction acquisition remained incomplete. This records the fresh-auth check separately; transaction history and account reconciliation remain open. No credentials, phone details or screenshots were copied. The primary service was not changed, logged out or reactivated.

Synthetic browser coverage checks request, awaiting approval, importing, complete and partial outcomes, cancellation, timeout and authentication failure. It also checks that credentials are absent while approval is pending, terminal failures retain retry access, Tab reaches cancellation, Enter cancels, and the 1280px and 390px layouts have no horizontal overflow. No real broker authentication is performed.

## Verification

- `pnpm --dir v2 check` — passed.
- `pnpm --dir v2 build` — passed.
- `PRISM_V2_URL=http://127.0.0.1:4391 node v2/tests/browser-smoke.mjs` — passed against an isolated Vite preview with synthetic API responses.
- `pnpm --dir v2 test` — passed, 407 tests across 55 files. `tests/broker-connections.test.ts` now compares replay against the exact checkpoint timestamp so its freshness assertion remains deterministic across dates.

Live login acceptance remains read-only evidence only. This UI change has not been activated on primary 4336.
