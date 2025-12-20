# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
