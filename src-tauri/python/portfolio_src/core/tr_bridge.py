"""
TR Bridge - Communication layer for TR daemon

⚠️ FRAGILE: Manages subprocess I/O. Blocking calls MUST be wrapped in executors.
Read keystone/specs/trade_republic_integration.md before refactoring.
"""

import json
import os
import select
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Optional, Dict, Any, Union

from portfolio_src.core.tr_protocol import (
    TRRequest,
    TRResponse,
    TRMethod,
)
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class TRBridge:
    """Bridge to TR daemon subprocess with singleton pattern."""

    _instance: Optional["TRBridge"] = None
    _lock = threading.Lock()

    def __init__(self):
        self._daemon_process: Optional[subprocess.Popen] = None
        self._daemon_thread: Optional[threading.Thread] = None
        self._is_running = False
        self._command_lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> "TRBridge":
        """Get singleton instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def _ensure_daemon_running(self) -> None:
        """Ensure daemon subprocess is running, start if needed."""
        if self._is_running and self._daemon_process and self._daemon_process.poll() is None:
            return  # Already running

        # Clean up any dead process
        if self._daemon_process:
            try:
                self._daemon_process.terminate()
                self._daemon_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._daemon_process.kill()
            self._daemon_process = None

        # Start new daemon process
        try:
            cmd = self._get_daemon_command()
            self._daemon_process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,  # Line buffered
                env=os.environ.copy(),  # Inherit environment
            )

            assert self._daemon_process.stdout is not None
            ready_line = self._daemon_process.stdout.readline()
            if not ready_line:
                raise RuntimeError("Daemon failed to start - no ready signal")

            try:
                ready_data = json.loads(ready_line.strip())
                if ready_data.get("status") != "ready":
                    raise RuntimeError(f"Daemon not ready: {ready_data}")
                logger.info("Daemon ready", extra={"pid": ready_data.get("pid")})
            except json.JSONDecodeError:
                raise RuntimeError(f"Invalid ready signal: {ready_line}")

            self._is_running = True

            # Start stderr monitoring thread
            self._daemon_thread = threading.Thread(target=self._monitor_stderr, daemon=True)
            self._daemon_thread.start()

        except Exception as e:
            self._is_running = False
            raise RuntimeError(f"Failed to start TR daemon: {e}")

    def _get_daemon_command(self) -> list:
        """Get command to spawn daemon, handling frozen vs dev mode."""
        if getattr(sys, "frozen", False):
            # Frozen mode (PyInstaller bundle): use sidecar binary
            return [self._get_sidecar_path("tr-daemon")]
        else:
            # Dev mode: use Python interpreter directly
            daemon_path = Path(__file__).parent / "tr_daemon.py"
            return [sys.executable, str(daemon_path)]

    def _get_sidecar_path(self, name: str) -> str:
        """Get path to sidecar binary with platform suffix.

        Tauri copies sidecars to target/debug/ without suffix in dev mode,
        but uses the suffix in production builds. Try both.
        """
        import platform

        system = platform.system()
        machine = platform.machine()

        if system == "Darwin":
            suffix = "aarch64-apple-darwin" if machine == "arm64" else "x86_64-apple-darwin"
        elif system == "Windows":
            suffix = "x86_64-pc-windows-msvc.exe"
        else:
            suffix = "x86_64-unknown-linux-gnu"

        # Sidecar binaries are next to the main executable
        base_dir = Path(sys.executable).parent

        # Try with platform suffix first (production build)
        sidecar_path = base_dir / f"{name}-{suffix}"
        logger.debug(
            "Sidecar lookup",
            extra={
                "sys_executable": sys.executable,
                "base_dir": str(base_dir),
                "sidecar_path": str(sidecar_path),
            },
        )

        if sidecar_path.exists():
            logger.debug("Found sidecar", extra={"path": str(sidecar_path)})
            return str(sidecar_path)

        # Try without suffix (Tauri dev mode)
        sidecar_path_no_suffix = base_dir / name
        logger.debug(
            "Looking for sidecar without suffix", extra={"path": str(sidecar_path_no_suffix)}
        )
        if sidecar_path_no_suffix.exists():
            logger.debug("Found sidecar", extra={"path": str(sidecar_path_no_suffix)})
            return str(sidecar_path_no_suffix)

        logger.error(
            f"Sidecar binary not found. Base dir: {base_dir}, Contents: {list(base_dir.iterdir())}"
        )
        raise RuntimeError(
            f"Sidecar binary not found: tried {sidecar_path} and {sidecar_path_no_suffix}"
        )

    def _monitor_stderr(self) -> None:
        """Monitor daemon stderr for logging."""
        if not self._daemon_process:
            return

        try:
            while self._is_running and self._daemon_process.poll() is None:
                assert self._daemon_process.stderr is not None
                line = self._daemon_process.stderr.readline()
                if line:
                    logger.debug("TR Daemon stderr", extra={"line": line.strip()})
        except Exception:
            pass  # Ignore monitoring errors

    def _read_response_with_timeout(self, timeout: float = 30.0) -> str:
        if not self._daemon_process or not self._daemon_process.stdout:
            raise RuntimeError("Daemon process not available")

        if sys.platform != "win32":
            ready, _, _ = select.select([self._daemon_process.stdout], [], [], timeout)
            if not ready:
                raise RuntimeError(f"Daemon response timeout after {timeout}s")

        response_line = self._daemon_process.stdout.readline()
        if not response_line:
            raise RuntimeError("No response from daemon (EOF)")

        return response_line

    def _send_command(self, method: str, **params) -> Dict[str, Any]:
        """
        Send command to daemon and get response.
        ⚠️ MUST be called via run_in_executor when used in async context.
        ⚠️ DO NOT remove the _command_lock; it prevents stream corruption.

        SECURITY: params may contain credentials (phone, pin) - never log or persist.
        """
        with self._command_lock:
            self._ensure_daemon_running()

            if not self._daemon_process:
                raise RuntimeError("Daemon process not available")

            # Create request
            request_id = f"{method}_{int(time.time() * 1000)}"
            request = TRRequest(method=method, params=params, id=request_id)

            # Serialize and send
            request_json = json.dumps(
                {"method": request.method, "params": request.params, "id": request.id}
            )

            try:
                # Send request
                assert self._daemon_process.stdin is not None
                self._daemon_process.stdin.write(request_json + "\n")
                self._daemon_process.stdin.flush()

                try:
                    response_line = self._read_response_with_timeout(timeout=90.0)
                except RuntimeError as e:
                    logger.warning(
                        "Protocol desync risk, resetting daemon",
                        extra={"error": str(e)},
                    )
                    self.shutdown()
                    raise

                # Parse response
                response_data = json.loads(response_line.strip())
                response = TRResponse(
                    result=response_data.get("result"),
                    error=response_data.get("error"),
                    id=response_data.get("id"),
                )

                # Validate response ID matches request ID (prevent protocol desync)
                if response.id != request_id:
                    logger.error(
                        f"Protocol desync: expected response ID '{request_id}', "
                        f"got '{response.id}'. Resetting daemon."
                    )
                    self.shutdown()
                    raise RuntimeError(
                        f"Protocol desync: response ID mismatch "
                        f"(expected: {request_id}, got: {response.id})"
                    )

                if response.error:
                    raise RuntimeError(f"Daemon error: {response.error}")

                return response.result or {}

            except json.JSONDecodeError as e:
                raise RuntimeError(f"Invalid daemon response: {e}")
            except Exception as e:
                # If daemon died, mark as not running
                self._is_running = False
                raise RuntimeError(f"Daemon communication failed: {e}")

    def login(self, phone: str, pin: str, **kwargs) -> Dict[str, Any]:
        """
        Initiate login process.

        Security Note: Credentials are sent via stdin pipe to daemon subprocess.
        This is acceptable as both processes run under the same user context
        and stdin is not externally accessible. No network transmission occurs.
        """
        return self._send_command(TRMethod.LOGIN.value, phone=phone, pin=pin, **kwargs)

    def logout(self) -> Dict[str, Any]:
        """Logout and clear session."""
        try:
            return self._send_command(TRMethod.LOGOUT.value)
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def confirm_2fa(self, token: str) -> Dict[str, Any]:
        """Confirm 2FA token."""
        return self._send_command(TRMethod.CONFIRM_2FA.value, token=token)

    def fetch_portfolio(self) -> Dict[str, Any]:
        """Fetch portfolio data."""
        return self._send_command(TRMethod.FETCH_PORTFOLIO.value)

    def get_status(self) -> Dict[str, Any]:
        """Get daemon status."""
        return self._send_command(TRMethod.GET_STATUS.value)

    def shutdown(self) -> None:
        """Shutdown daemon gracefully."""
        try:
            self._send_command(TRMethod.SHUTDOWN.value)
        except Exception:
            pass  # Ignore shutdown errors

        self._is_running = False
        if self._daemon_process:
            try:
                self._daemon_process.terminate()
                self._daemon_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._daemon_process.kill()
            self._daemon_process = None

    def is_connected(self) -> bool:
        """Check if daemon is connected and responsive."""
        try:
            status = self.get_status()
            return status.get("status") in ["authenticated", "idle"]
        except Exception:
            return False

    def __del__(self):
        """Cleanup on destruction."""
        self.shutdown()
