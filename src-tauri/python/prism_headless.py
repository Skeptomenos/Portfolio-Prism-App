#!/usr/bin/env python3
"""Prism Headless Engine - Entry Point.

This is the thin entry point for the headless engine.
All business logic is in portfolio_src.headless package.

Usage:
    python prism_headless.py          # Stdin/stdout IPC mode (production)
    python prism_headless.py --http   # HTTP Echo-Bridge mode (development)
"""

import argparse
import asyncio
import os
import sys

# SSL certificate setup for PyInstaller bundles
if getattr(sys, "frozen", False):
    try:
        import certifi

        os.environ["SSL_CERT_FILE"] = certifi.where()
        os.environ["REQUESTS_CA_BUNDLE"] = certifi.where()
    except ImportError:
        pass

# Configure stdout line buffering
try:
    reconfig = getattr(sys.stdout, "reconfigure", None)
    if reconfig:
        reconfig(line_buffering=True)
except Exception:
    pass

# Install global exception handler
from portfolio_src.prism_utils.logging_config import get_logger


def global_exception_handler(exctype, value, tb):
    """Log unhandled exceptions before crashing."""
    logger = get_logger("PrismHeadless")
    logger.critical(
        "Unhandled exception",
        exc_info=(exctype, value, tb),
        extra={"component": "pipeline", "category": "crash"},
    )
    sys.__excepthook__(exctype, value, tb)


sys.excepthook = global_exception_handler


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Prism Headless Engine")
    parser.add_argument(
        "--http", action="store_true", help="Start HTTP server (Echo-Bridge)"
    )
    parser.add_argument("--port", type=int, default=5001, help="HTTP server port")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="HTTP server host")
    args = parser.parse_args()

    # Import headless package
    from portfolio_src.headless import (
        setup_session,
        start_dead_mans_switch,
        install_default_config,
        init_database,
    )
    from portfolio_src.headless.transports import run_stdin_loop, run_echo_bridge

    # Start dead man's switch (terminates when parent dies)
    start_dead_mans_switch()

    # Initialize session
    setup_session(http_mode=args.http)

    # Install default config files and initialize database
    install_default_config()
    init_database()

    # Run appropriate transport
    if args.http:
        run_echo_bridge(args.host, args.port)
    else:
        asyncio.run(run_stdin_loop())


if __name__ == "__main__":
    main()
