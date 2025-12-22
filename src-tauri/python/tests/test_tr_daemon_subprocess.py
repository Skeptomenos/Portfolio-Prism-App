"""
TR Daemon Subprocess Tests

Verifies the daemon can start as a subprocess and emit the ready signal.
This catches path setup issues that only manifest when running as a subprocess.

See: keystone/specs/trade_republic_integration.md Section 5
"""

import json
import select
import subprocess
import sys
from pathlib import Path
from typing import Optional, Dict

import pytest


PYTHON_ROOT = Path(__file__).parent.parent
DAEMON_PATH = PYTHON_ROOT / "portfolio_src" / "core" / "tr_daemon.py"


class TestTRDaemonSubprocess:
    """Tests for TR daemon subprocess startup."""

    def test_daemon_emits_ready_signal(self):
        """Daemon must emit JSON ready signal as first stdout line."""
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_PATH)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        try:
            assert proc.stdout is not None
            assert proc.stderr is not None

            ready, _, _ = select.select([proc.stdout], [], [], 5.0)
            assert ready, "Daemon did not emit ready signal within 5 seconds"

            line = proc.stdout.readline()
            assert line, "Daemon stdout was empty"

            data = json.loads(line.strip())
            assert data.get("status") == "ready", f"Expected status=ready, got {data}"
            assert "pid" in data, "Ready signal missing pid"
            assert "version" in data, "Ready signal missing version"
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_daemon_no_import_errors(self):
        """Daemon must not crash with import errors."""
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_PATH)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        try:
            assert proc.stderr is not None

            import time

            time.sleep(0.5)

            exit_code = proc.poll()
            if exit_code is not None:
                stderr_output = proc.stderr.read()
                pytest.fail(
                    f"Daemon crashed with exit code {exit_code}. "
                    f"Stderr: {stderr_output}"
                )
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_daemon_path_setup_exists(self):
        """Verify the path setup block exists in tr_daemon.py."""
        content = DAEMON_PATH.read_text()

        assert "sys.path.insert" in content, (
            "Path setup block missing from tr_daemon.py. "
            "This will break subprocess startup. "
            "See keystone/specs/trade_republic_integration.md"
        )

        # Verify path setup comes before portfolio_src imports
        path_setup_pos = content.find("sys.path.insert")
        import_pos = content.find("from portfolio_src")

        assert path_setup_pos < import_pos, (
            "Path setup must come BEFORE portfolio_src imports. "
            "Current order will cause ModuleNotFoundError in subprocess."
        )


