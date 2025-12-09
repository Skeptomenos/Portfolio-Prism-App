#!/usr/bin/env python3
"""
Prism Bootloader - Entry point for the frozen Python application.

This script:
1. Finds a free port
2. Prints a JSON handshake to stdout for Tauri
3. Launches Streamlit programmatically
"""

import sys
import os
import json
import socket
import threading

# Ensure stdout is line-buffered for IPC with Tauri
sys.stdout.reconfigure(line_buffering=True)


def get_free_port() -> int:
    """Find an available ephemeral port."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("localhost", 0))
        return s.getsockname()[1]


def resource_path(relative_path: str) -> str:
    """
    Get the absolute path to a resource.
    Works for both dev mode and PyInstaller frozen mode.
    """
    if hasattr(sys, "_MEIPASS"):
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))

    return os.path.join(base_path, relative_path)


def dead_mans_switch():
    """Monitor stdin. If it closes (Tauri died), exit immediately."""
    try:
        sys.stdin.read()
    except Exception:
        pass
    finally:
        sys.exit(0)


def main():
    # Start Dead Man's Switch
    threading.Thread(target=dead_mans_switch, daemon=True).start()

    # 1. Find a free port
    port = get_free_port()

    # 2. Print handshake to stdout (Tauri will read this)
    handshake = {"port": port, "status": "ready", "mode": "streamlit"}
    print(json.dumps(handshake))
    sys.stdout.flush()

    # 3. Set up environment
    data_dir = os.environ.get("PRISM_DATA_DIR", os.path.expanduser("~/.prism/data"))
    os.makedirs(data_dir, exist_ok=True)
    os.environ["PRISM_DATA_DIR"] = data_dir

    # 4. Add portfolio_src to Python path for imports
    portfolio_src_path = resource_path("portfolio_src")
    if portfolio_src_path not in sys.path:
        sys.path.insert(0, portfolio_src_path)

    # 5. Run data migration (copies bundled defaults on first run)
    try:
        from core.migration import run_migration_if_needed

        run_migration_if_needed()
    except Exception as e:
        print(json.dumps({"warning": f"Migration failed: {e}"}))
        sys.stdout.flush()

    # 6. Launch Streamlit
    from streamlit.web import cli as stcli

    # The Streamlit app entry point (from portfolio_src)
    app_path = resource_path("portfolio_src/dashboard/app.py")

    # Emulate: streamlit run app.py --server.port=PORT --server.headless=true
    sys.argv = [
        "streamlit",
        "run",
        app_path,
        f"--server.port={port}",
        "--server.headless=true",
        "--global.developmentMode=false",
        "--server.enableCORS=false",
        "--server.enableXsrfProtection=false",
        "--browser.gatherUsageStats=false",
        "--server.fileWatcherType=none",
        "--client.showSidebarNavigation=false",
    ]

    sys.exit(stcli.main())


if __name__ == "__main__":
    main()
