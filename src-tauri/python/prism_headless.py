#!/usr/bin/env python3
"""
Prism Headless Entry Point

Standalone Python engine for IPC communication with Tauri shell.
Reads JSON commands from stdin, writes JSON responses to stdout.

Usage:
    # Interactive testing
    echo '{"id":1,"command":"get_health"}' | python prism_headless.py

    # As Tauri sidecar (spawned by Rust)
    PRISM_DATA_DIR=/path/to/data ./prism-headless

See: anamnesis/specs/ipc_api.md
"""

import sys
import os
import json
import threading
import time
import asyncio
from pathlib import Path

# DEBUG: Low-level trace
try:
    os.write(2, b"[PRISM] Starting up...\n")
except Exception:
    pass

# Handle PyInstaller frozen mode - ensure SSL certificates work
if getattr(sys, "frozen", False):
    try:
        import certifi

        os.environ["SSL_CERT_FILE"] = certifi.where()
        os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
    except ImportError:
        pass

# Ensure stdout is line-buffered for IPC
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

import logging

# Configure logging to write to stderr (so stdout is clean for IPC)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("PrismHeadless")

# Version
VERSION = "0.1.0"

_start_time = time.time()


def resource_path(relative_path: str) -> str:
    """
    Get absolute path to a resource.
    Works for both dev mode and PyInstaller frozen mode.
    """
    if hasattr(sys, "_MEIPASS"):
        # PyInstaller creates temp folder, stores path in _MEIPASS
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_path, relative_path)


def setup_python_path():
    """Confirms CWD is correct for imports."""
    # We no longer modify sys.path here.
    # The application relies on being run from the correct directory (src-tauri/python)
    # or having PYTHONPATH set correctly.
    pass


def dead_mans_switch(shutdown_event):
    """
    Monitor for shutdown signal.

    In headless mode, we detect parent death by stdin EOF in the main loop.
    This thread provides a backup mechanism via the shutdown event.
    """
    try:
        shutdown_event.wait()
    except Exception:
        pass
    finally:
        # Shutdown requested, exit cleanly
        os._exit(0)


def handle_get_health(cmd_id: int, payload: dict) -> dict:
    """Handle get_health command."""
    from portfolio_src.data.database import get_db_path

    # Try to get memory usage, fall back if psutil not available
    memory_mb = 0.0
    try:
        import psutil

        process = psutil.Process(os.getpid())
        memory_mb = process.memory_info().rss / (1024 * 1024)
    except ImportError:
        # psutil not available, use resource module as fallback
        try:
            import resource

            memory_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (
                1024 * 1024
            )
        except Exception:
            pass

    uptime = time.time() - _start_time

    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "version": VERSION,
            "memoryUsageMb": round(memory_mb, 1),
            "uptimeSeconds": round(uptime, 1),
            "dbPath": str(get_db_path()),
        },
    }


# =============================================================================
# TRADE REPUBLIC AUTH HANDLERS
# =============================================================================

# Global singleton for auth state management
_auth_manager = None
_bridge = None


def get_auth_manager():
    """Get singleton TRAuthManager instance."""
    global _auth_manager
    if _auth_manager is None:
        from portfolio_src.core.tr_auth import TRAuthManager

        _auth_manager = TRAuthManager()
    return _auth_manager


def get_bridge():
    """Get singleton TRBridge instance."""
    global _bridge
    if _bridge is None:
        from portfolio_src.core.tr_bridge import TRBridge

        _bridge = TRBridge.get_instance()
    return _bridge


def error_response(cmd_id: int, code: str, message: str) -> dict:
    """Create standardized error response."""
    return {
        "id": cmd_id,
        "status": "error",
        "error": {"code": code, "message": message},
    }


def emit_progress(progress: int, message: str):
    """Emit progress event to stdout."""
    print(
        json.dumps(
            {
                "event": "sync_progress",
                "data": {"progress": progress, "message": message},
            }
        )
    )
    sys.stdout.flush()


