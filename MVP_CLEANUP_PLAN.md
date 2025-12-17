# MVP Transition & Cleanup Plan

**Status:** Approved
**Date:** 2025-12-17
**Objective:** Finalize the MVP transition by removing legacy code, consolidating the build system, and synchronizing documentation.

## 🧹 Phase 1: Cleanup (Remove Dead Code)
**Goal:** Eliminate redundant scripts and abandoned prototypes that confuse the development process.

1.  **Remove Legacy Build Scripts**
    *   Delete `scripts/build-daemon.sh` (Redundant; functionality covered by `build-python.sh`).
        *   **Confidence: 100%** - Script fails on execution (references missing `venv-build`).
    *   Delete `src-tauri/python/requirements-build.txt` (Superseded by `pyproject.toml`).
        *   **Confidence: 100%** - All dependencies verified present in `pyproject.toml`.
2.  **Remove Legacy Source Code**
    *   Delete `src-legacy/` (Old frontend).
        *   **Confidence: 100%** - Current app resides in `src/`.
    *   Delete `v2-ui/` (Abandoned React prototype).
        *   **Confidence: 100%** - Not referenced in `tauri.conf.json`, `package.json`, or `vite.config.ts`.
    *   Delete `src-tauri/python/prism_boot.py` (Streamlit loader).
        *   **Confidence: 95%** - App uses `prism_headless.py`. Minor risk if `prism.spec` is somehow used for debugging, but generally obsolete.
    *   Delete `src-tauri/python/prism.spec` (Legacy build spec).
        *   **Confidence: 95%** - We only build `prism_headless` and `tr_daemon` now.
3.  **Clean Dependencies**
    *   Delete `src-tauri/python/requirements-build.txt` if it still exists.
        *   **Confidence: 100%** - Redundant.

## ⚙️ Phase 2: Configuration & Consolidation
**Goal:** Specific the build configuration to reflect the "Headless + Daemon" architecture.

1.  **Update Tauri Config**
    *   Edit `src-tauri/tauri.conf.json`:
        *   Remove `binaries/prism` from `bundle.externalBin`.
            *   **Confidence: 95%** - Binary is not built by valid scripts anymore.
        *   Ensure `binaries/prism-headless` and `binaries/tr-daemon` are present.
2.  **Update Build Automation**
    *   Edit `package.json`:
        *   Add `"build:python": "bash scripts/build-python.sh"` to `scripts`.
        *   Update `"tauri": "tauri"` to ensure it doesn't rely on implicit global state.

## 🏗️ Phase 3: Verification
**Goal:** Ensure the cleaned-up project builds and runs correctly.

1.  **Rebuild Binaries**
    *   Run `npm run build:python` (Testing the new script alias).
    *   Verify `src-tauri/binaries/` contains:
        *   `prism-headless-aarch64-apple-darwin`
        *   `tr-daemon-aarch64-apple-darwin`
2.  **Launch Application**
    *   Run `npm run tauri dev`.
    *   Confirm app launch and successful sidecar connection.

## 📚 Phase 4: Documentation Sync
**Goal:** Update project status to reflect MVP completion.

1.  **Update Mission**
    *   Update `anamnesis/.context/mission.md`:
        *   Mark Phase 4 as **Done**.
        *   Set current focus to "Phase 5: Polish & Security".
2.  **Update Board**
    *   Update `anamnesis/.context/board.md` to reflect the cleanup tasks.
