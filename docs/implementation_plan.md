# Portfolio Prism: Tauri Implementation Plan

> **Strategy**: Organic Growth. We start with the smallest possible viable organism (Tauri + Python Hello World) and add complexity (Pandas, Logic, Auth) layer by layer.

## Phase 1: The Proto-Organism (Connectivity)
**Objective**: Establish a robust communication link between the Rust Shell and a minimal Python Brain. This phase proves the "Physics" of the application before adding weight.

### 1.1. Project Initialization
*   **Action**: Initialize Tauri v2 in `tauri-app/`.
*   **Structure**:
    ```
    tauri-app/
      ├── src-tauri/
      │   ├── src/lib.rs        # Rust Logic (Sidecar spawning)
      │   ├── tauri.conf.json   # Config
      │   └── python/           # Python Source Container
      │       └── app.py        # The Handshake Script
      └── src/                  # Frontend
    ```

### 1.2. The Python Handshake Script (`src-tauri/python/app.py`)
*   **Goal**: Prove Python can talk to Rust via stdout.
*   **Logic**:
    1.  Bind a socket to `localhost:0` to get a free ephemeral port.
    2.  Print JSON to stdout: `{"port": <port>, "status": "ready"}`.
    3.  Flush stdout (Crucial!).
    4.  Start a minimal `http.server` on that port serving "Hello from Python".

### 1.3. Sidecar Glue (Rust - `src-tauri/src/lib.rs`)
*   **Goal**: Spawn Python and navigate the window.
*   **Dependencies**: `tauri-plugin-shell`.
*   **Implementation**:
    *   Spawn `python3` with script path.
    *   **Event Listener**: Listen to `CommandEvent::Stdout`.
    *   **Parser**: Parse JSON line.
    *   **Navigator**: Emit event `python-ready` to frontend.

### 1.4. The Frontend Glue (`index.html` + `main.ts`)
*   **Goal**: Show "Loading..." then switch to Python content.
*   **Logic**:
    *   Listen for `python-ready` event.
    *   `window.location.replace("http://localhost:" + payload.port);`
