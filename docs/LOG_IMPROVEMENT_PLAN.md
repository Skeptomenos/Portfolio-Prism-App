# Terminal Log Improvement Plan: Ultimate Overhaul

This document outlines the strategy for transforming the current messy terminal output into a structured, informative, and professional developer experience by combining intelligent log parsing with a high-end CLI orchestrator.

## Current Issues
- **Build Noise:** PyInstaller and UV dump hundreds of lines of internal logs that obscure progress.
- **Runtime Misreporting:** Tauri's Rust shell captures all Python stderr and logs it as `ERROR`, regardless of the actual log level.
- **Visual Chaos:** Lack of consistent colors, headers, or progress indicators.
- **Library Verbosity:** 3rd party libraries (yfinance, httpx) flood the console with delisting warnings and HTTP status codes.

---

## The Ultimate Overhaul Plan
**Focus:** Professional, technically accurate logs combined with a "God-Tier" CLI UI.
**Effort:** High | **Risk:** Low | **Confidence:** 95%

### Phase 1: The Hybrid Core (Log Intelligence)
This phase fixes the root cause of messy runtime logs and suppresses noise at the source.

- **Rust Log Intelligence:**
    - Modify `src-tauri/src/lib.rs` to parse Python stderr lines.
    - Map Python prefixes (e.g., `[INFO]`, `[ERROR]`, `[DEBUG]`) to native Rust `log::` macros.
    - Strip redundant "Python stderr:" prefixes.
- **Python Noise Suppression:**
    - Update `src-tauri/python/portfolio_src/prism_utils/logging_config.py`.
    - Explicitly set noisy 3rd party libraries (`yfinance`, `httpx`, `urllib3`) to `WARNING` or `ERROR` levels.
    - Standardize Python output format for easier parsing by the Rust bridge.

### Phase 2: The "Rich" Orchestrator (Visual UI)
This phase replaces messy shell scripts with a dedicated, beautiful CLI tool.

- **The CLI Tool (`scripts/prism.py`):**
    - Build a Python-based orchestrator using the `rich` library.
    - Implement multi-stage progress bars for `uv sync`, `pyinstaller`, and `cargo build`.
    - Use `rich.console` Panels and Tables to display build status and environment info.
- **Live Log Multiplexing:**
    - Capture stdout/stderr from all subprocesses (Tauri, Python, Vite).
    - Display a unified, filtered live feed in a beautiful dashboard layout.
    - Hide verbose build details by default, showing them only on failure.

### Phase 3: Integration & Cleanup
- **Script Replacement:**
    - Replace `rebuild-and-run.sh`, `build-python.sh`, and `dev.sh` with a single entry point: `python scripts/prism.py dev` or `build`.
- **Final Polish:**
    - Add a "System Check" at startup to verify prerequisites (Node, Rust, Python).
    - Ensure consistent color-coding across the entire lifecycle.

---

## Comparison Summary

| Feature | Current State | Ultimate Overhaul |
| :--- | :--- | :--- |
| **Build Logs** | 500+ lines of noise | Clean progress bars |
| **Log Accuracy** | Everything is an "ERROR" | Info is Info, Error is Error |
| **Visuals** | Plain text mess | Colored panels & tables |
| **Orchestration** | Fragmented .sh scripts | Unified Python CLI |

## Recommendation
Proceed with the **Ultimate Overhaul**. It ensures the app feels like a cohesive, high-quality product from the moment the developer types the first command.
