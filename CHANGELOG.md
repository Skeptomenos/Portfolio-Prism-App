# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Trade Republic 2FA login integration via subprocess daemon architecture
- TR daemon protocol for JSON-RPC communication over stdin/stdout
- Session persistence via pytr native cookie storage
- Compatibility layer for pytr v0.4.2 method name typo

### Changed
- Binary size increased to ~105MB (added pytr, keyring, supabase dependencies)
- Repository flattened to standard Tauri layout (moved from `tauri-app/` to root)

### Fixed
- Resolved `RuntimeError: There is no current event loop` by isolating pytr in subprocess
- Fixed pytr `inititate_weblogin` typo compatibility (v0.4.2)

### Documentation
- Added `docs/PLAN_TR_DAEMON.md` - Original daemon architecture plan
- Added `docs/PLAN_TR_DAEMON_BINARY.md` - Separate binary plan for frozen mode

---

## [0.1.0] - 2024-12-07

### Added
- Initial Tauri + Python sidecar integration
- PyInstaller bundled Streamlit dashboard
- POC analytics engine transplanted to `portfolio_src/`
- Dynamic port binding for sidecar
- Dead man's switch for process cleanup