def handle_tr_get_auth_status(cmd_id: int, payload: dict) -> dict:
    """Handle tr_get_auth_status command."""
    try:
        bridge = get_bridge()
        status = bridge.get_status()

        auth_state_map = {
            "authenticated": "authenticated",
            "idle": "idle",
            "waiting_2fa": "waiting_2fa",
        }
        auth_state = auth_state_map.get(status.get("status"), "idle")

        # Check for stored credentials
        auth_manager = get_auth_manager()
        has_credentials = auth_manager.has_credentials()

        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "authState": auth_state,
                "hasStoredCredentials": has_credentials,
                "lastError": auth_manager.last_error,
            },
        }
    except Exception as e:
        return error_response(cmd_id, "TR_AUTH_ERROR", str(e))


def handle_tr_check_saved_session(cmd_id: int, payload: dict) -> dict:
    """Handle tr_check_saved_session command."""
    try:
        # Check if cookie file exists
        data_dir = os.environ.get(
            "PRISM_DATA_DIR",
            os.path.expanduser("~/Library/Application Support/PortfolioPrism"),
        )
        cookies_file = os.path.join(data_dir, "tr_cookies.txt")

        has_session = os.path.exists(cookies_file)

        if has_session:
            # Get stored phone for masking
            auth_manager = get_auth_manager()
            phone = auth_manager.get_stored_phone()
            masked_phone = None
            if phone and len(phone) > 4:
                masked_phone = phone[:3] + "***" + phone[-4:]

            return {
                "id": cmd_id,
                "status": "success",
                "data": {
                    "hasSession": True,
                    "phoneNumber": masked_phone,
                    "prompt": "restore_session",
                },
            }
        else:
            return {
                "id": cmd_id,
                "status": "success",
                "data": {
                    "hasSession": False,
                    "phoneNumber": None,
                    "prompt": "login_required",
                },
            }
    except Exception as e:
        return error_response(cmd_id, "TR_SESSION_CHECK_ERROR", str(e))


def handle_tr_login(cmd_id: int, payload: dict) -> dict:
    """Handle tr_login command."""
    phone = payload.get("phone", "")
    pin = payload.get("pin", "")
    remember = payload.get("remember", True)

    if not phone or not pin:
        return error_response(
            cmd_id, "TR_INVALID_CREDENTIALS", "Phone number and PIN are required"
        )

    try:
        auth_manager = get_auth_manager()

        # Save credentials if remember is True
        if remember:
            auth_manager.save_credentials(phone, pin)

        # Run async request_2fa
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(auth_manager.request_2fa(phone, pin))
        finally:
            loop.close()

        if result.state.value == "authenticated":
            return {
                "id": cmd_id,
                "status": "success",
                "data": {
                    "authState": "authenticated",
                    "message": result.message,
                },
            }
        elif result.state.value == "waiting_for_2fa":
            return {
                "id": cmd_id,
                "status": "success",
                "data": {
                    "authState": "waiting_2fa",
                    "message": result.message,
                    "countdown": 30,
                },
            }
        else:
            return error_response(cmd_id, "TR_LOGIN_FAILED", result.message)

    except Exception as e:
        return error_response(cmd_id, "TR_LOGIN_ERROR", str(e))


def handle_tr_submit_2fa(cmd_id: int, payload: dict) -> dict:
    """Handle tr_submit_2fa command."""
    code = payload.get("code", "")

    if not code:
        return error_response(cmd_id, "TR_2FA_INVALID", "2FA code is required")

    try:
        auth_manager = get_auth_manager()

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(auth_manager.verify_2fa(code))
        finally:
            loop.close()

        if result.success:
            return {
                "id": cmd_id,
                "status": "success",
                "data": {
                    "authState": "authenticated",
                    "message": result.message,
                },
            }
        else:
            return error_response(cmd_id, "TR_2FA_INVALID", result.message)

    except Exception as e:
        return error_response(cmd_id, "TR_2FA_ERROR", str(e))


def handle_tr_logout(cmd_id: int, payload: dict) -> dict:
    """Handle tr_logout command."""
    try:
        auth_manager = get_auth_manager()
        auth_manager.logout()

        # Also delete cookies file
        data_dir = os.environ.get(
            "PRISM_DATA_DIR",
            os.path.expanduser("~/Library/Application Support/PortfolioPrism"),
        )
        cookies_file = os.path.join(data_dir, "tr_cookies.txt")
        if os.path.exists(cookies_file):
            os.remove(cookies_file)

        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "authState": "idle",
                "message": "Logged out and session cleared",
            },
        }
    except Exception as e:
        return error_response(cmd_id, "TR_LOGOUT_ERROR", str(e))


