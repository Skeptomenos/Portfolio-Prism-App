"""Tests for headless/transports/ - IPC transport layer."""

import asyncio
import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from io import StringIO

from portfolio_src.headless.transports import HAS_HTTP
from portfolio_src.headless.transports.stdin_loop import run_stdin_loop, VERSION
from portfolio_src.headless.transports.echo_bridge import run_echo_bridge


class TestStdinLoopVersion:
    """Tests for stdin_loop module constants."""

    def test_version_is_string(self):
        """VERSION is a string."""
        assert isinstance(VERSION, str)

    def test_version_format(self):
        """VERSION follows semver format."""
        parts = VERSION.split(".")
        assert len(parts) == 3
        assert all(p.isdigit() for p in parts)


class TestStdinLoop:
    """Tests for run_stdin_loop()."""

    @pytest.mark.asyncio
    async def test_emits_ready_signal(self, capsys):
        """Emits ready signal on startup."""
        # Mock stdin to return empty (EOF) immediately
        mock_stdin = MagicMock()
        mock_stdin.readline.return_value = ""

        with patch("sys.stdin", mock_stdin):
            # Patch at the source module where it's imported from
            with patch(
                "portfolio_src.prism_utils.sentinel.audit_previous_session",
                new_callable=AsyncMock,
            ):
                await run_stdin_loop()

        captured = capsys.readouterr()
        lines = captured.out.strip().split("\n")

        # First line should be ready signal
        ready = json.loads(lines[0])
        assert ready["status"] == "ready"
        assert "version" in ready
        assert "pid" in ready

    @pytest.mark.asyncio
    async def test_handles_valid_command(self, capsys):
        """Dispatches valid commands and returns response."""
        # Mock stdin to return one command then EOF
        mock_stdin = MagicMock()
        mock_stdin.readline.side_effect = [
            '{"command": "get_health", "id": 1, "payload": {}}\n',
            "",  # EOF
        ]

        mock_response = {"id": 1, "status": "success", "data": {"version": "0.1.0"}}

        with patch("sys.stdin", mock_stdin):
            with patch(
                "portfolio_src.headless.dispatcher.dispatch",
                new_callable=AsyncMock,
                return_value=mock_response,
            ):
                with patch(
                    "portfolio_src.prism_utils.sentinel.audit_previous_session",
                    new_callable=AsyncMock,
                ):
                    await run_stdin_loop()

        captured = capsys.readouterr()
        lines = [l for l in captured.out.strip().split("\n") if l]

        # Should have ready signal + response
        assert len(lines) >= 2

        # Second line should be the response
        response = json.loads(lines[1])
        assert response["status"] == "success"

    @pytest.mark.asyncio
    async def test_handles_invalid_json(self, capsys):
        """Returns error for invalid JSON input."""
        mock_stdin = MagicMock()
        mock_stdin.readline.side_effect = [
            "not valid json\n",
            "",  # EOF
        ]

        with patch("sys.stdin", mock_stdin):
            with patch(
                "portfolio_src.prism_utils.sentinel.audit_previous_session",
                new_callable=AsyncMock,
            ):
                await run_stdin_loop()

        captured = capsys.readouterr()
        lines = [l for l in captured.out.strip().split("\n") if l]

        # Should have ready signal + error
        assert len(lines) >= 2

        error = json.loads(lines[1])
        assert error["status"] == "error"
        assert error["error"]["code"] == "INVALID_JSON"

    @pytest.mark.asyncio
    async def test_handles_empty_lines(self, capsys):
        """Skips empty lines."""
        mock_stdin = MagicMock()
        mock_stdin.readline.side_effect = [
            "\n",
            "   \n",
            "",  # EOF
        ]

        with patch("sys.stdin", mock_stdin):
            with patch(
                "portfolio_src.prism_utils.sentinel.audit_previous_session",
                new_callable=AsyncMock,
            ):
                await run_stdin_loop()

        captured = capsys.readouterr()
        lines = [l for l in captured.out.strip().split("\n") if l]

        # Should only have ready signal
        assert len(lines) == 1

    @pytest.mark.asyncio
    async def test_handles_keyboard_interrupt(self, capsys):
        """Exits gracefully on KeyboardInterrupt."""
        mock_stdin = MagicMock()
        mock_stdin.readline.side_effect = KeyboardInterrupt()

        with patch("sys.stdin", mock_stdin):
            with patch(
                "portfolio_src.prism_utils.sentinel.audit_previous_session",
                new_callable=AsyncMock,
            ):
                # Should not raise
                await run_stdin_loop()

        # Should have emitted ready signal before interrupt
        captured = capsys.readouterr()
        assert "ready" in captured.out


