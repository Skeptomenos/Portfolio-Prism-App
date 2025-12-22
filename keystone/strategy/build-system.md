# Build System Strategy

> **Purpose:** Strategic decisions on the build pipeline, dependency management, and development workflow for Portfolio Prism
> **Scope:** High-level build architecture, not implementation specifications
> **Also read:** `keystone/strategy/application-shell.md` for shell strategy
> **Also read:** `keystone/strategy/language-stack.md` for language strategy

---

## Executive Summary

Portfolio Prism adopts a **"Velocity in Dev, Stability in Prod"** build strategy. We solve the critical bottleneck of slow compilation (4+ minutes) by implementing a **Two-Track Build System**: instant raw Python execution during development and secure PyInstaller freezing for production. This is augmented by **modern dependency management using `uv`**, ensuring 10x faster environment resolution and deterministic builds via lockfiles.

---

## Current Build Assessment

### **The "Monolithic Build" Problem**

**Current Architecture:**
- **Single Track:** Development uses the same frozen binary mechanism as production.
- **Workflow:** `Edit Python` → `Full Rebuild (4m)` → `Run App`.
- **Dependency Management:** `pip` + `requirements.txt` (No lockfile, slow resolution).
- **Inefficiency:** `build-python.sh` aggressively deletes build caches (`rm -rf build/`) and compiles the daemon twice.

**Impact:**
- 🛑 **Blocking Feedback Loop:** 4-minute wait time destroys developer flow.
- ⚠️ **Stability Risk:** Lack of lockfiles allows dependency version drift between dev and prod.
- ⚠️ **Resource Waste:** Redundant compilation consumes CPU/Time.

---

## Strategic Architecture: The Two-Track System

### **Core Principle**
Decouple the *development experience* from the *distribution artifact*.

### **Track 1: Fast Development (Hot Reload)**
*   **Mechanism:** Rust shell spawns a raw Python process pointing to the source code.
*   **Trigger:** Active when compiled in Debug mode (`cargo run` / `npm run tauri dev`).
*   **Behavior:**
    *   Finds `src-tauri/python/venv/bin/python`.
    *   Executes `src-tauri/python/prism_boot.py` directly.
    *   Manages process lifecycle manually (kill on exit).
*   **Benefit:** **Instant Iteration.** Changes to Python code are reflected immediately upon app refresh.

### **Track 2: Production Build (Frozen Binary)**
*   **Mechanism:** Rust shell spawns the PyInstaller-compiled executable.
*   **Trigger:** Active when compiled in Release mode (`cargo build --release` / `npm run tauri build`).
*   **Behavior:**
    *   Uses standard Tauri `.sidecar("prism")` API.
    *   Runs the standalone, self-contained binary.
*   **Benefit:** **Stability & Security.** Users receive a tamper-resistant, tested artifact with no external dependencies.

---

## Dependency Management Strategy: Migration to `uv`

### **Why `uv`?**
We are replacing `pip` with `uv` (from Astral) to modernize our Python infrastructure.

| Feature | `pip` (Old) | `uv` (New) | Strategic Value |
| :--- | :--- | :--- | :--- |
| **Speed** | Slow resolution | **10-100x Faster** | Accelerates CI and local setup |
| **Locking** | None (risky) | **Universal Lockfile** | Ensures Prod matches Dev exactly |
| **Workflow** | Manual venv | **Unified Tool** | Simplifies scripts (`uv run ...`) |
| **Config** | `requirements.txt` | `pyproject.toml` | Standardized metadata |

### **Implementation Plan**
1.  **Standardize:** Convert `requirements-build.txt` to `pyproject.toml`.
2.  **Lock:** Generate `uv.lock` to pin exact versions of transitive dependencies (e.g., specific version of `pandas`).
3.  **Execute:** Update build scripts to use `uv run pyinstaller ...`, eliminating manual activation logic.

---

## Build Pipeline Optimization

### **1. Fixing "Double Build"**
*   **Problem:** `tr_daemon` is compiled in `build-python.sh` AND `build-daemon.sh`.
*   **Fix:** Remove redundant compilation step. Each artifact should be built exactly once.

### **2. Enabling Incremental Builds**
*   **Problem:** Scripts run `rm -rf build/`, destroying PyInstaller's analysis cache.
*   **Fix:** Retain `build/` directory. PyInstaller is smart enough to re-analyze only changed files.
*   **Result:** Production builds (when needed) drop from ~4 mins to ~45 seconds for minor changes.

### **3. Environment Consistency**
*   **Challenge:** Ensuring `Dev` (Track 1) and `Prod` (Track 2) behave identically.
*   **Strategy:**
    *   **Shared Config:** Rust shell uses a unified `get_environment_vars()` helper for both tracks.
    *   **Dependency Sync:** CI pipeline validates that `uv.lock` is up-to-date with `pyproject.toml`.

---

## Success Metrics

| Metric | Current State | Target State | Impact |
| :--- | :--- | :--- | :--- |
| **Dev Iteration Time** | ~4 minutes | **< 2 seconds** | 🚀 Rapid Feedback Loop |
| **Dependency Install** | ~60 seconds | **< 2 seconds** | ⚡ Faster Setup |
| **Prod Build Time** | ~4 minutes | **< 1 minute** | ⏩ Faster Deployment |
| **Build Reliability** | Flaky (No lock) | **Deterministic** | 🛡️ Production Safety |

---

## Implementation Roadmap

### **Phase 1: Foundation (Immediate)**
1.  **Initialize `uv`:** specific `pyproject.toml` and lockfile generation.
2.  **Script Rewrite:** Port shell scripts to use `uv`.
3.  **Rust Refactor:** Implement conditional `Command::new` logic in `lib.rs`.

### **Phase 2: Optimization (Weeks 1-2)**
1.  **Cache Tuning:** Configure PyInstaller caching for optimal speed.
2.  **Process Management:** harden zombie process killing in Dev mode.
3.  **CI Integration:** Update GitHub Actions to use `uv` caching.

### **Phase 3: Stabilization (Month 1)**
1.  **Windows Support:** Abstract path resolution for cross-platform dev.
2.  **Portability:** Ensure `uv` workflow allows new contributors to "clone and run".

---

## Risk Assessment

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Zombie Processes** | Dev machine resource leak | Robust `Drop` trait implementation and signal handling in Rust |
| **Dev/Prod Drift** | Bug works in Dev, fails in Prod | CI runs Prod build on PRs; Developer runs Prod build before merge |
| **Windows paths** | Build failure on Windows | Use Rust `PathBuf` for platform-agnostic paths |

---

## Conclusion

The **Two-Track Build System** combined with **`uv` dependency management** removes the single biggest friction point in Portfolio Prism's development. By treating "Developer Experience" as a first-class citizen, we unlock the velocity needed to achieve the "Rapid Feedback Loop" product vision without compromising the stability or security of the final shipping artifact.
