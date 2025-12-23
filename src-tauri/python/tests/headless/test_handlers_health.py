"""Unit tests for health handler."""

import pytest
from unittest.mock import patch, MagicMock

from portfolio_src.headless.handlers.health import handle_get_health


class TestHealthHandler:
    """Tests for handle_get_health handler."""

    @patch("portfolio_src.headless.handlers.health.get_start_time")
    @patch("portfolio_src.headless.handlers.health.get_session_id")
    @patch("portfolio_src.data.database.get_db_path")
    def test_returns_success_response(
        self, mock_db_path, mock_session_id, mock_start_time
    ):
        """Should return success response with health data."""
        mock_db_path.return_value = "/path/to/db.sqlite"
        mock_session_id.return_value = "test-session-123"
        mock_start_time.return_value = 0.0  # Start time = epoch

        result = handle_get_health(cmd_id=1, payload={})

        assert result["status"] == "success"
        assert result["id"] == 1
        assert "data" in result
        assert result["data"]["version"] == "0.1.0"
        assert result["data"]["sessionId"] == "test-session-123"
        assert result["data"]["dbPath"] == "/path/to/db.sqlite"
        assert "memoryUsageMb" in result["data"]
        assert "uptimeSeconds" in result["data"]

    @patch("portfolio_src.headless.handlers.health.get_start_time")
    @patch("portfolio_src.headless.handlers.health.get_session_id")
    @patch("portfolio_src.data.database.get_db_path")
    def test_response_structure_matches_ipc_contract(
        self, mock_db_path, mock_session_id, mock_start_time
    ):
        """Should return response matching IPC contract structure."""
        mock_db_path.return_value = "/test/path"
        mock_session_id.return_value = "session-abc"
        mock_start_time.return_value = 0.0

        result = handle_get_health(cmd_id=42, payload={})

        # Verify IPC contract structure
        assert set(result.keys()) == {"id", "status", "data"}
        assert result["id"] == 42
        assert result["status"] == "success"

        # Verify data fields
        data = result["data"]
        required_fields = {
            "version",
            "sessionId",
            "memoryUsageMb",
            "uptimeSeconds",
            "dbPath",
        }
        assert required_fields.issubset(set(data.keys()))
