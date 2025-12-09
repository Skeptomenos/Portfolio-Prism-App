# Native Integration Plan

> **Date:** 2024-12-07  
> **Updated:** 2024-12-07 (Final Review Complete)  
> **Status:** Ready for Implementation  
> **Goal:** Transition from "CLI wrapper" to fully integrated desktop application.  
> **Testing:** TR account available for end-to-end testing  
> **Decision:** Web Login flow only (see `anamnesis/specs/tech.md` Section 4.5)

---

## 1. Assessment of Current State

The application successfully launches and displays the dashboard, but two critical integration gaps prevent it from functioning as a standalone product:

### Issue A: Reliance on External Shell Scripts ("run.sh")
| Aspect | Details |
|--------|---------|
| **Symptom** | Dashboard displays `bash run.sh` when no data is found |
| **Cause** | `POC/scripts/fetch_tr_api.py` uses `subprocess.run(["pytr", "portfolio", ...])` to spawn the pytr CLI |
| **Impact** | User must drop to terminal to fetch data, defeating the purpose of a GUI app |

### Issue B: Missing Dependencies in Bundle ("pytr not installed")
| Aspect | Details |
|--------|---------|
| **Symptom** | TR Login tab fails with "pytr library not installed" |
| **Cause** | **Multiple root causes identified** (see Section 2.4) |
| **Impact** | Users cannot authenticate with Trade Republic |

---

## 2. Investigation Findings

### 2.1 Current Implementation Map

| Location | Approach | Status |
|----------|----------|--------|
| `POC/scripts/fetch_tr_api.py` | CLI subprocess (`subprocess.run(["pytr", ...])`) | **To be replaced** |
| `portfolio_src/core/tr_auth.py` | Direct library import (`from pytr.api import Api`) | Partial — auth only |
| `portfolio_src/dashboard/pages/tr_login.py` | Streamlit UI wrapping `TRAuthManager` | Working |

### 2.2 pytr Library API (Verified)

The `pytr` library provides direct Python access — no need for subprocess calls.

#### Authentication (Web Login Flow - MANDATORY)

```python
from pytr.api import TradeRepublicApi

# Initialize with save_cookies=True for session persistence
api = TradeRepublicApi(
    phone_no="+49...",
    pin="1234",
    save_cookies=True,
    cookies_file=str(auth_dir / "tr_cookies.txt")
)

# Step 1: Initiate login (NOTE: typo in pytr - "inititate" not "initiate")
countdown = api.inititate_weblogin()  # Returns seconds to wait

# Step 2: User enters 4-digit code from TR mobile app
api.complete_weblogin(code)  # Saves session to cookies automatically

# Session restoration (on subsequent launches)
success = api.resume_websession()  # Returns True if cookies valid
```

**Important:** 
- Method is `inititate_weblogin()` (typo in pytr library)
- Method `complete_login()` does NOT exist — use `complete_weblogin()`
- Always use Web Login, never Device Login (keeps mobile app logged in)

#### Portfolio Fetching

```python
from pytr.portfolio import Portfolio

# Portfolio only takes 'tr' parameter (not additional kwargs!)
portfolio = Portfolio(tr=api)
await portfolio.portfolio_loop()

# Access positions - note data types!
for pos in portfolio.portfolio["positions"]:
    print(pos["instrumentId"])   # ISIN (string)
    print(pos["name"])           # Instrument name (string, from shortName)
    print(pos["netSize"])        # Quantity (STRING, not float!)
    print(pos["averageBuyIn"])   # Avg cost (STRING, not float!)
    print(pos["netValue"])       # Current value (float, calculated)
    # NOTE: No "price" key - calculate as: netValue / float(netSize)
```

**Data Type Warning:** `netSize` and `averageBuyIn` are strings, must convert to float!

### 2.3 Required Hidden Imports (Complete List)

The original plan was incomplete. Full list required:

```python
# pytr core modules
'pytr',
'pytr.api',
'pytr.portfolio',
'pytr.utils',
'pytr.details',
'pytr.dl',
'pytr.event',
'pytr.timeline',
'pytr.transactions',
'pytr.translation',
'pytr.account',
'pytr.alarms',
'pytr.main',

# pytr dependencies (from pip show pytr)
'ecdsa',
'ecdsa.keys',
'ecdsa.util',
'ecdsa.curves',
'requests_futures',
'requests_futures.sessions',
# websockets - USE collect_submodules('websockets') instead of manual listing
# See Section 2.7 for why manual listing breaks with websockets v14+
'babel',
'babel.numbers',
'babel.core',
'coloredlogs',
'pathvalidate',
'certifi',
'shtab',
'pygments',
'packaging',
```

### 2.4 Issue B Root Cause Analysis (Deep Investigation)

Investigation on 2024-12-07 revealed **two distinct bugs**:

#### Bug 1: Wrong Import Name in tr_auth.py

```python
# CURRENT CODE (BROKEN):
from pytr.api import Api as TRApi  # ❌ 'Api' does not exist

# CORRECT CODE:
from pytr.api import TradeRepublicApi as TRApi  # ✅ Actual class name
```

**Evidence:** Running `python -c "from pytr.api import Api"` fails with:
```
cannot import name 'Api' from 'pytr.api'
```

#### Bug 2: Incomplete Hidden Imports in prism.spec

Current `prism.spec` only has:
```python
'pytr',  # Only the package, not submodules
```

Missing critical modules:
- `pytr.api` — Main API class
- `pytr.portfolio` — Portfolio fetching
- All pytr dependencies (`ecdsa`, `websockets`, `requests_futures`, etc.)

