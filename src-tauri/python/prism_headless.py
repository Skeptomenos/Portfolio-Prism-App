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


def dispatch(cmd: dict) -> dict:
    """Route command to appropriate handler."""
    command = cmd.get("command", "")
    cmd_id = cmd.get("id", 0)
    payload = cmd.get("payload", {})

    handlers = {
        "get_health": handle_get_health,
        "get_dashboard_data": handle_get_dashboard_data,
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