def handle_sync_portfolio(cmd_id: int, payload: dict) -> dict:
    """Handle sync_portfolio command with real TR data."""
    from portfolio_src.data.tr_sync import TRDataFetcher
    from portfolio_src.data.database import sync_positions_from_tr, update_sync_state

    portfolio_id = payload.get("portfolioId", 1)
    force = payload.get("force", False)

    # Emit progress
    emit_progress(0, "Starting sync...")

    try:
        bridge = get_bridge()

        # Check auth status
        status = bridge.get_status()

        # Auto-restore if not authenticated
        if status.get("status") != "authenticated":
            emit_progress(2, "Restoring session...")
            auth_manager = get_auth_manager()

            # Use run_async helper if available or inline loop - reusing pattern from login
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                restore_result = loop.run_until_complete(
                    auth_manager.try_restore_session()
                )
                if restore_result.success:
                    emit_progress(5, "Session restored.")
                    status = bridge.get_status()  # Refresh status
            except Exception as e:
                logger.error(f"Auto-restore failed: {e}")
            finally:
                loop.close()

        if status.get("status") != "authenticated":
            return error_response(
                cmd_id,
                "TR_AUTH_REQUIRED",
                "Please authenticate with Trade Republic first",
            )

        emit_progress(10, "Connecting to Trade Republic...")

        start_time = time.time()

        # Fetch portfolio via daemon
        fetcher = TRDataFetcher(bridge)
        emit_progress(30, "Fetching portfolio...")

        raw_positions = fetcher.fetch_portfolio_sync()

        emit_progress(50, f"Processing {len(raw_positions)} positions...")

        # Transform to database format
        tr_positions = []
        for pos in raw_positions:
            tr_positions.append(
                {
                    "isin": pos["isin"],
                    "name": pos["name"],
                    "symbol": "",  # Not available from TR
                    "quantity": pos["quantity"],
                    "cost_basis": pos["avg_cost"],
                    "current_price": pos["current_price"],
                    "asset_class": "Equity",  # Default - could be enriched later
                }
            )

        emit_progress(70, "Writing to database...")

        # Sync to SQLite
        sync_result = sync_positions_from_tr(portfolio_id, tr_positions)

        update_sync_state(
            "trade_republic",
            "success",
            f"Synced {sync_result['synced_positions']} positions",
        )

        duration_ms = int((time.time() - start_time) * 1000)

        emit_progress(100, "Sync complete! Run Deep Analysis to update X-Ray.")

        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "syncedPositions": sync_result["synced_positions"],
                "newPositions": sync_result["new_positions"],
                "updatedPositions": sync_result["updated_positions"],
                "totalValue": sync_result["total_value"],
                "durationMs": duration_ms,
            },
        }

    except Exception as e:
        update_sync_state("trade_republic", "error", str(e))
        return error_response(cmd_id, "TR_SYNC_FAILED", str(e))


