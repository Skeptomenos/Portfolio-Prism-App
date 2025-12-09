# Desktop App Feasibility Report: Electron vs. Tauri

## Executive Summary
Converting "Portfolio Prism" into a macOS application is **highly feasible**.
The most efficient path is the **"Sidecar Pattern"**: wrapping your existing Python/Streamlit backend in a native container.

You asked if **Tauri** is better suited than **Electron**.
**Verdict:** **Yes**, Tauri is better suited for a high-performance, polished "product" feel on macOS, provided you are comfortable with a slightly more complex initial setup.

## Comparison: Electron vs. Tauri v2

| Feature | Electron | Tauri v2 | Winner |
| :--- | :--- | :--- | :--- |
| **App Size** | Huge (~200MB+) because it bundles Chrome. | Tiny (~10MB + Python) because it uses macOS WebKit. | **Tauri** 🏆 |
| **RAM Usage** | High (runs a full browser instance). | Low (uses shared system resources). | **Tauri** 🏆 |
| **Rendering** | **Consistent**: Always Chromium, looks same on all OS. | **Native**: Uses Safari (WebKit) on Mac, Edge on Windows. | **Electron** (Consistency) |
| **Mobile** | No native support. | **Beta Support**: Can target iOS/Android from same code. | **Tauri** 🏆 |
| **Setup** | JavaScript/Node.js only. | Rust + JavaScript (Config is in JSON/Rust). | **Electron** (Simplicity) |

## Recommendation: Go with Tauri v2

**Why?**
1.  **Professional Polish**: A 50MB installer feels much more professional than a 300MB one.
2.  **Performance**: Your app is already running a Python data pipeline; saving RAM on the UI layer is valuable.
3.  **Future Proofing**: Tauri v2's mobile support opens the door to an iOS companion app later.

## Architecture: The "Sidecar" Pattern
Regardless of framework, the architecture remains the same:

1.  **App Launch**: User clicks the Dock Icon.
2.  **Sidecar Spawn**: The App (Rust/Node) spawns a compiled Python executable (`pyinstaller` bundle) in the background.
3.  **Port Discovery**: Python finds a free port and starts Streamlit.
4.  **UI Load**: The App points its Native Window to `http://localhost:<port>`.

## Implementation Plan (Tauri Route)

### Phase 1: Python Packaging (The Hardest Part)
*   **Goal**: Create a standalone binary of your current `run_dashboard.sh` flow.
*   **Tool**: `PyInstaller`.
*   **Challenge**: Bundling `playwright` browsers. We likely need to download them on first run or bundle them (adding size).

### Phase 2: Tauri Setup
*   **Init**: `npm create tauri-app@latest`.
*   **Config**: Add the Python binary as an `externalBin` in `tauri.conf.json`.
*   **Glue Code**: Write a small Rust/JS function to start the sidecar and wait for the port.

### Phase 3: UX Polish
*   **Loading Screen**: Show a clean spinner while Python boots up.
*   **Menu Bar**: Add native macOS menus (File, View, Window).
*   **Lifecycle**: Ensure killing the app kills the Python process (zombie process prevention).

## Decision
Shall we proceed with **Tauri v2**?

If you accept, I will create a detailed `implementation_plan.md` specifically for the Tauri approach.
