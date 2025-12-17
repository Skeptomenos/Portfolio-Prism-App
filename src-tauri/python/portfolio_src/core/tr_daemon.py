"""
TR Daemon - Isolated pytr worker process

Long-running subprocess that handles Trade Republic API operations.
Communicates via JSON-RPC over stdin/stdout.

Features:
- Own asyncio event loop (safe pytr import)
- Session persistence via pytr native cookie storage
- Auto-refresh tokens
- Graceful shutdown
- Structured error handling
"""

import asyncio
import json
import os
import signal
import sys
import platform
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict
from enum import Enum
from decimal import Decimal

# Handle PyInstaller frozen mode - ensure SSL certificates work
if getattr(sys, 'frozen', False):
    import certifi
    os.environ['SSL_CERT_FILE'] = certifi.where()
    os.environ['REQUESTS_CA_BUNDLE'] = certifi.where()

# Add parent directory to path for standalone execution
if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).parent))

# --- PROTOCOL DEFINITIONS (Embedded for Standalone Stability) ---

class TRMethod(Enum):
    """Supported daemon methods."""
    LOGIN = "login"
    LOGOUT = "logout"
    CONFIRM_2FA = "confirm_2fa"
    FETCH_PORTFOLIO = "fetch_portfolio"
    GET_STATUS = "get_status"
    SHUTDOWN = "shutdown"


@dataclass
class TRRequest:
    """Request message to daemon."""
    method: str
    params: Dict[str, Any]
    id: str  # For request/response matching


@dataclass
class TRResponse:
    """Response message from daemon."""
    result: Optional[dict]
    error: Optional[str]
    id: str  # Matches request.id


class TRError(Exception):
    """TR daemon specific error."""
    def __init__(self, message: str, method: str = None):
        super().__init__(message)
        self.method = method
        self.message = message


def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


def create_error_response(request_id: str, error_message: str) -> str:
    """Create error response."""
    response = TRResponse(result=None, error=error_message, id=request_id)
    return json.dumps(asdict(response), default=json_serial)


def create_success_response(request_id: str, result: dict) -> str:
    """Create success response."""
    response = TRResponse(result=result, error=None, id=request_id)
    return json.dumps(asdict(response), default=json_serial)

# --- END PROTOCOL DEFINITIONS ---


