# Implementation Plan: TR Daemon as Separate Binary

> **Status:** Approved  
> **Created:** 2025-12-08  
> **Supersedes:** Parts of `PLAN_TR_DAEMON.md` (spawn mechanism only)  
> **Goal:** Fix daemon spawning in PyInstaller bundle + React migration readiness

---

## Problem Statement

The current `tr_bridge.py` spawns the daemon subprocess using:

```python
daemon_path = Path(__file__).parent / "tr_daemon.py"
self._daemon_process = subprocess.Popen(
    [sys.executable, str(daemon_path)],
    ...
)
```

**This fails in PyInstaller bundles because:**
1. `sys.executable` points to the `prism` binary, not a Python interpreter
2. `tr_daemon.py` is embedded inside the bundle, not a standalone file
3. Running `[prism, tr_daemon.py]` doesn't work - `prism` can't execute Python scripts

**Result:** Empty response from daemon → "Invalid daemon response: Expecting value: line 1 column 1 (char 0)"

---

## Solution: Separate Daemon Binary

Build `tr_daemon.py` as its own PyInstaller binary (`tr-daemon`) that can be spawned as a Tauri sidecar.

### Why This Approach?

| Consideration | Benefit |
|---------------|---------|
| **React Migration** | Rust can spawn the same `tr-daemon` binary - no code changes needed |
| **Clean Isolation** | Daemon has its own Python environment and event loop |
| **Tauri Native** | Uses Tauri's sidecar pattern, consistent with `prism` |
| **No Architecture Changes** | `tr_daemon.py`, `tr_protocol.py` unchanged |
| **Dev/Prod Parity** | Same spawn mechanism in both modes |

---

## Architecture Overview

### Current (Broken)

```
┌─────────────────────────────────────────────────────────────────┐
│                     prism (PyInstaller bundle)                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Streamlit → tr_bridge.py                                  │  │
│  │       │                                                    │  │
│  │       ├─> subprocess.Popen([sys.executable, daemon.py])   │  │
│  │       │   ↑ FAILS: sys.executable = prism, not python     │  │
│  │       │                                                    │  │
│  │       └─> Empty response → JSON parse error               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Proposed (Fixed)

```
┌─────────────────────────────────────────────────────────────────┐
│                     prism (PyInstaller bundle)                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Streamlit → tr_bridge.py                                  │  │
│  │       │                                                    │  │
│  │       └─> subprocess.Popen([tr-daemon])  ← Separate binary │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ stdin/stdout (JSON-RPC)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 tr-daemon (PyInstaller bundle)                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Own Python environment                                    │  │
│  │  Own asyncio event loop                                    │  │
│  │  pytr imported safely                                      │  │
│  │  Session state in memory                                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Future (React + Rust)

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  invoke('tr_login', { phone, pin })                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Tauri IPC
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Rust (lib.rs)                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  #[tauri::command]                                         │  │
│  │  async fn tr_login() {                                     │  │
│  │      app.shell().sidecar("tr-daemon").spawn()             │  │
│  │  }                                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ stdin/stdout (JSON-RPC) ← SAME PROTOCOL
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                 tr-daemon (PyInstaller bundle)                   │
│                 ← UNCHANGED FROM STREAMLIT VERSION              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files to Create

### 1. `src-tauri/python/tr_daemon.spec`

**Purpose:** PyInstaller spec for the daemon binary

**Contents:**
```python
# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

a = Analysis(
    ['portfolio_src/core/tr_daemon.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'pytr',
        'pytr.api',
        'pytr.utils',
        'websockets',
        'certifi',
        'ecdsa',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'streamlit',
        'pandas',
        'numpy',
        'plotly',
        'altair',
        # Exclude all heavy dependencies not needed by daemon
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='tr-daemon',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,
    upx=False,
    console=True,  # Needs stdin/stdout
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
```

**Expected Size:** ~10-15MB (much smaller than prism, no Streamlit/pandas/plotly)

---

### 2. `scripts/build-daemon.sh`

**Purpose:** Build script for the daemon binary