class TestTRDaemonProtocolContract:
    """Contract tests to verify daemon responds correctly to protocol messages."""

    def _send_command(
        self,
        proc,
        method: str,
        params: Optional[Dict] = None,
        request_id: str = "test_1",
    ):
        """Helper to send a command and get response."""
        request = json.dumps(
            {
                "method": method,
                "params": params or {},
                "id": request_id,
            }
        )
        assert proc.stdin is not None
        assert proc.stdout is not None

        proc.stdin.write(request + "\n")
        proc.stdin.flush()

        ready, _, _ = select.select([proc.stdout], [], [], 10.0)
        assert ready, f"No response for method {method}"

        line = proc.stdout.readline()
        return json.loads(line.strip())

    def _start_daemon(self):
        """Start daemon and wait for ready signal."""
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_PATH)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        assert proc.stdout is not None
        ready, _, _ = select.select([proc.stdout], [], [], 5.0)
        assert ready, "Daemon did not start"
        proc.stdout.readline()
        return proc

    def test_get_status_returns_idle_initially(self):
        """get_status should return idle when daemon first starts."""
        proc = self._start_daemon()
        try:
            response = self._send_command(proc, "get_status")

            assert response["id"] == "test_1"
            assert response["error"] is None
            assert response["result"]["status"] == "idle"
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_logout_works_without_login(self):
        """logout should work even if not logged in."""
        proc = self._start_daemon()
        try:
            response = self._send_command(proc, "logout", request_id="logout_1")

            assert response["id"] == "logout_1"
            assert response["error"] is None
            assert response["result"]["status"] == "logged_out"
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_unknown_method_returns_error(self):
        """Unknown methods should return error in result, not crash."""
        proc = self._start_daemon()
        try:
            response = self._send_command(
                proc, "nonexistent_method", request_id="unknown_1"
            )

            assert response["id"] == "unknown_1"
            assert response["error"] is None
            assert response["result"]["status"] == "error"
            assert "unknown" in response["result"]["message"].lower()
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_response_id_matches_request_id(self):
        """Response ID must match request ID for proper correlation."""
        proc = self._start_daemon()
        try:
            response1 = self._send_command(
                proc, "get_status", request_id="unique_abc_123"
            )
            response2 = self._send_command(
                proc, "get_status", request_id="unique_xyz_789"
            )

            assert response1["id"] == "unique_abc_123"
            assert response2["id"] == "unique_xyz_789"
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_login_without_credentials_returns_error(self):
        """login without phone/pin should return error."""
        proc = self._start_daemon()
        try:
            response = self._send_command(
                proc, "login", params={}, request_id="login_1"
            )

            assert response["error"] is None
            assert response["result"]["status"] == "error"
            assert "required" in response["result"]["message"].lower()
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_confirm_2fa_without_login_returns_error(self):
        """confirm_2fa without prior login should return error."""
        proc = self._start_daemon()
        try:
            response = self._send_command(
                proc, "confirm_2fa", params={"token": "1234"}, request_id="2fa_1"
            )

            assert response["error"] is None
            assert response["result"]["status"] == "error"
            assert "login" in response["result"]["message"].lower()
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_fetch_portfolio_without_api_returns_error(self):
        """fetch_portfolio without initialized API should return error."""
        proc = self._start_daemon()
        try:
            response = self._send_command(proc, "fetch_portfolio", request_id="fetch_1")

            assert response["error"] is None
            assert response["result"]["status"] == "error"
            assert "not initialized" in response["result"]["message"].lower()
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_multiple_commands_in_sequence(self):
        """Daemon should handle multiple commands in sequence."""
        proc = self._start_daemon()
        try:
            r1 = self._send_command(proc, "get_status", request_id="seq_1")
            r2 = self._send_command(proc, "logout", request_id="seq_2")
            r3 = self._send_command(proc, "get_status", request_id="seq_3")

            assert r1["id"] == "seq_1"
            assert r2["id"] == "seq_2"
            assert r3["id"] == "seq_3"

            assert r1["result"]["status"] == "idle"
            assert r2["result"]["status"] == "logged_out"
            assert r3["result"]["status"] == "idle"
        finally:
            proc.terminate()
            proc.wait(timeout=5)


class TestTRDaemonStdoutIsolation:
    """Tests to verify stdout is not polluted with non-JSON output."""

    def test_no_stdout_pollution_on_startup(self):
        """Only the ready signal should be on stdout at startup."""
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_PATH)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        try:
            assert proc.stdout is not None

            ready, _, _ = select.select([proc.stdout], [], [], 5.0)
            assert ready

            line = proc.stdout.readline()
            data = json.loads(line.strip())
            assert data["status"] == "ready"

            more_ready, _, _ = select.select([proc.stdout], [], [], 0.5)
            assert not more_ready, (
                "Unexpected extra output on stdout after ready signal"
            )
        finally:
            proc.terminate()
            proc.wait(timeout=5)

    def test_response_is_valid_json(self):
        """Every response line must be valid JSON."""
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_PATH)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        try:
            assert proc.stdout is not None
            assert proc.stdin is not None

            ready, _, _ = select.select([proc.stdout], [], [], 5.0)
            proc.stdout.readline()

            proc.stdin.write(
                '{"method": "get_status", "params": {}, "id": "json_test"}\n'
            )
            proc.stdin.flush()

            ready, _, _ = select.select([proc.stdout], [], [], 5.0)
            assert ready

            line = proc.stdout.readline()
            try:
                data = json.loads(line.strip())
                assert "id" in data
                assert "result" in data or "error" in data
            except json.JSONDecodeError:
                pytest.fail(f"Response is not valid JSON: {line}")
        finally:
            proc.terminate()
            proc.wait(timeout=5)
