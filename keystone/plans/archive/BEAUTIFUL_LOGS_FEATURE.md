# Feature: Beautiful Logs & Developer Experience

> **Session ID:** BeautifulLogs
> **Status:** Completed
> **Owner:** Sisyphus

## 1. Goals
The primary objective of this workstream was to transform the developer experience (DX) by overhauling the terminal output for the build and runtime processes.

### Key Requirements:
- **Visual Structure:** Replace the "messy" wall of text with structured, readable output.
- **Technical Accuracy:** Ensure log levels (`INFO`, `WARN`, `ERROR`) are correctly reported, fixing the issue where all Python logs were labeled as `ERROR` by the Rust bridge.
- **Noise Reduction:** Suppress verbose output from 3rd party libraries (`yfinance`, `httpx`) and internal debug traces.
- **Unified Orchestration:** Create a single, robust entry point for building and running the application.

---

## 2. Implementation Approach: The Ultimate Overhaul

We implemented a hybrid strategy combining a high-end CLI orchestrator with intelligent log parsing at the Rust-Python boundary.

### 2.1 The "Rich" Orchestrator (`scripts/prism.py`)
We replaced fragmented shell scripts with a Python-based CLI tool using the `rich` library.
- **Unified Command:** `python3 scripts/prism.py all` handles dependency syncing, building, and running.
- **Visual Feedback:**
    - **System Check:** Verifies prerequisites (`uv`, `node`, `cargo`) on startup with a clean status table.
    - **Nested Progress Bars:** Tracks overall build progress while showing live, pulsing updates for long-running tasks like PyInstaller.
    - **Milestone Mapping:** Maps internal PyInstaller log patterns (e.g., "Analysis", "PYZ") to granular progress percentages (10%, 20%, etc.) for a smooth user experience.

### 2.2 Intelligent Log Bridge (Rust)
We refactored `src-tauri/src/lib.rs` to act as a smart log aggregator.
- **Parsing:** The Rust shell now parses Python's stderr stream for `[LEVEL]` prefixes.
- **Mapping:**
    - `[INFO]` → `log::info!` (Blue)
    - `[WARNING]` → `log::warn!` (Yellow)
    - `[ERROR]` → `log::error!` (Red)
- **Filtering:** Automatically suppresses known noise (e.g., "possibly delisted", "No historical data found") to keep the terminal clean.

### 2.3 Python Noise Suppression
We updated `src-tauri/python/portfolio_src/prism_utils/logging_config.py` to silence noisy libraries at the source.
- **Critical Only:** `yfinance` set to `CRITICAL`.
- **Warnings Only:** `httpx`, `urllib3`, `matplotlib`, `asyncio` set to `WARNING`.

---

## 3. Relevant Specifications

- **[Observability Spec](../specs/observability.md):** Defines the standards for log levels, visual presentation (`PRISM ↳`), and the CLI architecture.
- **[Tech Stack](../specs/tech.md):** Updated to reference the new observability standards under "Zero-Effort Telemetry".

## 4. Outcome
The developer terminal is now a professional, high-density dashboard.
- **Build Phase:** Clean progress bars with live status updates.
- **Runtime Phase:** Structured, color-coded logs that clearly distinguish between application logic and system errors.
- **Reliability:** "Session Expired" errors are now clearly visible, enabling faster debugging of authentication issues.
