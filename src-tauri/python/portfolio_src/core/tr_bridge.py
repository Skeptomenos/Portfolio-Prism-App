"""
TR Bridge - Communication layer for TR daemon

Manages the tr_daemon.py subprocess and provides a clean API for Streamlit/Tauri.
Handles subprocess lifecycle, command sending, response parsing, and error recovery.
"""

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Optional, Dict, Any, Union

from .tr_protocol import (
    TRMethod,
    TRRequest,
    TRResponse,
    create_success_response,
    create_error_response,
    deserialize_response,
)


class TRBridge:
    """Bridge to TR daemon subprocess with singleton pattern."""

    _instance: Optional["TRBridge"] = None
    _lock = threading.Lock()

    def __init__(self):
        self._daemon_process: Optional[subprocess.Popen] = None
        self._daemon_thread: Optional[threading.Thread] = None
        self._is_running = False

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
        if (
            self._is_running
            and self._daemon_process
            and self._daemon_process.poll() is None
        ):
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
            self._is_running = True

            # Start stderr monitoring thread
            self._daemon_thread = threading.Thread(
                target=self._monitor_stderr, daemon=True
            )
            self._daemon_thread.start()

            # Give daemon time to start
            time.sleep(0.5)

        except Exception as e:
            self._is_running = False
            raise RuntimeError(f"Failed to start TR daemon: {e}")

    def _get_daemon_command(self) -> list:
        """Get command to spawn daemon, handling frozen vs dev mode."""
        if getattr(sys, 'frozen', False):
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
        if sidecar_path.exists():
            return str(sidecar_path)
        
        # Try without suffix (Tauri dev mode)
        sidecar_path_no_suffix = base_dir / name
        if sidecar_path_no_suffix.exists():
            return str(sidecar_path_no_suffix)

        raise RuntimeError(f"Sidecar binary not found: tried {sidecar_path} and {sidecar_path_no_suffix}")

    def _monitor_stderr(self) -> None:
        """Monitor daemon stderr for logging."""
        if not self._daemon_process:
            return

        try:
            while self._is_running and self._daemon_process.poll() is None:
                assert self._daemon_process.stderr is not None
                line = self._daemon_process.stderr.readline()
                if line:
                    print(f"[TR Daemon] {line.strip()}", file=sys.stderr)
        except Exception:
            pass  # Ignore monitoring errors

    def _send_command(self, method: str, **params) -> Dict[str, Any]:
        """Send command to daemon and get response."""
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

            # Read response
            assert self._daemon_process.stdout is not None
            response_line = self._daemon_process.stdout.readline()
            if not response_line:
                raise RuntimeError("No response from daemon")

            # Parse response
            response_data = json.loads(response_line.strip())
            response = TRResponse(
                result=response_data.get("result"),
                error=response_data.get("error"),
                id=response_data.get("id"),
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

    def login(self, phone: str, pin: str) -> Dict[str, Any]:
        """Initiate login process."""
        return self._send_command(TRMethod.LOGIN.value, phone=phone, pin=pin)

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
