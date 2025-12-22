# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Framework Migration:** Migrated from Anamnesis to **Keystone v4.4** framework.
- **Directory Restructuring:** Renamed `anamnesis/` to `keystone/` and moved project state to `keystone/project/`.
- **Protocol Upgrade:** Implemented **OODA Loop** for debugging and **First Principles** for thinking.

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