**Contents:**
```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PYTHON_DIR="$PROJECT_ROOT/src-tauri/python"
BINARIES_DIR="$PROJECT_ROOT/src-tauri/binaries"

echo "=== Building TR Daemon Binary ==="

cd "$PYTHON_DIR"

# Activate virtual environment
source venv-build/bin/activate

# Build daemon
echo "Running PyInstaller for tr-daemon..."
pyinstaller tr_daemon.spec --noconfirm

# Determine platform suffix
ARCH=$(uname -m)
OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        SUFFIX="aarch64-apple-darwin"
    else
        SUFFIX="x86_64-apple-darwin"
    fi
elif [ "$OS" = "Linux" ]; then
    SUFFIX="x86_64-unknown-linux-gnu"
else
    SUFFIX="x86_64-pc-windows-msvc"
fi

# Copy to binaries directory
echo "Copying tr-daemon to binaries directory..."
cp dist/tr-daemon "$BINARIES_DIR/tr-daemon-$SUFFIX"

echo "=== TR Daemon Build Complete ==="
echo "Binary: $BINARIES_DIR/tr-daemon-$SUFFIX"
ls -lh "$BINARIES_DIR/tr-daemon-$SUFFIX"
```

---

### 3. `scripts/build-all.sh`

**Purpose:** Build both binaries (prism + tr-daemon)

**Contents:**
```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Building All Python Binaries ==="
echo ""

# Build main app
echo "Step 1/2: Building prism..."
"$SCRIPT_DIR/build-python.sh"
echo ""

# Build daemon
echo "Step 2/2: Building tr-daemon..."
"$SCRIPT_DIR/build-daemon.sh"
echo ""

echo "=== All Builds Complete ==="
ls -lh "$SCRIPT_DIR/../src-tauri/binaries/"
```

---

## Files to Modify

### 4. `src-tauri/python/portfolio_src/core/tr_bridge.py`

**Changes:** Update spawn logic to use sidecar binary in frozen mode

**Current (lines 65-76):**
```python
# Start new daemon process
try:
    daemon_path = Path(__file__).parent / "tr_daemon.py"
    self._daemon_process = subprocess.Popen(
        [sys.executable, str(daemon_path)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=os.environ.copy(),
    )
```

**New:**
```python
# Start new daemon process
try:
    cmd = self._get_daemon_command()
    self._daemon_process = subprocess.Popen(
        cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=os.environ.copy(),
    )
```

**Add new method:**
```python
def _get_daemon_command(self) -> list:
    """Get command to spawn daemon, handling frozen vs dev mode."""
    if getattr(sys, 'frozen', False):
        # Frozen mode: use sidecar binary
        return [self._get_sidecar_path("tr-daemon")]
    else:
        # Dev mode: use Python directly
        daemon_path = Path(__file__).parent / "tr_daemon.py"
        return [sys.executable, str(daemon_path)]

def _get_sidecar_path(self, name: str) -> str:
    """Get path to sidecar binary with platform suffix."""
    import platform
    
    system = platform.system()
    machine = platform.machine()
    
    if system == "Darwin":
        suffix = "aarch64-apple-darwin" if machine == "arm64" else "x86_64-apple-darwin"
    elif system == "Windows":
        suffix = "x86_64-pc-windows-msvc.exe"
    else:
        suffix = "x86_64-unknown-linux-gnu"
    
    # Sidecar binaries are next to the main executable
    base_dir = Path(sys.executable).parent
    sidecar_path = base_dir / f"{name}-{suffix}"
    
    if not sidecar_path.exists():
        raise RuntimeError(f"Sidecar binary not found: {sidecar_path}")
    
    return str(sidecar_path)
```

---

### 5. `src-tauri/tauri.conf.json`

**Changes:** Register tr-daemon as a sidecar

**Current:**
```json
"externalBin": [
  "binaries/prism"
]
```

**New:**
```json
"externalBin": [
  "binaries/prism",
  "binaries/tr-daemon"
]
```

---

