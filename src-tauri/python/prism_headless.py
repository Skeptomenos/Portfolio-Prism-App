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

# Ensure stdout is line-buffered for IPC
sys.stdout.reconfigure(line_buffering=True)

# Track startup time for uptime calculation
_start_time = time.time()

# Version
VERSION = "0.1.0"


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
    """Add portfolio_src to Python path for imports."""
    portfolio_src_path = resource_path("portfolio_src")
    if portfolio_src_path not in sys.path:
        sys.path.insert(0, portfolio_src_path)


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


def handle_tr_get_auth_status(cmd_id: int, payload: dict) -> dict:
    """Handle tr_get_auth_status command."""
    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "authState": "idle",
            "hasStoredCredentials": False,
            "lastError": None,
        },
    }


def handle_tr_check_saved_session(cmd_id: int, payload: dict) -> dict:
    """Handle tr_check_saved_session command."""
    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "hasSession": False,
            "phoneNumber": None,
            "prompt": "login_required",
        },
    }


def handle_tr_login(cmd_id: int, payload: dict) -> dict:
    """Handle tr_login command."""
    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "authState": "waiting_2fa",
            "message": "Enter the 4-digit code from your Trade Republic app",
            "countdown": 30,
        },
    }


def handle_tr_submit_2fa(cmd_id: int, payload: dict) -> dict:
    """Handle tr_submit_2fa command."""
    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "authState": "authenticated",
            "message": "Successfully authenticated with Trade Republic",
        },
    }


def handle_tr_logout(cmd_id: int, payload: dict) -> dict:
    """Handle tr_logout command."""
    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "authState": "idle",
            "message": "Logged out and session cleared",
        },
    }


def handle_sync_portfolio(cmd_id: int, payload: dict) -> dict:
    """Handle sync_portfolio command."""
    import time
    from portfolio_src.data.database import sync_positions_from_tr, update_sync_state

    portfolio_id = payload.get("portfolioId", 1)

    # Mock progress events
    print(
        json.dumps(
            {
                "event": "sync_progress",
                "data": {"progress": 0, "message": "Starting sync..."},
            }
        )
    )
    sys.stdout.flush()

    start_time = time.time()

    # Mock data for testing
    time.sleep(1)  # Simulate work

    tr_positions = [
        {
            "isin": "US0378331005",
            "name": "Apple Inc.",
            "symbol": "AAPL",
            "quantity": 50,
            "cost_basis": 150.0,
            "current_price": 175.0,
            "asset_class": "Equity",
        }
    ]

    # Sync to database
    sync_result = sync_positions_from_tr(portfolio_id, tr_positions)

    # Update sync state
    update_sync_state(
        "trade_republic",
        "success",
        f"Synced {sync_result['synced_positions']} positions",
    )

    duration_ms = int((time.time() - start_time) * 1000)

    print(
        json.dumps(
            {
                "event": "sync_progress",
                "data": {"progress": 100, "message": "Sync complete!"},
            }
        )
    )
    sys.stdout.flush()

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


# =============================================================================
# REAL TRADE REPUBLIC AUTH HANDLERS
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

        # Check auth status first
        status = bridge.get_status()
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

        emit_progress(100, "Sync complete!")

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

    return {
        "id": cmd_id,
        "status": "success",
        "data": {
            "totalValue": round(total_value, 2),
            "totalGain": round(total_gain, 2),
            "gainPercentage": round(gain_percentage, 1),
            "allocations": {
                "sector": {},  # TODO: Populate from enrichment
                "region": {},  # TODO: Populate from enrichment
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