class TRDaemon:
    """Trade Republic daemon with session management."""

    def __init__(self):
        self.api = None  # TradeRepublicApi instance
        self._pending_phone: Optional[str] = None
        self._pending_pin: Optional[str] = None

        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self._handle_shutdown)
        signal.signal(signal.SIGINT, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        """Handle shutdown signals."""
        print("Shutting down TR daemon...", file=sys.stderr)
        self._cleanup()
        sys.exit(0)

    def _cleanup(self):
        """Cleanup resources."""
        pass

    def _get_data_dir(self) -> Path:
        """Get platform-specific data directory."""
        home = Path.home()
        if platform.system() == "Darwin":
            return home / "Library" / "Application Support" / "PortfolioPrism"
        elif platform.system() == "Windows":
            return home / "AppData" / "Roaming" / "PortfolioPrism"
        else:
            return home / ".local" / "share" / "PortfolioPrism"

    async def _ensure_api(self, phone: Optional[str] = None, pin: Optional[str] = None):
        """Lazy import and initialize pytr API with persistent storage."""
        if self.api is None:
            # Import here to avoid issues if pytr not installed in parent env
            from pytr.api import TradeRepublicApi

            data_dir = self._get_data_dir()
            data_dir.mkdir(parents=True, exist_ok=True)

            cookies_file = data_dir / "tr_cookies.txt"

            # Use credentials from arguments or previously pending ones
            phone_to_use = phone or self._pending_phone
            pin_to_use = pin or self._pending_pin

            self.api = TradeRepublicApi(
                phone_no=phone_to_use,
                pin=pin_to_use,
                save_cookies=True,
                cookies_file=str(cookies_file),
            )

    async def handle_login(
        self, phone: Optional[str], pin: Optional[str], restore_only: bool = False
    ) -> Dict[str, Any]:
        """Handle login request."""
        try:
            if not phone or not pin:
                return {
                    "status": "error",
                    "message": "Phone number and PIN are required",
                }

            self._pending_phone = phone
            self._pending_pin = pin

            await self._ensure_api(phone, pin)

            # Check for existing session first via cookies
            # resume_websession returns True if valid session restored
            if self.api.resume_websession():
                return {
                    "status": "authenticated",
                    "message": "Session restored from saved cookies",
                }

            if restore_only:
                return {
                    "status": "error",
                    "message": "Session could not be restored",
                    "code": "SESSION_RESTORE_FAILED"
                }

            # New login flow - Web Login
            # This initiates the request and returns a countdown
            # Handle typo in pytr v0.4.2 (inititate_weblogin) vs newer versions
            if hasattr(self.api, "initiate_weblogin"):
                countdown = self.api.initiate_weblogin()
            elif hasattr(self.api, "inititate_weblogin"):
                countdown = self.api.inititate_weblogin()
            else:
                return {
                    "status": "error",
                    "message": "Incompatible pytr version: web login method not found",
                }

            return {
                "status": "waiting_2fa",
                "message": "Enter the 4-digit code from your Trade Republic app",
                "countdown": countdown,
            }

        except Exception as e:
            import traceback

            print(
                f"[TR Daemon] Login error: {type(e).__name__}: {str(e)}",
                file=sys.stderr,
            )
            traceback.print_exc(file=sys.stderr)
            
            # Inspect for TOO_MANY_REQUESTS in ValueError
            # Structure: ValueError: [{'errorCode': 'TOO_MANY_REQUESTS', 'meta': {'nextAttemptInSeconds': 20}}]
            if isinstance(e, ValueError) and e.args and isinstance(e.args[0], list):
                try:
                    error_data = e.args[0][0]
                    if error_data.get("errorCode") == "TOO_MANY_REQUESTS":
                        meta = error_data.get("meta", {})
                        seconds = meta.get("nextAttemptInSeconds", 60)
                        return {
                            "status": "error", 
                            "message": f"Too many login attempts. Please wait {seconds} seconds.",
                            "code": "TOO_MANY_REQUESTS",
                            "wait_seconds": seconds
                        }
                except Exception:
                    pass

            return {"status": "error", "message": f"Login failed: {str(e)}"}

    async def handle_confirm_2fa(self, token: Optional[str]) -> Dict[str, Any]:
        """Handle 2FA confirmation."""
        try:
            if not token:
                return {"status": "error", "message": "Token is required"}

            if not self.api:
                return {"status": "error", "message": "Please login first"}

            # complete_weblogin sends the code to TR
            self.api.complete_weblogin(token)

            return {"status": "authenticated", "message": "Login successful"}

        except Exception as e:
            return {"status": "error", "message": f"2FA confirmation failed: {str(e)}"}

    async def handle_logout(self) -> Dict[str, Any]:
        """Handle logout request."""
        try:
            # Clear API instance
            self.api = None
            
            # Delete cookies file to prevent zombie sessions
            data_dir = self._get_data_dir()
            cookies_file = data_dir / "tr_cookies.txt"
            if cookies_file.exists():
                cookies_file.unlink()
                print("[TR Daemon] Cookies deleted", file=sys.stderr)
                
            return {"status": "logged_out", "message": "Logged out and cookies cleared"}
        except Exception as e:
            return {"status": "error", "message": f"Logout failed: {str(e)}"}

    async def handle_fetch_portfolio(self) -> Dict[str, Any]:
        """Handle portfolio fetch request with full enrichment."""
        try:
            if not self.api:
                return {"status": "error", "message": "Not initialized"}
            
            import pytr
            # Debug print removed to prevent AttributeError

            # Use pytr.Portfolio for full enrichment (names + prices)
            from pytr.portfolio import Portfolio
            
            # Redirect internal prints is handled by global redirect, but Portfolio class logic is what matters
            portfolio_obj = Portfolio(self.api)
            
            # Execute fetch loop
            await portfolio_obj.portfolio_loop()
            
            # Extract data
            # Extract data
            # portfolio_obj.portfolio is already the list of positions in pytr
            positions = portfolio_obj.portfolio
            cash = getattr(portfolio_obj, "cash", [])
            
            # DEBUG LOGGING & FALLBACK LOGIC
            if positions:
                first = positions[0]
                print(f"[TR Daemon] DEBUG: First pos keys: {list(first.keys())}", file=sys.stderr)
                # Print subset of values to avoid huge logs but see critical ones
                debug_vals = {k: first[k] for k in ["instrumentId", "netSize", "averageBuyIn", "netValue"] if k in first}
                print(f"[TR Daemon] DEBUG: First pos vals: {debug_vals}", file=sys.stderr)
            else:
                print("[TR Daemon] DEBUG: No positions found.", file=sys.stderr)
            
            # Apply Fallback if netValue is missing or 0
            fallback_count = 0
            for pos in positions:
                # Ensure values are floats
                # pytr might have them as strings or floats depending on version
                qty = float(pos.get("netSize", 0))
                avg = float(pos.get("averageBuyIn", 0))
                
                # Check netValue
                curr_val = 0.0
                if "netValue" in pos:
                    curr_val = float(pos["netValue"])
                
                # If netValue is effectively 0 but we own shares, fallback to cost basis
                # This treats "market price 0" as "price = avg cost" (0% P/L) rather than -100% P/L
                if curr_val == 0.0 and qty > 0:
                    pos["netValue"] = qty * avg
                    fallback_count += 1
            
            if fallback_count > 0:
                print(f"[TR Daemon] WARNING: Used cost-basis fallback for {fallback_count} positions with missing price.", file=sys.stderr)

            return {"status": "success", "data": {"positions": positions, "cash": cash}}

        except Exception as e:
            import traceback
            traceback.print_exc(file=sys.stderr)
            return {"status": "error", "message": f"Portfolio fetch failed: {str(e)}"}

    async def handle_get_status(self) -> Dict[str, Any]:
        """Handle status request."""
        status = "idle"
        try:
            # Only try to resume if we have an API instance already
            # OR if we can initialize one purely from storage (cookies)
            # But TradeRepublicApi requires phone/pin in constructor currently.
            # So if self.api is None, we likely can't do much unless we stored phone/pin too.
            # For now, we only report authenticated if we have an active API instance
            # that has a valid session.

            # Improvement: If we are not initialized, check if we have a cookie file
            # If so, we might report "can_resume" or similar?
            # For now, sticking to safe behavior: only authenticated if API is live.

            if self.api is not None:
                if self.api.resume_websession():
                    status = "authenticated"
        except Exception:
            pass

        return {"status": status, "session_expires_at": 0, "keyring_available": True}

    async def handle_shutdown(self) -> Dict[str, Any]:
        """Handle shutdown request."""
        self._cleanup()
        return {"status": "shutdown", "message": "Daemon shutting down"}

    async def process_request(self, request: TRRequest) -> str:
        """Process a single request and return JSON response."""
        request_id = request.id
        try:
            method = request.method
            params = request.params

            if method == TRMethod.LOGIN.value:
                result = await self.handle_login(
                    params.get("phone"), 
                    params.get("pin"),
                    params.get("restore_only", False)
                )
            elif method == TRMethod.LOGOUT.value:
                result = await self.handle_logout()
            elif method == TRMethod.CONFIRM_2FA.value:
                result = await self.handle_confirm_2fa(params.get("token"))
            elif method == TRMethod.FETCH_PORTFOLIO.value:
                result = await self.handle_fetch_portfolio()
            elif method == TRMethod.GET_STATUS.value:
                result = await self.handle_get_status()
            elif method == TRMethod.SHUTDOWN.value:
                result = await self.handle_shutdown()
            else:
                result = {"status": "error", "message": f"Unknown method: {method}"}

            return create_success_response(request_id, result)

        except Exception as e:
            return create_error_response(request_id, f"Internal error: {str(e)}")

    async def run(self):
        """Main daemon loop - reads from stdin, writes to stdout."""
        # Capture original stdout for protocol usage
        protocol_stdout = sys.stdout
        
        # Redirect global stdout to stderr so library prints don't break JSON-RPC
        sys.stdout = sys.stderr
        
        print("TR Daemon started", file=sys.stderr)

        try:
            while True:
                # Read line from stdin
                line = sys.stdin.readline()
                if not line:
                    break  # EOF

                line = line.strip()
                if not line:
                    continue

                try:
                    # Parse request
                    request_data = json.loads(line)
                    request = TRRequest(**request_data)

                    # Process request
                    response = await self.process_request(request)

                    # Write response to protocol stdout (NOT sys.stdout)
                    print(response, file=protocol_stdout, flush=True)

                except json.JSONDecodeError as e:
                    error_response = create_error_response(
                        "unknown", f"Invalid JSON: {str(e)}"
                    )
                    print(error_response, file=protocol_stdout, flush=True)

                except Exception as e:
                    error_response = create_error_response(
                        "unknown", f"Processing error: {str(e)}"
                    )
                    print(error_response, file=protocol_stdout, flush=True)

        except KeyboardInterrupt:
            pass
        finally:
            self._cleanup()
            print("TR Daemon stopped", file=sys.stderr)


async def main():
    """Entry point for the daemon."""
    daemon = TRDaemon()
    await daemon.run()


if __name__ == "__main__":
    asyncio.run(main())