def handle_run_pipeline(cmd_id: int, payload: dict) -> dict:
    """Handle run_pipeline command to trigger analytics independently."""
    import time
    from portfolio_src.core.pipeline import Pipeline

    emit_progress(0, "Starting analytics pipeline...")

    start_time = time.time()

    try:
        # Wrapper to map pipeline progress (0.0-1.0) to overall progress (0-100)
        def pipeline_progress(msg, pct):
            # UX: Artificial delay
            time.sleep(0.3)
            emit_progress(int(pct * 100), f"Analytics: {msg}")
            logger.info(f"Pipeline Progress: {msg} ({pct * 100}%)")

        pipeline = Pipeline()
        result = pipeline.run(progress_callback=pipeline_progress)

        duration_ms = int((time.time() - start_time) * 1000)

        if not result.success:
            logger.error(f"Pipeline failed: {result.errors}")
            emit_progress(100, "Analytics completed with warnings.")

            return {
                "id": cmd_id,
                "status": "success",  # Return success so UI can show warnings
                "data": {
                    "success": False,
                    "errors": [str(e) for e in result.errors],
                    "durationMs": duration_ms,
                },
            }
        else:
            emit_progress(100, "Analytics complete!")

            return {
                "id": cmd_id,
                "status": "success",
                "data": {"success": True, "errors": [], "durationMs": duration_ms},
            }

    except Exception as e:
        logger.error(f"Failed to run pipeline: {e}", exc_info=True)
        return error_response(cmd_id, "PIPELINE_ERROR", str(e))


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def _get_allocations_from_report() -> dict:
    """
    Read the TRUE_EXPOSURE_REPORT csv and aggregate by Sector/Geography.
    Returns: {"sector": {name: pct}, "region": {name: pct}}
    """
    try:
        from portfolio_src.config import TRUE_EXPOSURE_REPORT
        import pandas as pd

        if not os.path.exists(TRUE_EXPOSURE_REPORT):
            return None

        df = pd.read_csv(TRUE_EXPOSURE_REPORT)
        if df.empty:
            return None

        # Helper to aggregate and convert to dict
        def agg_to_dict(group_col):
            # Sum percentage by group
            grp = df.groupby(group_col)["portfolio_percentage"].sum()
            # Convert to dict, round to 2 decimals
            return {k: round(v, 2) for k, v in grp.items() if v > 0}

        return {"sector": agg_to_dict("sector"), "region": agg_to_dict("geography")}
    except Exception:
        return None


# =============================================================================
# ORIGINAL HANDLERS (unchanged)
# =============================================================================


def handle_get_dashboard_data(cmd_id: int, payload: dict) -> dict:
    """Handle get_dashboard_data command."""
    from portfolio_src.data.database import get_positions, count_positions

    portfolio_id = payload.get("portfolioId", 1)
    positions = get_positions(portfolio_id)
    position_count = len(positions)

    if position_count == 0:
        # Empty state
        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "totalValue": 0,
                "totalGain": 0,
                "gainPercentage": 0,
                "allocations": {"sector": {}, "region": {}, "assetClass": {}},
                "topHoldings": [],
                "lastUpdated": None,
                "isEmpty": True,
                "positionCount": 0,
            },
        }

    # Calculate totals from positions
    total_value = 0
    total_cost = 0
    holdings = []

    for pos in positions:
        quantity = pos.get("quantity", 0)
        current_price = pos.get("current_price") or pos.get("cost_basis") or 0
        cost_basis = pos.get("cost_basis") or current_price

        value = quantity * current_price
        cost = quantity * cost_basis
        pnl = value - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0

        total_value += value
        total_cost += cost

        holdings.append(
            {
                "isin": pos.get("isin", ""),
                "name": pos.get("name") or pos.get("isin", "Unknown"),
                "ticker": pos.get("symbol"),
                "value": round(value, 2),
                "weight": 0,  # Calculated after we have total
                "pnl": round(pnl, 2),
                "pnlPercentage": round(pnl_pct, 1),
                "quantity": quantity,
                "assetClass": pos.get("asset_class"),
            }
        )

    # Calculate weights
    for h in holdings:
        h["weight"] = round(h["value"] / total_value, 4) if total_value > 0 else 0

    # Sort by value descending, take top 10
    holdings.sort(key=lambda x: x["value"], reverse=True)
    top_holdings = holdings[:10]

    # Calculate total gain
    total_gain = total_value - total_cost
    gain_percentage = (total_gain / total_cost * 100) if total_cost > 0 else 0

    # Build allocations (simplified - use asset_class for now)
    asset_class_alloc = {}
    for h in holdings:
        ac = h.get("assetClass") or "Unknown"
        asset_class_alloc[ac] = asset_class_alloc.get(ac, 0) + h["weight"]

    # Load Real Analytics Allocations
    sector_alloc = {}
    region_alloc = {}

    try:
        allocs = _get_allocations_from_report()
        if allocs:
            sector_alloc = allocs.get("sector", {})
            region_alloc = allocs.get("region", {})
    except Exception as e:
        # Fallback to empty if analytics fail
        pass

    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "totalValue": round(total_value, 2),
            "totalGain": round(total_gain, 2),
            "gainPercentage": round(gain_percentage, 1),
            "allocations": {
                "sector": sector_alloc,
                "region": region_alloc,
                "assetClass": asset_class_alloc,
            },
            "topHoldings": top_holdings,
            "lastUpdated": None,  # TODO: Get from sync_state
            "isEmpty": False,
            "positionCount": position_count,
        },
    }