class TestEchoBridge:
    """Tests for run_echo_bridge()."""

    def test_has_http_is_boolean(self):
        """HAS_HTTP is a boolean."""
        assert isinstance(HAS_HTTP, bool)

    def test_exits_without_http_deps(self):
        """Exits with error if HTTP deps not available."""
        with patch("portfolio_src.headless.transports.echo_bridge.HAS_HTTP", False):
            with pytest.raises(SystemExit) as exc_info:
                run_echo_bridge()

            assert exc_info.value.code == 1

    @pytest.mark.skipif(not HAS_HTTP, reason="HTTP deps not installed")
    def test_creates_fastapi_app(self):
        """Creates FastAPI app with correct routes."""
        # We can't easily test the full server, but we can verify
        # the module imports correctly when deps are available
        from portfolio_src.headless.transports.echo_bridge import (
            FastAPI,
            CORSMiddleware,
        )

        assert FastAPI is not None
        assert CORSMiddleware is not None


class TestTransportsPackage:
    """Tests for transports package exports."""

    def test_exports_run_stdin_loop(self):
        """Package exports run_stdin_loop."""
        from portfolio_src.headless.transports import run_stdin_loop

        assert callable(run_stdin_loop)

    def test_exports_run_echo_bridge(self):
        """Package exports run_echo_bridge."""
        from portfolio_src.headless.transports import run_echo_bridge

        assert callable(run_echo_bridge)

    def test_exports_has_http(self):
        """Package exports HAS_HTTP flag."""
        from portfolio_src.headless.transports import HAS_HTTP

        assert isinstance(HAS_HTTP, bool)


class TestIntegration:
    """Integration tests for the refactored headless engine."""

    def test_all_handlers_registered(self):
        """All 20 handlers are registered in the registry."""
        from portfolio_src.headless.handlers import HANDLER_REGISTRY

        assert len(HANDLER_REGISTRY) == 20

    def test_dispatch_available(self):
        """Dispatch function is importable from main package."""
        from portfolio_src.headless import dispatch

        assert callable(dispatch)

    @pytest.mark.asyncio
    async def test_dispatch_routes_to_handler(self):
        """Dispatch correctly routes to handlers."""
        from portfolio_src.headless import dispatch

        # Test with a simple command - patch at source module
        with patch(
            "portfolio_src.data.database.get_db_path",
            return_value="/test/path",
        ):
            result = await dispatch({"command": "get_health", "id": 42, "payload": {}})

        assert result["id"] == 42
        assert result["status"] == "success"
        assert "version" in result["data"]

    def test_lifecycle_functions_available(self):
        """All lifecycle functions are importable."""
        from portfolio_src.headless import (
            setup_session,
            start_dead_mans_switch,
            install_default_config,
            init_database,
            get_session_id,
            get_start_time,
        )

        assert callable(setup_session)
        assert callable(start_dead_mans_switch)
        assert callable(install_default_config)
        assert callable(init_database)
        assert callable(get_session_id)
        assert callable(get_start_time)

    def test_response_helpers_available(self):
        """Response helpers are importable."""
        from portfolio_src.headless import success_response, error_response

        success = success_response(1, {"test": True})
        error = error_response(1, "CODE", "message")

        assert success["status"] == "success"
        assert error["status"] == "error"
