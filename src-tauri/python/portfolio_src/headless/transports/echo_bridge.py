"""Echo-Bridge HTTP Transport.

Development transport for the user→dev feedback loop.
Provides an HTTP API that mirrors the stdin/stdout IPC protocol.

This is strategic infrastructure for rapid iteration:
- Frontend developers can test without building the full Tauri app
- Enables hot-reload workflows
- Provides a REST-like interface for debugging

SSE Support:
- GET /events - Server-Sent Events endpoint for real-time progress updates
- Broadcasts pipeline progress to all connected clients
"""

import asyncio
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from typing import Any, Optional, List, Dict, TypedDict

from portfolio_src.headless.dispatcher import dispatch
from portfolio_src.headless.lifecycle import get_session_id
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


# =============================================================================
# Pipeline Summary Event Types (XRAY-010)
# =============================================================================


class HoldingsSummary(TypedDict):
    """Holdings count and value summary."""

    stocks: int
    etfs: int
    total_value: float


class ETFDecompositionDetail(TypedDict, total=False):
    """Per-ETF decomposition result."""

    isin: str
    name: str
    holdings_count: int
    status: str  # 'success' | 'failed' | 'partial'
    source: str  # 'cached' | 'hive' | '{adapter}_adapter' (optional for SSE)


class DecompositionSummary(TypedDict):
    """ETF decomposition summary."""

    etfs_processed: int
    etfs_failed: int
    total_underlying: int
    per_etf: List[ETFDecompositionDetail]


class ResolutionSummary(TypedDict):
    """ISIN resolution summary."""

    total: int
    resolved: int
    unresolved: int
    skipped_tier2: int
    by_source: Dict[str, int]


class TimingSummary(TypedDict):
    """Pipeline phase timing summary."""

    total_seconds: float
    phases: Dict[str, float]


class UnresolvedItem(TypedDict):
    """Unresolved ISIN details for user action."""

    ticker: str
    name: str
    weight: float
    parent_etf: str
    reason: str  # 'api_all_failed' | 'no_ticker' | 'invalid_isin'


class PipelineSummaryData(TypedDict):
    """Complete pipeline summary data."""

    holdings: HoldingsSummary
    decomposition: DecompositionSummary
    resolution: ResolutionSummary
    timing: TimingSummary
    unresolved: List[UnresolvedItem]
    unresolved_truncated: bool
    unresolved_total: int


# Engine version
VERSION = "0.1.0"

# =============================================================================
# SSE Progress Broadcasting Infrastructure
# =============================================================================

# Connected SSE clients - each client gets a queue for receiving events
_progress_clients: set[asyncio.Queue] = set()
_clients_lock = asyncio.Lock()

# Main event loop reference - set at FastAPI startup for cross-thread broadcasting
_main_loop: Optional[asyncio.AbstractEventLoop] = None

# Rate limiting state
_last_broadcast_time: float = 0.0
_last_broadcast_phase: str = ""
_MIN_BROADCAST_INTERVAL: float = 0.1  # 100ms debounce


def set_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    """Store reference to the main event loop for cross-thread broadcasting.

    Must be called from the main asyncio thread during startup.

    Args:
        loop: The main asyncio event loop.
    """
    global _main_loop
    _main_loop = loop
    logger.debug("SSE broadcast: main event loop reference stored")


async def add_sse_client(queue: asyncio.Queue) -> None:
    """Register a new SSE client.

    Args:
        queue: The asyncio.Queue for this client's events.
    """
    async with _clients_lock:
        _progress_clients.add(queue)
        logger.debug(f"SSE client connected. Total clients: {len(_progress_clients)}")


async def remove_sse_client(queue: asyncio.Queue) -> None:
    """Unregister an SSE client.

    Args:
        queue: The asyncio.Queue to remove.
    """
    async with _clients_lock:
        _progress_clients.discard(queue)
        logger.debug(
            f"SSE client disconnected. Total clients: {len(_progress_clients)}"
        )