def handle_get_positions(cmd_id: int, payload: dict) -> dict:
    """Handle get_positions command - returns full position data for the table."""
    from portfolio_src.data.database import get_positions, get_sync_state
    from datetime import datetime

    portfolio_id = payload.get("portfolioId", 1)
    positions_raw = get_positions(portfolio_id)

    if not positions_raw:
        return {
            "id": cmd_id,
            "status": "success",
            "data": {
                "positions": [],
                "totalValue": 0,
                "totalCost": 0,
                "totalPnl": 0,
                "totalPnlPercent": 0,
                "lastSyncTime": None,
            },
        }

    # Calculate totals
    total_value = 0
    total_cost = 0
    positions = []

    for pos in positions_raw:
        quantity = pos.get("quantity", 0)
        current_price = pos.get("current_price") or pos.get("cost_basis") or 0
        avg_buy_price = pos.get("cost_basis") or current_price

        current_value = quantity * current_price
        total_cost_pos = quantity * avg_buy_price
        pnl_eur = current_value - total_cost_pos
        pnl_percent = (pnl_eur / total_cost_pos * 100) if total_cost_pos > 0 else 0

        total_value += current_value
        total_cost += total_cost_pos

        # Determine instrument type
        asset_class = pos.get("asset_class", "other")
        instrument_type = "stock"
        if asset_class:
            ac_lower = asset_class.lower()
            if "etf" in ac_lower:
                instrument_type = "etf"
            elif "crypto" in ac_lower:
                instrument_type = "crypto"
            elif "bond" in ac_lower:
                instrument_type = "bond"
            elif (
                "derivative" in ac_lower
                or "option" in ac_lower
                or "warrant" in ac_lower
            ):
                instrument_type = "derivative"

        positions.append(
            {
                "isin": pos.get("isin", ""),
                "name": pos.get("name") or pos.get("isin", "Unknown"),
                "ticker": pos.get("symbol") or "",
                "instrumentType": instrument_type,
                "quantity": quantity,
                "avgBuyPrice": round(avg_buy_price, 2),
                "currentPrice": round(current_price, 2),
                "currentValue": round(current_value, 2),
                "totalCost": round(total_cost_pos, 2),
                "pnlEur": round(pnl_eur, 2),
                "pnlPercent": round(pnl_percent, 2),
                "weight": 0,  # Calculated after we have total
                "currency": pos.get("currency") or "EUR",
                "notes": pos.get("notes") or "",
                "lastUpdated": pos.get("updated_at") or datetime.now().isoformat(),
            }
        )

    # Calculate weights
    for p in positions:
        p["weight"] = (
            round(p["currentValue"] / total_value * 100, 2) if total_value > 0 else 0
        )

    # Sort by value descending
    positions.sort(key=lambda x: x["currentValue"], reverse=True)

    # Get last sync time
    sync_state = get_sync_state("trade_republic")
    last_sync_time = sync_state.get("last_sync") if sync_state else None

    # Calculate total P&L
    total_pnl = total_value - total_cost
    total_pnl_percent = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "positions": positions,
            "totalValue": round(total_value, 2),
            "totalCost": round(total_cost, 2),
            "totalPnl": round(total_pnl, 2),
            "totalPnlPercent": round(total_pnl_percent, 2),
            "lastSyncTime": last_sync_time,
        },
    }


def dispatch(cmd: dict) -> dict:
    """Route command to appropriate handler."""
    command = cmd.get("command", "")
    cmd_id = cmd.get("id", 0)
    payload = cmd.get("payload", {})

    handlers = {
        "get_health": handle_get_health,
        "get_dashboard_data": handle_get_dashboard_data,
        "get_positions": handle_get_positions,
        "tr_get_auth_status": handle_tr_get_auth_status,
        "tr_check_saved_session": handle_tr_check_saved_session,
        "tr_login": handle_tr_login,
        "tr_submit_2fa": handle_tr_submit_2fa,
        "tr_logout": handle_tr_logout,
        "sync_portfolio": handle_sync_portfolio,
        "run_pipeline": handle_run_pipeline,
    }

    handler = handlers.get(command)
    if handler:
        try:
            return handler(cmd_id, payload)
        except Exception as e:
            return {
                "id": cmd_id,
                "status": "error",
                "error": {"code": "HANDLER_ERROR", "message": str(e)},
            }
    else:
        return {
            "id": cmd_id,
            "status": "error",
            "error": {
                "code": "UNKNOWN_COMMAND",
                "message": f"Unknown command: {command}",
            },
        }


