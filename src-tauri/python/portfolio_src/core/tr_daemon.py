#!/usr/bin/env python3
"""
TR Daemon - Isolated process for Trade Republic API interaction.

⚠️ FRAGILE: This module is extremely sensitive to rate limiting and I/O blocking.
Read keystone/specs/trade_republic_integration.md before refactoring.
"""

# === PATH SETUP (must be before portfolio_src imports) ===
# When spawned as subprocess, Python path may not include portfolio_src parent
import sys
from pathlib import Path

_daemon_dir = Path(__file__).resolve().parent  # portfolio_src/core/
_python_root = _daemon_dir.parent.parent  # src-tauri/python/
if str(_python_root) not in sys.path:
    sys.path.insert(0, str(_python_root))
# === END PATH SETUP ===

import asyncio
import json
import os
import signal
import platform
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict
from enum import Enum
from decimal import Decimal

from portfolio_src.core.tr_protocol import TRMethod, TRRequest, TRResponse


def json_serial(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


def create_error_response(request_id: str, error_message: str) -> str:
    response = TRResponse(result=None, error=error_message, id=request_id)
    return json.dumps(asdict(response), default=json_serial)


def create_success_response(request_id: str, result: dict) -> str:
    response = TRResponse(result=result, error=None, id=request_id)
    return json.dumps(asdict(response), default=json_serial)


class TRDaemon:
    def __init__(self):
        self.api = None
        self._pending_phone: Optional[str] = None
        self._pending_pin: Optional[str] = None
        self._loop = None
        self._cached_auth_status = "idle"

    def _get_data_dir(self) -> Path:
        home = Path.home()
        if platform.system() == "Darwin":
            return home / "Library" / "Application Support" / "PortfolioPrism"
        elif platform.system() == "Windows":
            return home / "AppData" / "Roaming" / "PortfolioPrism"
        else:
            return home / ".local" / "share" / "PortfolioPrism"

    async def _ensure_api(self, phone: Optional[str] = None, pin: Optional[str] = None):
        if self.api is None:
            from pytr.api import TradeRepublicApi

            data_dir = self._get_data_dir()
            data_dir.mkdir(parents=True, exist_ok=True)
            cookies_file = data_dir / "tr_cookies.txt"
            phone_to_use = phone or self._pending_phone
            pin_to_use = pin or self._pending_pin
            if phone_to_use is None or pin_to_use is None:
                return
            self.api = TradeRepublicApi(
                phone_no=str(phone_to_use),
                pin=str(pin_to_use),
                save_cookies=True,
                cookies_file=str(cookies_file),
            )

    async def handle_login(
        self, phone: Optional[str], pin: Optional[str], restore_only: bool = False
    ) -> Dict[str, Any]:
        try:
            if not restore_only and (not phone or not pin):
                return {
                    "status": "error",
                    "message": "Phone number and PIN are required",
                }
            if phone:
                self._pending_phone = phone
            if pin:
                self._pending_pin = pin
            await self._ensure_api(phone, pin)
            if self.api is None:
                return {
                    "status": "error",
                    "message": "API not initialized. Credentials required.",
                }

            if self.api.resume_websession():
                print("[TR Daemon] Session resumed from cookies", file=sys.stderr)
                self._cached_auth_status = "authenticated"
                return {
                    "status": "authenticated",
                    "message": "Session restored from saved cookies",
                }

                # Fall through to full login if not restore_only

            if restore_only:
                return {
                    "status": "error",
                    "message": "Session could not be restored",
                    "code": "SESSION_RESTORE_FAILED",
                }

            print("[TR Daemon] Initiating web login...", file=sys.stderr)
            if hasattr(self.api, "initiate_weblogin"):
                countdown = self.api.initiate_weblogin()
            elif hasattr(self.api, "inititate_weblogin"):
                countdown = self.api.inititate_weblogin()
            else:
                return {"status": "error", "message": "Incompatible pytr version"}

            return {
                "status": "waiting_2fa",
                "message": "2FA code requested",
                "countdown": countdown,
            }
        except Exception as e:
            err_msg = str(e)
            if "TOO_MANY_REQUESTS" in err_msg:
                return {
                    "status": "error",
                    "message": "Trade Republic rate limit: Please wait a few minutes before trying again.",
                    "code": "RATE_LIMITED",
                }
            return {"status": "error", "message": err_msg}

    async def handle_confirm_2fa(self, token: Optional[str]) -> Dict[str, Any]:
        try:
            if not token:
                return {"status": "error", "message": "Token is required"}
            if not self.api:
                return {"status": "error", "message": "Please login first"}
            self.api.complete_weblogin(token)
            self._cached_auth_status = "authenticated"
            return {"status": "authenticated", "message": "Login successful"}
        except Exception as e:
            return {"status": "error", "message": f"2FA confirmation failed: {str(e)}"}

    async def handle_logout(self) -> Dict[str, Any]:
        try:
            self.api = None
            self._cached_auth_status = "idle"
            cookies_file = self._get_data_dir() / "tr_cookies.txt"
            if cookies_file.exists():
                cookies_file.unlink()
            return {"status": "logged_out", "message": "Logged out"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    async def handle_fetch_portfolio(self) -> Dict[str, Any]:
        try:
            if not self.api:
                return {"status": "error", "message": "Not initialized"}
            from pytr.portfolio import Portfolio

            portfolio_obj = Portfolio(self.api)

            try:
                await asyncio.wait_for(portfolio_obj.portfolio_loop(), timeout=60.0)
            except asyncio.TimeoutError:
                print(
                    "[TR Daemon] Portfolio fetch timed out, resetting API state",
                    file=sys.stderr,
                )
                self.api = None
                self._cached_auth_status = "idle"
                return {
                    "status": "error",
                    "message": "Portfolio fetch timed out. Trade Republic might be slow or connection is unstable.",
                    "code": "TIMEOUT",
                }
            except Exception as e:
                error_msg = str(e).lower()
                if any(
                    x in error_msg
                    for x in ["401", "unauthorized", "session", "expired"]
                ):
                    print(f"[TR Daemon] Auth error during fetch: {e}", file=sys.stderr)
                    self.api = None
                    self._cached_auth_status = "idle"
                return {
                    "status": "error",
                    "message": f"Portfolio fetch failed: {str(e)}",
                }

            positions = portfolio_obj.portfolio
            if not positions:
                return {
                    "status": "error",
                    "message": "No positions received from Trade Republic. Try again in a few seconds.",
                }

            return {
                "status": "success",
                "data": {
                    "positions": positions,
                    "cash": getattr(portfolio_obj, "cash", []),
                },
            }
        except Exception as e:
            return {"status": "error", "message": f"Portfolio fetch failed: {str(e)}"}

    async def handle_get_status(self) -> Dict[str, Any]:
        """
        Get current auth status.
        ⚠️ NEVER call self.api.resume_websession() here.
        It hits the TR API and will cause TOO_MANY_REQUESTS.
        Use the cached status instead.
        """
        return {"status": self._cached_auth_status}

    async def process_request(self, request: TRRequest) -> str:
        method = request.method
        params = request.params
        try:
            if method == TRMethod.LOGIN.value:
                result = await self.handle_login(
                    params.get("phone"),
                    params.get("pin"),
                    params.get("restore_only", False),
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
                sys.exit(0)
            else:
                result = {"status": "error", "message": f"Unknown method: {method}"}

            return create_success_response(request.id, result)
        except Exception as e:
            return create_error_response(request.id, str(e))

    async def run(self):
        self._loop = asyncio.get_running_loop()
        protocol_stdout = sys.stdout
        sys.stdout = sys.stderr

        print(
            json.dumps({"status": "ready", "version": "0.1.0", "pid": os.getpid()}),
            file=protocol_stdout,
            flush=True,
        )

        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await self._loop.connect_read_pipe(lambda: protocol, sys.stdin)

        while True:
            line = await reader.readline()
            if not line:
                break
            try:
                request_data = json.loads(line.decode().strip())
                request = TRRequest(**request_data)
                response = await self.process_request(request)
                print(response, file=protocol_stdout, flush=True)
            except Exception as e:
                print(
                    create_error_response("unknown", str(e)),
                    file=protocol_stdout,
                    flush=True,
                )


async def main():
    daemon = TRDaemon()
    await daemon.run()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