def broadcast_progress(progress: int, message: str, phase: str = "pipeline") -> None:
    """Broadcast progress to all connected SSE clients.

    This is called from emit_progress() in sync.py to push updates to browser clients.
    Thread-safe: can be called from executor threads.

    Rate-limited to max 10 events/second (100ms interval) to prevent frontend jitter.
    Phase changes and 100% completion always emit immediately.

    Args:
        progress: Progress percentage (0-100).
        message: Human-readable progress message.
        phase: Pipeline phase identifier (e.g., 'loading', 'decomposition', 'enrichment').
    """
    global _last_broadcast_time, _last_broadcast_phase

    if _main_loop is None:
        logger.warning("SSE broadcast skipped: main event loop not set")
        return

    now = time.time()
    is_phase_change = phase != _last_broadcast_phase
    is_completion = progress == 100
    is_important = is_phase_change or is_completion

    if not is_important and (now - _last_broadcast_time) < _MIN_BROADCAST_INTERVAL:
        return

    _last_broadcast_time = now
    _last_broadcast_phase = phase

    event_data = {
        "type": "progress",
        "progress": progress,
        "message": message,
        "phase": phase,
    }

    try:
        _main_loop.call_soon_threadsafe(_broadcast_sync, event_data)
    except RuntimeError as e:
        logger.warning(f"SSE broadcast failed: {e}")


def _broadcast_sync(event_data: dict) -> None:
    """Synchronous broadcast helper - puts event in all client queues.

    Called via call_soon_threadsafe from broadcast_progress.
    """
    clients = _progress_clients.copy()
    if not clients:
        return

    for queue in clients:
        try:
            queue.put_nowait(event_data)
        except asyncio.QueueFull:
            logger.warning("SSE client queue full, dropping event")
        except Exception as e:
            logger.warning(f"Failed to queue SSE event: {e}")


def broadcast_summary(summary: PipelineSummaryData) -> None:
    """Broadcast pipeline summary to all connected SSE clients.

    Emits a 'pipeline_summary' event with detailed statistics at pipeline completion.
    Thread-safe: can be called from executor threads.

    Args:
        summary: Complete pipeline summary data matching PipelineSummaryData schema.
    """
    if _main_loop is None:
        logger.warning("SSE summary broadcast skipped: main event loop not set")
        return

    event_data = {
        "type": "pipeline_summary",
        "data": dict(summary),
    }

    try:
        _main_loop.call_soon_threadsafe(_broadcast_sync, event_data)
        logger.debug("Pipeline summary broadcast sent")
    except RuntimeError as e:
        logger.warning(f"SSE summary broadcast failed: {e}")


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

        set_main_loop(asyncio.get_running_loop())
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

    @app.get("/events")
    async def sse_events(request: Request):
        """Server-Sent Events endpoint for real-time progress updates.

        Clients connect here to receive pipeline progress events.
        Events are sent in SSE format: "data: {json}\n\n"

        Event types:
        - connected: Initial connection confirmation
        - progress: Pipeline progress update with progress%, message, phase
        - heartbeat: Keep-alive ping (every 30s)

        Returns:
            StreamingResponse with text/event-stream content type.
        """
        from starlette.responses import StreamingResponse

        # Create a queue for this client
        client_queue: asyncio.Queue = asyncio.Queue(maxsize=100)

        async def event_generator():
            """Generate SSE events for this client."""
            await add_sse_client(client_queue)
            try:
                # Send initial connection event
                yield f"data: {json.dumps({'type': 'connected', 'sessionId': get_session_id()})}\n\n"

                heartbeat_interval = 30  # seconds

                while True:
                    try:
                        # Wait for event with timeout for heartbeat
                        event = await asyncio.wait_for(
                            client_queue.get(), timeout=heartbeat_interval
                        )
                        yield f"data: {json.dumps(event)}\n\n"
                    except asyncio.TimeoutError:
                        # Send heartbeat to keep connection alive
                        yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                    except asyncio.CancelledError:
                        # Client disconnected
                        break
            finally:
                await remove_sse_client(client_queue)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            },
        )

    logger.info(f"Starting Echo-Bridge on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_config=None)
