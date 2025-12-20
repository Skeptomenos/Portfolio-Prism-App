# Observability & Developer Experience Spec

> **Purpose:** Defines the standards for logging, telemetry, and the developer command-line interface (CLI).
> **Goal:** Ensure technically accurate logs, minimal noise, and a professional build/run experience.

---

## 1. Logging Standards

### 1.1 Log Levels & Accuracy
The system must maintain technical accuracy across the Rust↔Python boundary.
- **DEBUG:** Verbose internal state, tracebacks, and raw IPC messages.
- **INFO:** High-level milestones (e.g., "Sync complete", "Engine started").
- **WARNING:** Non-fatal issues that may affect data quality (e.g., "Ticker not found", "API rate limit").
- **ERROR:** Fatal task failures or system crashes.

### 1.2 The Rust-Python Bridge
Rust acts as the primary log aggregator.
- **Parsing:** Rust must parse Python's stderr stream for `[LEVEL]` prefixes.
- **Mapping:** Python log levels must be mapped to native Rust `log::` macros (e.g., `[INFO]` -> `log::info!`).
- **Formatting:** Redundant prefixes (like "Python stderr:") must be stripped to maintain a clean, native feel.

### 1.3 Noise Suppression
To maintain a high signal-to-noise ratio:
- **3rd Party Libraries:** Noisy libraries (e.g., `yfinance`, `httpx`, `matplotlib`) must be silenced or set to `WARNING` level at the source.
- **Standardization:** Python logs must follow the format `[LEVEL] Name: Message` for reliable parsing.

---

## 2. Developer CLI (`scripts/prism.py`)

### 2.1 Unified Orchestration
All developer operations (build, dev, test) must be managed through a single Python-based orchestrator.
- **Visual Feedback:** Use the `rich` library for progress bars, panels, and tables.
- **Live Output:** Long-running tasks (like PyInstaller) must show live, truncated output within their progress indicators to prove activity without flooding the terminal.

### 2.2 Build Lifecycle
1. **Phase 1 (Python):** Sync dependencies (UV) -> Clean artifacts -> Build binaries (PyInstaller) -> Deploy to `src-tauri/binaries`.
2. **Phase 2 (Tauri):** Start the development server or build the final bundle.

---

## 3. PII & Security

### 3.1 PII Scrubbing
- All logs must pass through the `PIIFilter` (Python) and `Scrubber` (Rust) before being printed or stored.
- Patterns to scrub: IBANs, Emails, Phone Numbers, and API Keys.

### 3.2 Telemetry (Future)
- Critical errors should be hashed and reported to the Cloudflare Proxy only after user consent.
- Telemetry must never include raw PII.
