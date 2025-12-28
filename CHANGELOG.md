# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Atomic JSON Write Fix:**
  - Added `write_json_atomic()` utility function using temp file + rename pattern.
  - Updated `pipeline.py` to use atomic write for `pipeline_health.json`.
  - Updated `health.py` to use atomic write for JSON state.
  - Prevents file corruption if process is interrupted mid-write.
  - Fixes issues #12, #13 (truncated JSON causing cascading failures).

- **HealthView Null Safety Fix:**
  - Added `SystemLogReport` type for telemetry data with proper nullable fields.
  - Fixed crash when `report.category` is null (now displays "UNKNOWN").
  - Fixed "Invalid Date" when `report.reported_at` is null (now displays "N/A").
  - Fixed undefined display when `report.component` is null (now displays "unknown").
  - Updated `getRecentReports()` return type from `any[]` to `SystemLogReport[]`.

- **ResolutionTable Type Cleanup:**
  - Added `weight_sum` to `ETFResolutionDetail` type (matches backend output).
  - Removed dead `etf_stats` legacy field from `PipelineHealthReport`.
  - Removed legacy fallback and `as any` casts in ResolutionTable.tsx.
  - Fixed 5 TypeScript errors that were blocking the build.

- **Identity Resolution Phase 6C - UI Integration:**
  - Integrated ResolutionHealthCard, NeedsAttentionSection, and FilterBar into HoldingsView.
  - Added ResolutionStatusBadge to holdings list items and decomposition panel.
  - Added filter/sort/search state management with useMemo for performance.
  - Updated IPC types: `getTrueHoldings()` now returns typed `TrueHoldingsResponse`.
  - Added keyboard accessibility to GlassCard (role, tabIndex, onKeyDown for Enter/Space).
  - Added resolution details section in decomposition panel (ISIN, confidence, source).

- **Identity Resolution Phase 5 - Format Logging (Observability):**
  - Added `detect_format()` to `TickerParser` to classify tickers (bloomberg, reuters, yahoo_dash, numeric, plain).
  - Added `format_logs` table to LocalCache for tracking resolution attempts by format and API source.
  - Integrated logging into `_resolve_via_api()` to capture success/failure rates for Finnhub and yFinance.
  - Added 14 unit tests in `test_resolution_phase5.py` covering format detection and logging infrastructure.

- **Identity Resolution Phase 4 - Per-Holding Provenance:**
  - Added `resolution_source` and `resolution_confidence` columns to holdings DataFrames.
  - Decomposer stores provenance for all resolution outcomes: existing ISINs (provider/1.0), resolved (source/confidence from result), skipped (None/0.0), unresolved (None/0.0).
  - Enrichment stores provenance and preserves existing provenance when skipping resolution.
  - Aggregator preserves provenance during groupby: takes max confidence, maps source from max-confidence row.
  - Grouping preserves provenance with same max-confidence pattern.
  - Added 18 unit tests in `test_resolution_phase4.py` covering provenance storage, confidence values, aggregation, and backward compatibility.

- **Identity Resolution Phase 3 - Persistent Negative Cache:**
  - Added `isin_cache` table to LocalCache SQLite schema for persistent resolution caching.
  - Added LocalCache methods: `get_isin_cache()`, `set_isin_cache()`, `is_negative_cached()`, `cleanup_expired_cache()`.
  - Replaced in-memory negative cache with SQLite-backed cache (survives app restarts).
  - Added TTL constants per spec: 24 hours for unresolved, 1 hour for rate-limited entries.
  - Added `_call_finnhub_with_status()` to track rate limit responses.
  - Added `_cache_positive_result()` to cache successful API resolutions.
  - Removed legacy `enrichment_cache.json` loading (CACHE_PATH, `_load_cache()`, `self.cache`).
  - Added 20 unit tests in `test_resolution_phase3.py` covering cache schema, positive/negative caching, expiration, and legacy removal.