#### Bug 3: Generic Error Message Hides Root Cause

Current error handling in `tr_auth.py:180-186`:
```python
if not PYTR_AVAILABLE:
    return AuthResult(
        success=False,
        state=AuthState.ERROR,
        message="pytr library not installed. Install with: pip install pytr"
    )
```

This message is misleading because:
- `pytr` IS installed (it's in `prism.spec`)
- The actual error is the wrong import name (`Api` vs `TradeRepublicApi`)
- Users can't "pip install" in a frozen app

#### Bug 4: Wrong Authentication Flow in tr_auth.py

Current code uses non-existent methods:
```python
# Line 201: login() is for Device auth, not Web auth
await self._api.login()

# Line 247: complete_login() DOES NOT EXIST
await self._api.complete_login(code)
```

Correct methods:
```python
# Web Login flow (correct)
countdown = self._api.inititate_weblogin()  # Note typo!
self._api.complete_weblogin(code)
```

---

## 2.5 Error Logging & GitHub Issue Strategy

To enable users to report issues effectively, we need verbose error logging.

### 2.5.1 Log File Location

```
$PRISM_DATA_DIR/logs/prism_errors.log
# macOS: ~/Library/Application Support/PortfolioPrism/logs/prism_errors.log
# Fallback: ~/.prism/data/logs/prism_errors.log
```

### 2.5.2 Error Log Format

```
================================================================================
ERROR REPORT - Portfolio Prism
================================================================================
Timestamp: 2024-12-07T14:32:15.123456
App Version: 1.0.0
Python Version: 3.9.x (frozen)
Platform: macOS 14.0 arm64

--- ERROR DETAILS ---
Module: core.tr_auth
Function: request_2fa
Error Type: ImportError
Error Message: cannot import name 'Api' from 'pytr.api'

--- STACK TRACE ---
Traceback (most recent call last):
  File "core/tr_auth.py", line 26, in <module>
    from pytr.api import Api as TRApi
ImportError: cannot import name 'Api' from 'pytr.api'

--- DEPENDENCY CHECK ---
pytr: FAILED (ImportError: cannot import name 'Api')
pytr.api: OK
pytr.portfolio: OK
ecdsa: OK
websockets: OK
...

--- INSTRUCTIONS ---
Please create a GitHub issue at:
https://github.com/Skeptomenos/Portfolio-Prism-App/issues/new

Include this log file: $PRISM_DATA_DIR/logs/prism_errors.log
================================================================================
```

### 2.5.3 Implementation: Error Reporter Module

Create `portfolio_src/prism_utils/error_reporter.py`:

```python
"""
Error Reporter - Captures verbose error details for GitHub issues.
"""

import sys
import os
import platform
import traceback
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
import json

from prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class ErrorReporter:
    """Captures and logs detailed error information for debugging."""
    
    GITHUB_ISSUES_URL = "https://github.com/Skeptomenos/Portfolio-Prism-App/issues/new"
    
    def __init__(self):
        self.log_dir = Path(os.getenv("PRISM_DATA_DIR", "~/.prism/data")).expanduser() / "logs"
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.error_log = self.log_dir / "prism_errors.log"
    
    def check_dependencies(self) -> Dict[str, str]:
        """Check status of critical dependencies."""
        deps = [
            'pytr', 'pytr.api', 'pytr.portfolio',
            'ecdsa', 'websockets', 'requests_futures',
            'babel', 'coloredlogs', 'certifi', 'keyring'
        ]
        
        results = {}
        for dep in deps:
            try:
                __import__(dep)
                results[dep] = "OK"
            except ImportError as e:
                results[dep] = f"FAILED ({e})"
        
        return results
    
    def capture_error(
        self,
        error: Exception,
        module: str,
        function: str,
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Capture detailed error information and write to log.
        
        Returns: Path to the error log file
        """
        timestamp = datetime.now().isoformat()
        
        report = [
            "=" * 80,
            "ERROR REPORT - Portfolio Prism",
            "=" * 80,
            f"Timestamp: {timestamp}",
            f"App Version: {os.getenv('PRISM_VERSION', 'unknown')}",
            f"Python Version: {sys.version}",
            f"Platform: {platform.platform()}",
            f"Frozen: {getattr(sys, 'frozen', False)}",
            "",
            "--- ERROR DETAILS ---",
            f"Module: {module}",
            f"Function: {function}",
            f"Error Type: {type(error).__name__}",
            f"Error Message: {str(error)}",
            "",
            "--- STACK TRACE ---",
            traceback.format_exc(),
            "",
            "--- DEPENDENCY CHECK ---",
        ]
        
        for dep, status in self.check_dependencies().items():
            report.append(f"{dep}: {status}")
        
        if context:
            report.extend([
                "",
                "--- CONTEXT ---",
                json.dumps(context, indent=2, default=str)
            ])
        
        report.extend([
            "",
            "--- INSTRUCTIONS ---",
            "Please create a GitHub issue at:",
            self.GITHUB_ISSUES_URL,
            "",
            f"Include this log file: {self.error_log}",
            "=" * 80,
            ""
        ])
        
        report_text = "\n".join(report)
        
        # Append to log file
        with open(self.error_log, "a", encoding="utf-8") as f:
            f.write(report_text)
        
        # Also log to stdout for debugging
        logger.error(f"Error captured. Details saved to: {self.error_log}")
        
        return str(self.error_log)
    
    def get_user_message(self, error: Exception) -> str:
        """Generate a user-friendly error message with reporting instructions."""
        return (
            f"An error occurred: {type(error).__name__}\n\n"
            f"Details have been saved to:\n{self.error_log}\n\n"
            f"Please report this issue at:\n{self.GITHUB_ISSUES_URL}\n\n"
            f"Include the log file in your report."
        )


# Global instance
error_reporter = ErrorReporter()
```

### 2.5.4 Updated tr_auth.py Error Handling

```python
# At the top of tr_auth.py
from prism_utils.error_reporter import error_reporter

# Replace the simple try/except with verbose logging
try:
    from pytr.api import TradeRepublicApi as TRApi  # Fixed class name
    PYTR_AVAILABLE = True
    PYTR_IMPORT_ERROR = None
except ImportError as e:
    PYTR_AVAILABLE = False
    PYTR_IMPORT_ERROR = e
    error_reporter.capture_error(
        error=e,
        module="core.tr_auth",
        function="<module import>",
        context={"attempted_import": "from pytr.api import TradeRepublicApi"}
    )

# In request_2fa method:
if not PYTR_AVAILABLE:
    self._state = AuthState.ERROR
    user_msg = error_reporter.get_user_message(PYTR_IMPORT_ERROR)
    return AuthResult(
        success=False,
        state=AuthState.ERROR,
        message=f"Trade Republic library failed to load.\n\n{user_msg}"
    )
```

---

## 3. Implementation Plan (Option B - Native Integration)

### Phase 1: Fix Dependency Packaging & Error Handling
**Time Estimate:** 1 hour  
**Outcome:** Login tab works in bundled app with verbose error logging

| Task | File | Action |
|------|------|--------|
| 1.1 | `prism.spec` | Add all hidden imports from Section 2.3 |
| 1.2 | `core/tr_auth.py` | **Fix import:** Change `Api` to `TradeRepublicApi` |
| 1.3 | `core/tr_auth.py` | **Fix auth flow:** Use `inititate_weblogin()` + `complete_weblogin()` |
| 1.4 | `core/tr_auth.py` | **Add cookies:** Use `save_cookies=True` for session persistence |
| 1.5 | `core/tr_auth.py` | **Add session restore:** Implement `resume_websession()` on startup |
| 1.6 | `prism_utils/error_reporter.py` | **New file:** Create error reporter module (Section 2.5.3) |
| 1.7 | `prism_utils/logging_config.py` | Add file logging support |
| 1.8 | `core/tr_auth.py` | Integrate error reporter for verbose logging |
| 1.9 | `prism_boot.py` | Create logs directory on startup |
| 1.10 | `dashboard/pages/tr_login.py` | **Lazy import:** Move `tr_auth` imports inside functions |
| 1.11 | `dashboard/pages/__init__.py` | Remove eager tr_login import |
| 1.12 | `dashboard/app.py` | Use lazy import for tr_login module |
| 1.13 | `core/tr_auth.py` | **Event loop fix:** Add `asyncio.set_event_loop()` before pytr import (Section 2.6.1) |
| 1.14 | — | Rebuild binary and test login flow with TR account |

### Phase 2: Create Data Sync Module
**Time Estimate:** 45 minutes  
**Outcome:** Portfolio data can be fetched via library calls

| Task | File | Action |
|------|------|--------|
| 2.1 | `data/tr_sync.py` | Create `TRDataFetcher` class (see Section 4.1) |
| 2.2 | `core/tr_auth.py` | Add `api` property to expose authenticated instance |
| 2.3 | `prism.spec` | Ensure new module is included in bundle |

### Phase 3: Integrate Sync into UI
**Time Estimate:** 45 minutes  
**Outcome:** Users can sync portfolio with one click from a dedicated Trade Republic tab

#### Design Decisions (2024-12-07)

1. **Move to `tabs/` directory:** Move TR functionality from `pages/tr_login.py` to `tabs/trade_republic.py` for consistency
2. **Remove `pages/` directory:** All functionality must be in Streamlit tabs only - no separate pages that could create Tauri sidebar
3. **Use `render()` function:** Consistent with all other tabs (not `render_login_ui()`)
4. **Dedicated TR Tab:** "Trade Republic" tab with both login AND sync functionality
5. **Auto-sync on login:** Automatically sync portfolio after successful authentication
6. **Manual sync button:** Also provide a manual "Sync Portfolio" button for subsequent syncs
7. **Performance tab:** Show simple message with link to TR tab when no data (no embedded login)

| Task | File | Action |
|------|------|--------|
| 3.1 | `dashboard/tabs/trade_republic.py` | **New file:** Create Trade Republic tab (move from `pages/tr_login.py`) |
| 3.2 | `dashboard/tabs/trade_republic.py` | Rename function to `render()` for consistency with other tabs |
| 3.3 | `dashboard/tabs/trade_republic.py` | Add auto-sync after successful authentication |
| 3.4 | `dashboard/tabs/trade_republic.py` | Add manual "Sync Portfolio" button for authenticated users |
| 3.5 | `dashboard/pages/` | **Delete directory:** Remove entire `pages/` folder (prevent Tauri sidebar) |
| 3.6 | `dashboard/tabs/performance.py` | Replace "bash run.sh" warning with message linking to TR tab |
| 3.7 | `dashboard/app.py` | Update import from `pages.tr_login` to `tabs.trade_republic` |
| 3.8 | `dashboard/app.py` | Update tab name to "🔗 Trade Republic" and call `trade_republic.render()` |
| 3.9 | — | Rebuild binary (`pyinstaller prism.spec`) |
| 3.10 | — | Test full flow: Login → Auto-sync → View Dashboard |
| 3.11 | — | Test manual sync: Click button → Data refreshes |

### Phase 4: Core Plumbing & Sync Verification (Fast Path)
**Time Estimate:** 1.5 hours
**Outcome:** Dashboard works, Sync is reliable, User sees their data immediately.

| Task | File | Action |
|------|------|--------|
| 4.1 | `dashboard/utils.py` | **Fix Paths:** Create `get_data_path()` helper to resolve `PRISM_DATA_DIR` vs bundled paths. |
| 4.2 | `dashboard/tabs/*.py` | **Apply Fix:** Update `performance.py` (and others) to use `get_data_path()`. |
| 4.3 | `data/tr_sync.py` | **Fix Async Bug:** Replace `asyncio.run()` with `loop.run_until_complete()` to fix manual sync crash. |
| 4.4 | `data/tr_sync.py` | **Basic State Load:** Call `state_manager.load_portfolio_state()` after sync to populate `asset_universe.csv`. |
| 4.5 | `dashboard/tabs/trade_republic.py` | **UX - Sync Summary:** Add "Verify" step. Show summary metrics (Total Value, Cash, Count) and top 5 positions table immediately after sync. |
| 4.6 | `dashboard/tabs/trade_republic.py` | **UX - Transition:** Show "Go to Performance Dashboard" button only *after* successful sync/verification. |

### Phase 5: Deep Analytics Pipeline
**Moved to dedicated plan:** `docs/PLAN_ANALYTICS_PIPELINE.md`
Due to high complexity and refactoring risks, the pipeline porting has been moved to a dedicated execution plan.

---

## 4. Technical Specifications

### 4.1 TRDataFetcher Class Design (Corrected)

```python
# src-tauri/python/portfolio_src/data/tr_sync.py
"""
Trade Republic Data Sync Module

Replaces POC/scripts/fetch_tr_api.py with direct library calls.
"""

import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any

from pytr.api import TradeRepublicApi
from pytr.portfolio import Portfolio

from prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class TRDataFetcher:
    """
    Fetches portfolio data from Trade Republic using pytr library directly.
    
    Usage:
        fetcher = TRDataFetcher(api)
        positions = fetcher.fetch_portfolio_sync()
        fetcher.save_to_csv(positions, output_path)
    """
    
    def __init__(self, api: TradeRepublicApi):
        self.api = api
        self._portfolio: Optional[Portfolio] = None
    
    async def fetch_portfolio(self) -> List[Dict[str, Any]]:
        """Fetch portfolio positions with current prices."""
        # Portfolio only takes 'tr' parameter!
        self._portfolio = Portfolio(tr=self.api)
        
        await self._portfolio.portfolio_loop()
        
        positions = []
        for pos in self._portfolio.portfolio["positions"]:
            # IMPORTANT: netSize and averageBuyIn are STRINGS, not floats!
            quantity = float(pos.get("netSize", "0"))
            avg_cost = float(pos.get("averageBuyIn", "0"))
            net_value = float(pos.get("netValue", 0))
            
            # Calculate current price (no "price" key in pytr output)
            current_price = net_value / quantity if quantity > 0 else 0
            
            positions.append({
                "isin": pos["instrumentId"],
                "name": pos.get("name", "Unknown"),
                "quantity": quantity,
                "avg_cost": avg_cost,
                "current_price": current_price,
                "net_value": net_value,
            })
        
        logger.info(f"Fetched {len(positions)} positions from Trade Republic")
        return positions
    
    def fetch_portfolio_sync(self) -> List[Dict[str, Any]]:
        """Synchronous wrapper for Streamlit compatibility."""
        return asyncio.run(self.fetch_portfolio())
    
    def save_to_csv(self, positions: List[Dict], output_path: Path) -> int:
        """
        Save positions to CSV in pipeline-compatible format.
        
        Format: ISIN,Quantity,AvgCost,CurrentPrice,NetValue,TR_Name
        (Compatible with state_manager.py expectations)
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, "w", encoding="utf-8") as f:
            f.write("ISIN,Quantity,AvgCost,CurrentPrice,NetValue,TR_Name\n")
            for pos in positions:
                # Escape name for CSV
                name = pos["name"].replace('"', '""')
                if "," in name or '"' in name:
                    name = f'"{name}"'
                
                f.write(
                    f"{pos['isin']},{pos['quantity']:.6f},{pos['avg_cost']:.4f},"
                    f"{pos['current_price']:.4f},{pos['net_value']:.2f},{name}\n"
                )
        
        logger.info(f"Saved {len(positions)} positions to {output_path}")
        return len(positions)
```

### 4.2 Corrected TRAuthManager (Key Changes)

The current `tr_auth.py` has multiple bugs. Here are the required fixes:

```python
# 1. Fix import (Line 26)
# OLD: from pytr.api import Api as TRApi
# NEW:
from pytr.api import TradeRepublicApi as TRApi

# 2. Add wrapper for pytr typo
def initiate_weblogin(self):
    """Wrapper for pytr's typo: inititate_weblogin -> initiate_weblogin"""
    return self._api.inititate_weblogin()

# 3. Fix request_2fa method - use Web Login flow
async def request_2fa(self, phone_number: str, pin: str) -> AuthResult:
    # ... validation ...
    
    try:
        self._api = TRApi(
            phone_no=phone_number,
            pin=pin,
            save_cookies=True,
            cookies_file=str(self.auth_dir / "tr_cookies.txt")
        )
        
        # Use Web Login, NOT device login
        countdown = self._api.inititate_weblogin()  # Note: typo in pytr
        
        self._state = AuthState.WAITING_FOR_2FA
        return AuthResult(
            success=True,
            state=AuthState.WAITING_FOR_2FA,
            message=f"Check your Trade Republic app for the verification code."
        )

# 4. Fix verify_2fa method - use complete_weblogin
async def verify_2fa(self, code: str) -> AuthResult:
    # ... validation ...
    
    try:
        # Use complete_weblogin, NOT complete_login (which doesn't exist)
        self._api.complete_weblogin(code)
        
        # Session is automatically saved via save_cookies=True
        self._state = AuthState.AUTHENTICATED
        return AuthResult(...)

# 5. Add session restoration
async def try_restore_session(self, phone_number: str) -> AuthResult:
    try:
        self._api = TRApi(
            phone_no=phone_number,
            pin="",  # Not needed for session restore
            save_cookies=True,
            cookies_file=str(self.auth_dir / "tr_cookies.txt")
        )
        
        if self._api.resume_websession():
            self._state = AuthState.AUTHENTICATED
            return AuthResult(success=True, ...)
        else:
            return AuthResult(success=False, message="Session expired")

# 6. Add .api property for data sync
@property
def api(self) -> Optional[TRApi]:
    """Get authenticated API instance for data fetching."""
    if self._state == AuthState.AUTHENTICATED:
        return self._api
    return None
```

### 4.3 Trade Republic Tab Structure (Phase 3)

The Trade Republic functionality should be moved from `pages/tr_login.py` to `tabs/trade_republic.py` for consistency with other tabs. This ensures:
- All tabs are in one directory (`tabs/`)
- Consistent `render()` function pattern
- No `pages/` directory that could trigger Streamlit's multipage behavior in Tauri

**File location:** `dashboard/tabs/trade_republic.py`

**Key changes from `pages/tr_login.py`:**
1. Move file to `tabs/` directory
2. Rename main function from `render_login_ui()` to `render()`
3. Add auto-sync and manual sync functionality
4. Keep lazy import pattern for `core.tr_auth`

```python
# dashboard/tabs/trade_republic.py - NEW FILE (moved from pages/tr_login.py)
"""
Trade Republic Tab - Login and Portfolio Sync

Provides:
- Trade Republic authentication (Web Login flow)
- Auto-sync on successful login
- Manual portfolio sync button
"""

import streamlit as st
from pathlib import Path
import os


def _get_auth_manager():
    """Get or create the TRAuthManager instance with lazy import."""
    # Lazy import to avoid pytr asyncio initialization at module load
    from core.tr_auth import TRAuthManager
    
    if "tr_auth_manager" not in st.session_state:
        data_dir = Path(os.getenv("PRISM_DATA_DIR", "~/.prism/data")).expanduser()
        st.session_state.tr_auth_manager = TRAuthManager(data_dir)
    return st.session_state.tr_auth_manager


def _sync_portfolio(auth_manager) -> tuple[bool, str]:
    """
    Sync portfolio from Trade Republic.
    
    Returns:
        (success, message) tuple
    """
    from data.tr_sync import TRDataFetcher
    from prism_utils.error_reporter import error_reporter
    
    try:
        fetcher = TRDataFetcher(auth_manager.api)
        positions = fetcher.fetch_portfolio_sync()
        
        # Save to data/working/ subdirectory
        output_path = Path(os.getenv("PRISM_DATA_DIR")) / "data" / "working" / "calculated_holdings.csv"
        count = fetcher.save_to_csv(positions, output_path)
        
        return True, f"Successfully synced {count} positions!"
    except Exception as e:
        error_reporter.capture_error(e, "tr_login", "sync_portfolio")
        return False, f"Sync failed: {e}"


def render_trade_republic_tab():
    """Render the Trade Republic tab with login and sync functionality."""
    from core.tr_auth import AuthState, run_async
    
    st.title("🔗 Trade Republic")
    st.markdown("---")
    
    auth_manager = init_auth_manager()
    state = auth_manager.state
    
    # === AUTHENTICATED STATE ===
    if state == AuthState.AUTHENTICATED:
        st.success("✅ Connected to Trade Republic")
        
        col1, col2 = st.columns([3, 1])
        with col1:
            st.info(f"📱 Account: {st.session_state.get('tr_phone', 'Unknown')}")
        with col2:
            if st.button("🚪 Disconnect"):
                auth_manager.clear_credentials(st.session_state.get('tr_phone'))
                st.session_state.pop('tr_phone', None)
                st.session_state.pop('tr_just_synced', None)
                st.rerun()
        
        st.markdown("---")
        
        # === SYNC SECTION ===
        st.subheader("📊 Portfolio Sync")
        
        # Check if we just authenticated (trigger auto-sync)
        if st.session_state.get('tr_just_authenticated', False):
            st.session_state.tr_just_authenticated = False
            with st.spinner("Auto-syncing portfolio..."):
                success, message = sync_portfolio(auth_manager)
                if success:
                    st.success(message)
                    st.session_state.tr_just_synced = True
                else:
                    st.error(message)
        
        # Manual sync button
        if st.button("🔄 Sync Portfolio Now", type="primary"):
            with st.spinner("Fetching portfolio from Trade Republic..."):
                success, message = sync_portfolio(auth_manager)
                if success:
                    st.success(message)
                    st.balloons()
                else:
                    st.error(message)
        
        # Show last sync status
        if st.session_state.get('tr_just_synced'):
            st.caption("✅ Portfolio data is up to date. View it in the Performance tab.")
        
        return
    
    # === NOT AUTHENTICATED - Show login form ===
    # ... (existing login form code) ...
    
    # After successful verify_2fa:
    if result.success:
        st.session_state.tr_just_authenticated = True  # Trigger auto-sync
        st.success(result.message)
        st.rerun()
```

### 4.4 Performance Tab Update (Phase 3)

Replace the "bash run.sh" warnings with a user-friendly message:

```python
# performance.py - Replace lines 385 and 393

# OLD:
st.code("bash run.sh")
st.code("bash run.sh  # Select option [1] Trade Republic API")

# NEW:
st.info("📊 No portfolio data found.")
st.markdown("""
**To get started:**
1. Go to the **🔗 Trade Republic** tab
2. Log in with your Trade Republic credentials
3. Your portfolio will sync automatically

Once synced, return here to view your performance analytics.
""")
```

### 4.5 App.py Tab Rename (Phase 3)

```python
# app.py - Update tab name

# OLD:
tab1, tab2, tab3, tab4, tab5, tab6, tab7, tab8 = st.tabs([
    ...
    "🔐 TR Login",
])

# NEW:
tab1, tab2, tab3, tab4, tab5, tab6, tab7, tab8 = st.tabs([
    ...
    "🔗 Trade Republic",
])
```

### 4.6 CSV Format Compatibility

The output CSV must match what `state_manager.py` expects:

| Column | Type | Example | Notes |
|--------|------|---------|-------|
| ISIN | string | `IE00B4L5Y983` | Used for universe join |
| Quantity | float | `100.500000` | Position size |
| AvgCost | float | `75.4200` | From pytr `averageBuyIn` |
| CurrentPrice | float | `82.1500` | Calculated: `netValue / quantity` |
| NetValue | float | `8256.08` | From pytr `netValue` |
| TR_Name | string | `iShares Core MSCI World` | From pytr `name` (shortName) |

**state_manager.py Column Mapping:**
```python
df_clean = df.rename(columns={
    "ISIN": "isin",
    "Quantity": "quantity",
    "AvgCost": "avg_cost",
    "CurrentPrice": "tr_price",
    "NetValue": "tr_value",
    # TR_Name used by _auto_add_to_universe() for fallback naming
})
```

---

## 5. Technical Constraints

| Constraint | Mitigation |
|------------|------------|
| **Async in Streamlit** | Use `asyncio.run()` wrapper in `fetch_portfolio_sync()` |
| **Thread blocking** | Acceptable for MVP; shows spinner during fetch |
| **State passing** | `TRAuthManager` exposes `.api` property for authenticated instance |
| **PyInstaller detection** | All imports explicitly listed in `hidden_imports` |

---

## 6. Execution Checklist

### Phase 1: Fix Dependencies & Error Handling
- [ ] **1.1:** Update `prism.spec` with complete hidden imports (Section 2.3)
- [ ] **1.2:** Fix `tr_auth.py` import: `Api` → `TradeRepublicApi`
- [ ] **1.3:** Fix `tr_auth.py` auth flow: `login()` → `inititate_weblogin()` (note typo!)
- [ ] **1.4:** Fix `tr_auth.py` verify: `complete_login()` → `complete_weblogin()`
- [ ] **1.5:** Add cookie-based session persistence (`save_cookies=True`)
- [ ] **1.6:** Add session restoration with `resume_websession()`
- [ ] **1.7:** Create `prism_utils/error_reporter.py` (Section 2.5.3)
- [ ] **1.8:** Update `prism_utils/logging_config.py` for file logging
- [ ] **1.9:** Integrate error reporter into `tr_auth.py`
- [ ] **1.10:** Update `prism_boot.py` to create logs directory
- [ ] **1.11:** Move `tr_auth` imports to inside functions in `tr_login.py` (lazy import)
- [ ] **1.12:** Remove eager tr_login import from `pages/__init__.py`
- [ ] **1.13:** Use lazy import for tr_login in `app.py`
- [ ] **1.14:** Add event loop creation before pytr import in `tr_auth.py` (Section 2.6.1)
- [ ] **1.15:** Rebuild binary (`pyinstaller prism.spec`)
- [ ] **1.16:** Test login flow with TR account

### Phase 2: Data Sync Module
- [ ] **2.1:** Create `data/tr_sync.py`
- [ ] **2.2:** Add `.api` property to `TRAuthManager`

### Phase 3: UI Integration
- [x] **3.1:** Restructure `tr_login.py` as "Trade Republic" tab with login + sync sections
- [x] **3.2:** Add auto-sync after successful authentication
- [x] **3.3:** Add manual "Sync Portfolio" button for authenticated users
- [x] **3.4:** Update `performance.py` - replace "bash run.sh" with link to TR tab
- [x] **3.5:** Update `app.py` - rename tab to "🔗 Trade Republic"
- [x] **3.6:** Rebuild binary (`pyinstaller prism.spec`)
- [x] **3.7:** Test full flow: Login → Auto-sync → View Dashboard
- [ ] **3.8:** Test manual sync button
- [ ] **3.9:** Fix websockets bundling: Add `collect_submodules('websockets')` to prism.spec (Section 2.7)

### Phase 4: Core Plumbing & Sync Verification (Fast Path)
- [x] **4.1:** Create `get_data_path()` helper in `dashboard/utils.py`
- [x] **4.2:** Update `performance.py` and other tabs to use dynamic paths
- [x] **4.3:** Fix manual sync crash: Replace `asyncio.run()` with `loop.run_until_complete()` in `tr_sync.py`
- [x] **4.4:** Auto-populate universe: Call `state_manager.load_portfolio_state()` after sync
- [x] **4.5:** Update TR Tab: Show immediate sync summary (Total Value, Cash, Position count)
- [x] **4.6:** Update TR Tab: Add "Go to Dashboard" button (gated by sync success)

### Phase 5: Deep Analytics Pipeline
- [ ] Moved to `docs/PLAN_ANALYTICS_PIPELINE.md`

---

## 7. Files to Modify

| File | Phase | Changes |
|------|-------|---------|
| `src-tauri/python/prism.spec` | 1 | Add ~30 hidden imports |
| `src-tauri/python/prism_boot.py` | 1 | Create logs directory on startup |
| `src-tauri/python/portfolio_src/prism_utils/error_reporter.py` | 1 | **New file** — Error reporter module |
| `src-tauri/python/portfolio_src/prism_utils/logging_config.py` | 1 | Add file logging support |
| `src-tauri/python/portfolio_src/core/tr_auth.py` | 1, 2 | **Major rewrite:** Fix import, auth flow, session persistence, `.api` property, **event loop creation** |
| `src-tauri/python/portfolio_src/dashboard/pages/__init__.py` | 1 | Remove eager tr_login import (fixes asyncio error) |
| `src-tauri/python/portfolio_src/dashboard/app.py` | 1, 3 | Lazy import (Phase 1) + Rename tab to "🔗 Trade Republic" (Phase 3) |
| `src-tauri/python/portfolio_src/data/tr_sync.py` | 2 | **New file** — TRDataFetcher class |
| `src-tauri/python/portfolio_src/dashboard/pages/tr_login.py` | 1, 3 | **Lazy imports** (Phase 1) + **Major update:** Trade Republic tab with login, auto-sync, manual sync (Phase 3) |
| `src-tauri/python/portfolio_src/dashboard/tabs/performance.py` | 3 | Replace "bash run.sh" warning with link to Trade Republic tab |

---

## 8. Success Criteria

1. **Login works:** User can authenticate via Trade Republic tab in bundled app
2. **Auto-sync works:** Portfolio syncs automatically after successful login
3. **Manual sync works:** User can click "Sync Portfolio Now" button to refresh data
4. **Dashboard works:** Performance tab shows synced data without "bash run.sh" message
5. **No terminal required:** Entire flow works without opening a shell
6. **Error reporting:** Failures generate detailed logs with GitHub issue instructions
7. **Tab renamed:** Tab shows as "🔗 Trade Republic" (not "🔐 TR Login")

---

## 9. Error Reporting Workflow

When an error occurs, users should:

1. **See a clear message** in the UI explaining what went wrong
2. **Find the error log** at `$PRISM_DATA_DIR/logs/prism_errors.log`
3. **Create a GitHub issue** at https://github.com/Skeptomenos/Portfolio-Prism-App/issues/new
4. **Attach the log file** for developer analysis

The error log includes:
- Timestamp and app version
- Full stack trace
- Dependency check results (which modules loaded/failed)
- Platform information

This enables rapid debugging without requiring users to understand Python.

---

## 2.6 Asyncio Event Loop Error (Runtime Issue)

### Problem

After fixing the import issues, the app crashes on startup with:
```
RuntimeError: There is no current event loop in thread 'ScriptRunner.scriptThread'
```

**Root Cause:** The `pytr` library creates an `asyncio.Lock()` at class definition time (module load), not instance creation. Streamlit runs in a separate thread without an event loop, causing the import to fail.

**Stack Trace:**
```
File "dashboard/pages/tr_login.py", line 12, in <module>
    from core.tr_auth import TRAuthManager, AuthState, run_async
File "core/tr_auth.py", line 41, in <module>
    from pytr.api import TradeRepublicApi as TRApi
File "pytr/api.py", line 65, in TradeRepublicApi
    asyncio.Lock()  # Fails - no event loop in thread
```

### Solution: Lazy Import Pattern (Option A)

Move the `tr_auth` import from module level to inside functions that use it. This defers the pytr import until the TR Login tab is actually visited.

**Files to modify:**

1. **`dashboard/pages/__init__.py`** — Remove or defer tr_login import
2. **`dashboard/pages/tr_login.py`** — Move imports inside functions
3. **`dashboard/app.py`** — Use lazy import for tr_login module

### Implementation

**`dashboard/pages/__init__.py`:**
```python
# BEFORE:
from dashboard.pages import tr_login

# AFTER: Remove the tr_login import entirely
# (Other page imports can remain if they don't trigger pytr)
```

**`dashboard/pages/tr_login.py`:**
```python
# BEFORE (top of file):
from core.tr_auth import TRAuthManager, AuthState, run_async

def render_login_ui():
    auth_manager = get_auth_manager()
    ...

# AFTER (lazy import inside functions):
def get_auth_manager():
    """Get or create the TRAuthManager instance with lazy import."""
    from core.tr_auth import TRAuthManager  # Lazy import here
    
    if "tr_auth_manager" not in st.session_state:
        st.session_state.tr_auth_manager = TRAuthManager()
    return st.session_state.tr_auth_manager

def render_login_ui():
    from core.tr_auth import AuthState, run_async  # Lazy import here
    
    auth_manager = get_auth_manager()
    ...
```

**`dashboard/app.py`:**
```python
# BEFORE:
from dashboard.pages import tr_login
...
with tab8:
    tr_login.render_login_ui()

# AFTER - Import module directly when needed:
...
with tab8:
    from dashboard.pages import tr_login  # Lazy import
    tr_login.render_login_ui()
```

### Why Lazy Import (Option A) Over Other Options

| Criteria | Option A (Lazy) | Option B/C (Event Loop) |
|----------|-----------------|-------------------------|
| Fixes root cause | Yes | No (workaround) |
| Side effects | None | Creates event loop globally |
| Startup performance | Faster (defer heavy import) | Neutral |
| Architectural purity | Best practice | Workaround |
| Future-proof | Works regardless of pytr changes | May break |
| Maintenance | Slightly higher | Low |

### Benefits

1. **Faster cold start** — pytr only loads when TR Login tab is visited
2. **No global side effects** — doesn't create event loops in wrong threads
3. **Resilient** — works regardless of how pytr handles asyncio internally
4. **Testable** — easier to mock imports in tests

---

### 2.6.1 ADDITIONAL FIX REQUIRED: Event Loop Creation (Option C)

> **Added:** 2024-12-07 after testing revealed lazy imports alone are insufficient

#### Problem

Lazy imports successfully defer pytr loading until the TR Login tab is visited. However, **Streamlit's ScriptRunner thread still has no event loop** when the tab is rendered, so the asyncio error still occurs - just later.

**Error persists:**
```
RuntimeError: There is no current event loop in thread 'ScriptRunner.scriptThread'
```

**Stack trace shows lazy import working but still failing:**
```
File "app.py", line 65 → from dashboard.pages import tr_login  # Lazy - good
File "tr_login.py", line 30 → from core.tr_auth import ...     # Inside function - good  
File "tr_auth.py", line 41 → from pytr.api import ...          # Still fails!
```

#### Solution: Combine Lazy Imports + Event Loop Creation

**Both approaches are needed:**
- **Lazy imports** = Faster cold start, pytr only loads when needed
- **Event loop creation** = Ensures pytr can initialize when it does load

#### Implementation

Add event loop creation at the **top of `tr_auth.py`**, before any pytr imports:

```python
# tr_auth.py - Add at line 13 (after standard library imports, before pytr import)

import asyncio

# CRITICAL: Ensure event loop exists before importing pytr
# pytr creates asyncio.Lock() at class definition time (line 65 in pytr/api.py),
# which requires an event loop to exist. Streamlit's ScriptRunner thread 
# doesn't have one by default.
try:
    asyncio.get_event_loop()
except RuntimeError:
    asyncio.set_event_loop(asyncio.new_event_loop())
```

**Full context - where to add in tr_auth.py:**
```python
import os
import json
import asyncio  # Already imported
from pathlib import Path
from datetime import datetime
from typing import Optional
from enum import Enum
from dataclasses import dataclass

# CRITICAL: Ensure event loop exists before importing pytr
# (add the try/except block here, before line 22)

from prism_utils.logging_config import get_logger
from prism_utils.error_reporter import error_reporter
...
```

#### Why Both Approaches Are Needed

| Approach | What it does | Why it's needed |
|----------|--------------|-----------------|
| Lazy imports | Defer pytr load to tab visit | Faster app startup |
| Event loop creation | Ensure asyncio works in Streamlit thread | pytr requires event loop at import time |

**Without lazy imports:** App startup slower (loads pytr even if TR Login never used)
**Without event loop creation:** Error occurs when TR Login tab visited

---

### 2.7 websockets v15 Module Structure Issue (Sync Failure)

> **Added:** 2024-12-07 after testing revealed sync fails with `additional_headers` error

#### Problem

After successful login, portfolio sync fails with:
```
Sync failed: create_connection() got an unexpected keyword argument 'additional_headers'
```

**Root Cause:** `websockets` v15 reorganized its internal module structure:
- Old (v10-13): Implementation in `websockets.client`
- New (v14+): Implementation moved to `websockets.asyncio.client`

PyInstaller was only bundling explicit imports (`websockets`, `websockets.client`, `websockets.exceptions`), missing the new `websockets.asyncio.*` submodules where the actual implementation lives.

#### Investigation

```python
# pytr/api.py line 293-294:
self._ws = await websockets.connect(
    "wss://api.traderepublic.com", ssl=ssl_context, additional_headers=extra_headers
)
```

The `websockets.connect` function in v15 forwards to `websockets.asyncio.client.connect()`, which supports `additional_headers`. But if PyInstaller doesn't bundle `websockets.asyncio.client`, Python falls back to a stub that doesn't support the parameter.

#### Solution

Use `collect_submodules('websockets')` in `prism.spec` instead of manually listing individual modules:

```python
# prism.spec - Add after line 104:
hidden_imports += collect_submodules('websockets')
```

This automatically captures all 40+ websockets submodules including:
- `websockets.asyncio.client` (main implementation)
- `websockets.asyncio.connection`
- `websockets.legacy.*` (fallback)
- etc.

#### Why This Is Better

| Approach | Pros | Cons |
|----------|------|------|
| Manual listing | Explicit control | Breaks on library updates |
| `collect_submodules()` | Future-proof, automatic | Slightly larger bundle |

**Recommendation:** Use `collect_submodules()` for complex packages with internal restructuring between versions.