### 6. `src-tauri/python/portfolio_src/core/tr_daemon.py`

**Changes:** Add frozen mode detection for imports

**Add near top of file (after existing imports):**
```python
# Handle PyInstaller frozen mode
if getattr(sys, 'frozen', False):
    # Running as compiled binary
    import certifi
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()
```

This ensures SSL certificates work correctly in the frozen binary.

---

## Execution Order

| Step | Task | Files | Est. Time |
|------|------|-------|-----------|
| 1 | Create `tr_daemon.spec` | `src-tauri/python/tr_daemon.spec` | 10 min |
| 2 | Create `build-daemon.sh` | `scripts/build-daemon.sh` | 10 min |
| 3 | Create `build-all.sh` | `scripts/build-all.sh` | 5 min |
| 4 | Update `tr_bridge.py` | Add `_get_daemon_command()`, `_get_sidecar_path()` | 15 min |
| 5 | Update `tauri.conf.json` | Add tr-daemon to externalBin | 2 min |
| 6 | Update `tr_daemon.py` | Add SSL cert handling for frozen mode | 5 min |
| 7 | Build daemon binary | Run `build-daemon.sh` | 2 min |
| 8 | Test in dev mode | Manual testing | 5 min |
| 9 | Rebuild main binary | Run `build-python.sh` | 2 min |
| 10 | Test in Tauri | `npm run tauri dev` | 10 min |
| 11 | Test full login flow | With real TR credentials | 5 min |

**Total Estimated Time:** ~70 minutes

---

## Testing Checklist

### Dev Mode Testing
- [ ] `python3 portfolio_src/core/tr_daemon.py` starts and responds to stdin
- [ ] Bridge spawns daemon using Python interpreter
- [ ] Login flow works in Streamlit (direct `streamlit run`)

### Frozen Mode Testing
- [ ] `tr-daemon` binary runs standalone
- [ ] `echo '{"method":"get_status","params":{},"id":"1"}' | ./tr-daemon` returns valid JSON
- [ ] Bridge spawns daemon using sidecar binary
- [ ] Login flow works in Tauri app (`npm run tauri dev`)

### Full Integration Testing
- [ ] 2FA code received on phone
- [ ] 2FA code verification succeeds
- [ ] Session persists (cookies saved)
- [ ] Session restore works on app restart

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Daemon binary too large | Low | Low | Exclude unused packages in spec |
| SSL cert issues in frozen mode | Medium | High | Add certifi environment setup |
| Sidecar path resolution fails | Low | High | Detailed error messages, fallback logic |
| Two binaries complicate deployment | Low | Medium | Clear build scripts, CI automation |

---

## Binary Size Estimates

| Binary | Contents | Est. Size |
|--------|----------|-----------|
| `prism` | Streamlit + pandas + plotly + analytics | ~105 MB |
| `tr-daemon` | pytr + websockets + requests | ~10-15 MB |
| **Total** | | ~115-120 MB |

---

## Future: React Migration

When migrating to React, the Rust code will spawn `tr-daemon` directly:

```rust
// src-tauri/src/tr_commands.rs

use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use std::io::{BufRead, BufReader, Write};

#[tauri::command]
async fn tr_login(app: tauri::AppHandle, phone: String, pin: String) -> Result<serde_json::Value, String> {
    let (mut rx, mut child) = app.shell()
        .sidecar("tr-daemon")
        .map_err(|e| e.to_string())?
        .spawn()
        .map_err(|e| e.to_string())?;
    
    // Send login command via stdin
    let request = serde_json::json!({
        "method": "login",
        "params": { "phone": phone, "pin": pin },
        "id": "1"
    });
    
    // ... handle stdin/stdout communication
    
    Ok(response)
}
```

**Key point:** `tr-daemon` binary and protocol remain **unchanged**. Only the spawn mechanism moves from Python to Rust.

---

## Approval Checklist

- [x] Architecture reviewed
- [x] React migration compatibility confirmed
- [x] Binary size acceptable (~10-15MB additional)
- [x] Build scripts planned
- [x] Ready for implementation
