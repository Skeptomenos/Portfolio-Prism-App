"""Echo-Bridge HTTP Transport.

Development transport for the user→dev feedback loop.
Provides an HTTP API that mirrors the stdin/stdout IPC protocol.

This is strategic infrastructure for rapid iteration:
- Frontend developers can test without building the full Tauri app
- Enables hot-reload workflows
- Provides a REST-like interface for debugging
"""

import asyncio
import os
import sys
from contextlib import asynccontextmanager
from typing import Any

from portfolio_src.headless.dispatcher import dispatch
from portfolio_src.headless.lifecycle import get_session_id
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# Engine version
VERSION = "0.1.0"

# Check if HTTP dependencies are available
try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn

    HAS_HTTP = True
except ImportError:
    HAS_HTTP = False


def run_echo_bridge(host: str = "0.0.0.0", port: int = 5001) -> None:
    """Run the Echo-Bridge HTTP server.

    Provides an HTTP API for development and testing:
    - POST /command - Execute IPC command (same format as stdin)
    - GET / - Server status
    - GET /health - Health check

    Args:
        host: Bind address (default: 0.0.0.0 for all interfaces).
        port: Listen port (default: 5001).

    Note:
        Requires fastapi and uvicorn to be installed.
        These are excluded from the PyInstaller build to reduce size.
    """
    if not HAS_HTTP:
        print("Error: fastapi and uvicorn are required for HTTP mode.")
        print("Install with: pip install fastapi uvicorn")
        sys.exit(1)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        """FastAPI lifespan handler for startup/shutdown."""
        from portfolio_src.prism_utils.sentinel import audit_previous_session

        # Start background audit on startup
        asyncio.create_task(audit_previous_session())
        logger.info(f"Echo-Bridge started, session: {get_session_id()}")
        yield
        logger.info("Echo-Bridge shutting down")

    app = FastAPI(
        title="Prism Echo-Bridge",
        description="Development HTTP transport for Prism Headless Engine",
        version=VERSION,
        lifespan=lifespan,
    )

    # Enable CORS for development
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Token for basic auth (prevents accidental exposure)
    echo_token = os.environ.get("PRISM_ECHO_TOKEN", "dev-echo-bridge-secret")

    # Commands that don't need logging (high frequency)
    QUIET_COMMANDS = {
        "get_health",
        "get_engine_health",
        "tr_get_auth_status",
        "tr_check_saved_session",
    }

    @app.post("/command")
    async def http_command(request: Request) -> dict[str, Any]:
        """Execute an IPC command via HTTP.

        Request Headers:
            X-Echo-Bridge-Token: Authentication token

        Request Body:
            JSON command matching IPC format:
            {"command": "...", "id": 1, "payload": {...}}

        Returns:
            JSON response matching IPC format.
        """
        # Validate token
        token = request.headers.get("X-Echo-Bridge-Token")
        if token != echo_token:
            logger.warning("Echo-Bridge: Unauthorized request")
            return {
                "id": 0,
                "status": "error",
                "error": {"code": "UNAUTHORIZED", "message": "Invalid token"},
            }

        try:
            cmd = await request.json()
            command = cmd.get("command", "")

            # Log non-quiet commands
            if command not in QUIET_COMMANDS:
                logger.info(f"Echo-Bridge: {command}")

            return await dispatch(cmd)
        except Exception as e:
            logger.error(f"Echo-Bridge Error: {e}", exc_info=True)
            return {
                "id": 0,
                "status": "error",
                "error": {"code": "HTTP_ERROR", "message": str(e)},
            }

    @app.get("/")
    async def http_root() -> dict[str, str]:
        """Server status endpoint."""
        return {
            "status": "online",
            "mode": "Echo-Bridge",
            "version": VERSION,
        }

    @app.get("/health")
    async def http_health() -> dict[str, str]:
        """Health check endpoint."""
        return {
            "status": "ok",
            "version": VERSION,
            "sessionId": get_session_id(),
        }

    logger.info(f"Starting Echo-Bridge on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_config=None)