- **Identity Resolution Phase 2 - API Cascade Reorder & Confidence Scoring:**
  - Added `confidence` field to `ResolutionResult` dataclass (0.0-1.0 scale).
  - Added confidence constants: `CONFIDENCE_PROVIDER` (1.0), `CONFIDENCE_LOCAL_CACHE` (0.95), `CONFIDENCE_HIVE` (0.90), `CONFIDENCE_MANUAL` (0.85), `CONFIDENCE_WIKIDATA` (0.80), `CONFIDENCE_FINNHUB` (0.75), `CONFIDENCE_YFINANCE` (0.70).
  - Reordered API cascade: Wikidata (free) → Finnhub (rate-limited) → yFinance (unreliable).
  - Added batched Wikidata SPARQL queries using VALUES clause for efficient multi-variant lookups.
  - Added in-memory negative cache to prevent repeated API calls for known failures (5-minute TTL).
  - Implemented tiered variant strategy: batch all variants for Wikidata, primary ticker only for Finnhub, top 2 variants for yFinance.
  - Added 16 unit tests covering confidence scores, cascade order, negative cache, and batch Wikidata.

- **Identity Resolution Schema Implementation:** Deployed schema changes to support identity resolution.
  - Supabase `aliases` table: Added 6 new columns (source, confidence, currency, exchange, currency_source, contributor_hash) with constraints.
  - Supabase `assets` table: Added `sector` and `geography` columns.
  - Updated `lookup_alias_rpc` to return 9 columns (was 5).
  - Updated `contribute_alias` to accept 10 parameters (was 4).
  - Local SQLite: Added `isin_cache` table for offline resolution caching with negative cache support.
  - Documentation: Updated `hive-database-schema.md`, `data_schema.md`, `functions.sql`, `schema.sql`.
  - Python client: Added `AliasLookupResult` dataclass, updated `lookup_by_alias` to return rich result, added `lookup_alias_isin` convenience method.

### Changed

- **Specs Consolidation:** Reduced specs directory from 14 to 10 files (-280 lines, 14% reduction).
  - Archived obsolete planning docs (`problem.md`, `options.md`, `requirements.md`) to `specs/archive/`.
  - Merged EARS requirements into `product.md` Section 7.
  - Merged `build_optimization_implementation.md` into `build_optimization.md`.
  - Removed duplicate Hive schema from `data_schema.md` (cross-references Supabase docs).
  - Updated cross-references in `global.md`, `EXECUTION.md`, `README.md`.
- **Plans Archival:** Moved all 28 completed implementation plans to `plans/archive/`.
  - Includes: Hive phases 0-5, Pipeline plans, Echo-Sentinel plans, etc.
  - Deleted `proposals/` directory (contained only obsolete restructure proposal).

### Removed

- **Legacy CSV Resolution:** Removed `AssetUniverse` class and `asset_universe.csv` files.
  - Deleted `USE_LEGACY_CSV` feature flag from config.
  - All ISIN resolution now uses Hive + LocalCache exclusively.
  - Removed CSV references from `migration.py`, `lifecycle.py`, `enrichment.py`.
  - Updated `harvesting.py` to push to Hive instead of CSV.
  - Simplified codebase by ~300 lines.

### Optimization

- **Pipeline Initialization:** Prevented redundant service re-initialization in `Pipeline._init_services` to improve repeated run performance.

### Fixed

- **Sector/Geography Allocation:** Fixed 4653% allocation bug by calculating percentages from `total_exposure` sums instead of summing pre-calculated percentages.
- **UI Progress Bar:** Fixed 0% progress bar issue by normalizing backend progress scale (0.0-1.0) to UI scale (0-100) automatically.
- **Background Sync:** Moved Hive cache synchronization to a background thread in `ISINResolver` to prevent UI freeze on startup.
- **Warning Reporting:** Updated pipeline status to report "completed with warnings" if partial failures occurred (e.g. unresolved ETFs).
- **Pipeline Breakdown Report:** Fixed missing ETF values in breakdown report by adding fallback calculation (quantity * price) when pre-calculated value columns are missing.
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
