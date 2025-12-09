# Thinking: The Physics of Portfolio Prism Desktop

## 1. System Physics & Constraints

### 1.1. Process Boundaries (The "Air Gap")
*   **Reality**: We have two distinct universes running in parallel.
    *   **Universe A (Rust/Tauri)**: The "Shell". Native, fast, controls the OS window and filesystem permissions.
    *   **Universe B (Python)**: The "Brain". Heavy, slow start, holds the business logic and memory state.
*   **Constraint**: These universes share **nothing** except:
    1.  `stdin`/`stdout` (primitive text pipes).
    2.  Use of a shared localhost TCP Port (HTTP).
*   **Challenge**: "Zombie Processes". If Universe A dies (user Force Quits), Universe B has no idea and keeps running, consuming RAM and locking the DB.
*   **Solution**: We must implement a **"Dead Man's Switch"** via `stdin`. If the pipe closes, Python must self-terminate immediately.

### 1.2. Filesystem Gravity (Read-Only vs. Mutable)
*   **Reality**: A macOS `.app` bundle is **immutable** (signed, sealed).
*   **Constraint**: We cannot write to `./data/` inside the app bundle like the CLI script does. Code is frozen.
*   **Challenge**: The Python script assumes `DATA_DIR = "./data"`. This relative path concept works in dev, breaks in prod.
*   **Solution**: "Gravitational Drift". We must "drift" the data anchor point from `.` to `~/Library/Application Support/PortfolioPrism/`. This requires a **Context Injector** at startup that tells Python *where* it is running.

### 1.3. State Persistence (The "Memory" Problem)
*   **Reality**: Streamlit is stateless between refreshes. A Python process restart wipes `st.session_state`.
*   **Constraint**: Trade Republic tokens expire.
*   **Challenge**: If the user closes the window (Process B dies), they shouldn't have to login again.
*   **Solution**: **Externalized State**. Auth tokens must be persisted to the **OS Keyring** and session metadata to a local JSON/SQLite file, decoupled from the RAM of Process B.

---

## 2. Fundamental Technical Challenges (The "Hard Parts")

### 2.1. The "Bundling Event Horizon"
*   **The Problem**: Creating a single binary from a dependency tree as complex as `pandas` + `streamlit` + `numpy` is statistically the mostly likely failure point.
*   **Physics**: Hidden imports. Dynamic loading of dylibs.
*   **Mitigation**: We do not guess. We build a **Minimal Viable Skeleton** first.
    *   Step 1: Bundle `print("hello")`.
    *   Step 2: Bundle `import pandas`.
    *   Step 3: Bundle `import streamlit`.
    *   We verify success at each atomic step before adding mass.

### 2.2. Port Collision (The "Parking Space" Problem)
*   **The Problem**: Hardcoding port `8501`. If the user opens two instances, or has another app running, it crashes.
*   **Physics**: Two processes cannot bind to the same TCP socket.
*   **Mitigation**: **Dynamic Binding**.
    1.  Python asks kernel for port `0` (random free port).
    2.  Kernel assigns `54321`.
    3.  Python shouts `54321` to stdout.
    4.  Tauri hears `54321` and navigates the webview.

### 2.3. The 2FA Race Condition
*   **The Problem**: The login flow requires human time (checking phone). HTTP requests time out.
*   **Physics**: `pytr` is async. Streamlit is sync (mostly).
*   **Mitigation**: A State Machine within Streamlit.
    *   State 0: `Idle` -> Render Login Form.
    *   State 1: `Requesting` -> Call `pytr`, await promise? No, Streamlit reruns script.
    *   **Architecture**: We need a background thread for `pytr` that communicates with the Streamlit main thread via a `Queue` or `SessionState` updates.

---

## 3. Phased Build Strategy

Based on the physics above, we cannot "just build it". We must grow it organically.

### Phase 1: The Proto-Organism (Connectivity)
**Goal**: A Tauri window displaying a Streamlit "Hello World" running on a random port.
*   Why? Proves the IPC (Inter-Process Communication) and Port Discovery physics work.
*   Ignores: Data, Auth, Styling.

### Phase 2: The Skeleton (Packaging)
**Goal**: The "Hello World" app includes `pandas` and `streamlit` and compiles to a `.app`.
*   Why? Proves we can traverse the "Bundling Event Horizon".
*   Ignores: Real features.

### Phase 3: The Brain (Logic Transplants)
**Goal**: Move the existing `dashboard/app.py` code into the skeleton.
*   Why? Logic migration.
*   Challenge: Path injection (solving the Filesystem Gravity problem).

### Phase 4: The Nervous System (Auth & Hive)
**Goal**: Connect to the outside world (Trade Republic, Supabase).
*   Why? Feature parity.

### Phase 5: The Immune System (Polish)
**Goal**: Error handling, auto-updates, crash reporting.
*   Why? Production readiness.