def install_default_config() -> None:
    """
    Ensure default configuration files exist in the user data directory.
    Copies from bundled resources if missing.
    """
    import shutil

    # We must import config after environment setup or inside the function
    # but since PRISM_DATA_DIR is set in environment by Rust, config.py should resolve correctly.
    try:
        from portfolio_src.config import CONFIG_DIR, ASSET_UNIVERSE_PATH
    except ImportError:
        logger.error(
            "Could not import portfolio_src.config. Skipping default config install."
        )
        return

    logger.info(f"Checking configuration in: {CONFIG_DIR}")

    # Ensure config dir exists
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error(f"Failed to create config dir: {e}")
        return

    # List of files to install: filename -> target path (defaulting to CONFIG_DIR if not specific)
    # Asset universe might be in CONFIG_DIR or DATA_DIR depending on config.py,
    # but based on line 33 of config.py: ASSET_UNIVERSE_PATH = CONFIG_DIR / "asset_universe.csv"

    files_to_install = [
        "adapter_registry.json",
        "asset_universe.csv",
        "ishares_config.json",
        "ticker_map.json",
    ]

    for filename in files_to_install:
        target_path = CONFIG_DIR / filename

        # If file already exists, skip (don't overwrite user changes)
        if target_path.exists():
            continue

        # Look in bundled config
        # content of resource_path is basically sys._MEIPASS + relative_path
        # My spec mapped 'default_config' -> 'default_config' in root
        bundled_path = Path(resource_path(os.path.join("default_config", filename)))

        if bundled_path.exists():
            try:
                shutil.copy2(bundled_path, target_path)
                logger.info(f"Installed default config: {filename}")
            except Exception as e:
                logger.error(f"Failed to install {filename}: {e}")
        else:
            # Only warn if it's the critical registry, others might be optional
            log_level = logging.WARNING if "registry" in filename else logging.INFO
            logger.log(log_level, f"Default config not found in bundle: {bundled_path}")


def main():
    """Main entry point."""
    # Setup Python path for imports
    setup_python_path()

    # Create shutdown event for clean termination
    shutdown_event = threading.Event()

    # Start dead man's switch in background thread
    threading.Thread(
        target=dead_mans_switch, args=(shutdown_event,), daemon=True
    ).start()

    # Setup data directory
    data_dir = os.environ.get("PRISM_DATA_DIR")
    if data_dir:
        os.makedirs(data_dir, exist_ok=True)

    # Install default config if missing
    install_default_config()

    # Initialize database
    from portfolio_src.data.database import init_db

    init_db()

    # Print ready signal (Rust looks for this)
    ready_signal = {"status": "ready", "version": VERSION, "pid": os.getpid()}
    print(json.dumps(ready_signal))
    sys.stdout.flush()

    # Main command loop
    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                # stdin closed, exit
                break

            line = line.strip()
            if not line:
                continue

            # Parse command
            try:
                cmd = json.loads(line)
            except json.JSONDecodeError as e:
                error_response = {
                    "id": 0,
                    "status": "error",
                    "error": {
                        "code": "INVALID_JSON",
                        "message": f"Failed to parse JSON: {e}",
                    },
                }
                print(json.dumps(error_response))
                continue

            # Dispatch and respond
            response = dispatch(cmd)
            print(json.dumps(response))
            sys.stdout.flush()

        except KeyboardInterrupt:
            break
        except Exception as e:
            # Catch-all for unexpected errors
            error_response = {
                "id": 0,
                "status": "error",
                "error": {"code": "INTERNAL_ERROR", "message": str(e)},
            }
            print(json.dumps(error_response))
            sys.stdout.flush()


if __name__ == "__main__":
    main()
