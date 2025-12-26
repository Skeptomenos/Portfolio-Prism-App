# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **Hive Data Flow Fix:** Resolved 0% Hive hit rate caused by `sync_universe()` querying non-existent `master_view`.
  - `sync_universe()` now uses `get_all_assets_rpc` and `get_all_listings_rpc` (RLS bypass).
  - `get_etf_holdings()` now uses new `get_etf_holdings_rpc` function.
  - `HiveEnrichmentService` now checks `LocalCache` first before `HiveClient.batch_lookup()`.
  - Added `aliases` table to `schema.sql` for documentation completeness.

### Changed

- **Supabase Folder Consolidation:** Merged `infrastructure/supabase/` into `supabase/` (Supabase CLI standard).
  - Single source of truth for schema, functions, and migrations.
  - `functions.sql` now includes all bulk sync RPCs (355 lines).
  - Updated 8 documentation files to reference new paths.
  - Deprecated `community_sync.py` references in legacy `reference_dashboard/`.

### Added

- **Hive Extension (Phases 0-4):** Complete ISIN resolution infrastructure for X-Ray pipeline.
  - Phase 0: `aliases` table + 7 RPC functions with `SECURITY DEFINER` for RLS bypass.
  - Phase 1: HiveClient read methods (`resolve_ticker`, `batch_resolve_tickers`, `lookup_by_alias`).
  - Phase 2: LocalCache SQLite for offline-capable resolution.
  - Phase 3: ISINResolver dual-path refactor with `USE_LEGACY_CSV` feature flag.
  - Phase 4: Decomposer wiring - ISINResolver injected into ETF decomposition pipeline.
  - 63 unit tests covering all new functionality.

### Changed

- **Framework Migration:** Migrated from Anamnesis to **Keystone v4.4** framework.
- **Directory Restructuring:** Renamed `anamnesis/` to `keystone/` and moved project state to `keystone/project/`.
- **Protocol Upgrade:** Implemented **OODA Loop** for debugging and **First Principles** for thinking.

### Performance

- **ISIN Resolution:** Reduced decomposition time from 97s to 0.1s per ETF (970x improvement) by skipping Hive network calls for tier2 holdings.

### Added

- **Echo-Sentinel:** Zero-effort crash reporting system with privacy-first design.
  - Auto-captures Python (`sys.excepthook`) and React (`ErrorBoundary`) errors to SQLite.
  - Auto-categorizes errors by component (integrations, data, pipeline) and category (api_error, crash, etc.).
  - Calculates stable `error_hash` for deduplication across users/sessions.
  - Sentinel audits previous session on startup, batches errors, and reports to GitHub.
  - Cloudflare Worker `/report` endpoint with server-side deduplication (searches existing issues by hash).
  - Telemetry settings UI in Health dashboard (Auto/Review/Off modes).
  - Architecture documented in `keystone/architecture/ECHO_SENTINEL_ARCHITECTURE.md`.
- **Global Feedback Modal:** Refactored feedback dialog to a root-level modal with automatic view context injection.
- **Tailwind v3 Stability:** Aligned dependencies with stable v3.4.17 to resolve build failures.
- **GitHub Actions CI/CD:** Automated build pipeline for macOS DMG release (`.github/workflows/release.yml`).
- **Portfolio Chart:** 30-day value history chart with gradient area fill (`PortfolioChart.tsx`).
- **Sparklines:** Mini-charts for "Day Change" and "Total Value" cards.
- **History Manager:** Python backend service for calculating historical portfolio values (T-30).

---

## [0.1.0] - 2024-12-19

### Added

- Trade Republic 2FA login integration via subprocess daemon architecture
- TR daemon protocol for JSON-RPC communication over stdin/stdout
- Session persistence via pytr native cookie storage
- Compatibility layer for pytr v0.4.2 method name typo
- Initial Tauri + Python sidecar integration
- PyInstaller bundled Streamlit dashboard
- PII Scrubbing for logs
- Hive (Supabase) Sync Client

### Changed

- Binary size optimized (~90MB)
- Repository flattened to standard Tauri layout

### Fixed

- Resolved `RuntimeError: There is no current event loop` by isolating pytr in subprocess
- Fixed binary startup hang on macOS ARM64 using `collect_submodules`
- Fixed PII leakage in logs (IBAN/Phone/Email scrubbing)

### Added

- Initial Tauri + Python sidecar integration
- PyInstaller bundled Streamlit dashboard
- POC analytics engine transplanted to `portfolio_src/`
- Dynamic port binding for sidecar
- Dead man's switch for process cleanup
