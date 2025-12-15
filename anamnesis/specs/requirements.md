# Functional Requirements (The "What")

> **Syntax:** EARS (Easy Approach to Requirements Syntax)
> **See Strategy:** `anamnesis/strategy/architecture-overview.md` for Master Architecture.

> ⚠️ **STRATEGIC PIVOT (Dec 2025):** The system shall implement a **React-based UI**. All requirements referencing "Streamlit" or "Python Dashboard" are superseded by React equivalents.

---

## 1. Ubiquitous Requirements (Always True)

*   **REQ-001:** The system shall launch as a standalone desktop application without requiring Python installation.
*   **REQ-002:** The system shall provide a native macOS application experience using system WebKit (via Tauri v2).
*   **REQ-003:** The system shall authenticate users with Trade Republic using phone + PIN → 2FA code flow *within the React UI*.
*   **REQ-004:** The system shall display the portfolio dashboard via **React components** rendering data from local storage.
*   **REQ-005:** The system shall function offline with cached data when network connectivity is unavailable.
*   **REQ-006:** The system shall synchronize portfolio data with external APIs in the background *without blocking the UI*.
*   **REQ-007:** The system shall contribute new ISIN resolutions to a community database ("Hive") when user opts in.
*   **REQ-008:** The system shall check for and apply application updates automatically via GitHub Releases.
*   **REQ-009:** The system shall automatically report critical crashes to the developer's GitHub Issues if the user opts in (Zero-Effort Reporting).
*   **REQ-010:** The system shall throttle external API requests (e.g., max 5 concurrent) to prevent rate limiting.

---

## 2. Event-Driven Requirements (When... Then...)

*   **REQ-101:** When user launches application, then system shall display the React Welcome screen immediately (<2s).
*   **REQ-102:** When user selects "Connect Trade Republic", then system shall initiate authentication flow with 2FA within the React modal.
*   **REQ-103:** When authentication is successful, then system shall trigger the Python Engine to import portfolio data in the background.
*   **REQ-104:** When portfolio data is imported, then system shall reactively update the dashboard with new holdings and analysis.
*   **REQ-105:** When network is available, then system shall synchronize portfolio data with external APIs in background.
*   **REQ-106:** When network becomes unavailable, then system shall enter offline mode and continue functioning with cached data.
*   **REQ-107:** When a critical error occurs, then system shall capture, sanitize, and queue the error report for transmission.

---

## 3. State-Driven Requirements (While... Then...)

*   **REQ-201:** While portfolio is being synchronized, then system shall display a non-blocking progress indicator in the React UI.
*   **REQ-202:** While application is running, then Rust Shell shall monitor the Python Sidecar and restart it if it crashes.
*   **REQ-203:** While in offline mode, then system shall disable cloud-dependent features (Sync/Enrich) and display "Offline Mode" indicator.

---

## 4. Unwanted Behavior (If... Then... NOT)

*   **REQ-301:** If application crashes, then system shall NOT lose user data or corrupt portfolio files (ACID compliance via SQLite).
*   **REQ-302:** If user has not opted in, then system shall NOT transmit any telemetry or crash reports.
*   **REQ-303:** If Python Engine is processing, then UI shall NOT freeze or become unresponsive.
