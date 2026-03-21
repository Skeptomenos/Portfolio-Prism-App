"""Unit tests for the command dispatcher."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from portfolio_src.headless.handlers import HANDLER_REGISTRY
from portfolio_src.headless.dispatcher import (
    dispatch,
    get_available_commands,
    is_command_registered,
    _validate_ipc_payload,
)


class TestHandlerRegistry:
    """Tests for the handler registry."""

    def test_registry_contains_all_commands(self):
        """Should contain all expected commands."""
        expected_commands = {
            "get_health",
            "get_engine_health",
            "get_dashboard_data",
            "get_positions",
            "tr_get_auth_status",
            "tr_check_saved_session",
            "tr_restore_session",
            "tr_get_stored_credentials",
            "tr_login",
            "tr_submit_2fa",
            "tr_logout",
            "sync_portfolio",
            "run_pipeline",
            "upload_holdings",
            "preview_holdings_upload",
            "commit_holdings_upload",
            "get_true_holdings",
            "get_pipeline_report",
            "log_event",
            "get_recent_reports",
            "get_pending_reviews",
            "set_hive_contribution",
            "get_hive_contribution",
        }

        assert set(HANDLER_REGISTRY.keys()) == expected_commands

    def test_registry_has_expected_handler_count(self):
        """Should have expected number of handlers registered."""
        assert len(HANDLER_REGISTRY) == 23

    def test_all_handlers_are_callable(self):
        """All registered handlers should be callable."""
        for cmd, handler in HANDLER_REGISTRY.items():
            assert callable(handler), f"Handler for '{cmd}' is not callable"

    def test_get_health_aliases_to_same_handler(self):
        """get_health and get_engine_health should use the same handler."""
        assert HANDLER_REGISTRY["get_health"] is HANDLER_REGISTRY["get_engine_health"]


class TestDispatch:
    """Tests for the dispatch function."""

    @pytest.mark.asyncio
    async def test_unknown_command_returns_error(self):
        """Should return UNKNOWN_COMMAND error for unregistered commands."""
        result = await dispatch(
            {
                "command": "nonexistent_command",
                "id": 1,
                "payload": {},
            }
        )

        assert result["success"] is False
        assert result["error"]["code"] == "UNKNOWN_COMMAND"
        assert result["id"] == 1

    @pytest.mark.asyncio
    async def test_empty_command_returns_error(self):
        """Should return error for empty command."""
        result = await dispatch({"id": 2, "payload": {}})

        assert result["success"] is False
        assert result["error"]["code"] == "UNKNOWN_COMMAND"

    @pytest.mark.asyncio
    @patch("portfolio_src.headless.handlers.health.get_start_time")
    @patch("portfolio_src.headless.handlers.health.get_session_id")
    @patch("portfolio_src.data.database.get_db_path")
    async def test_dispatches_sync_handler(self, mock_db_path, mock_session_id, mock_start_time):
        """Should dispatch to sync handler correctly."""
        mock_db_path.return_value = "/test/db"
        mock_session_id.return_value = "test-session"
        mock_start_time.return_value = 0.0

        result = await dispatch(
            {
                "command": "get_health",
                "id": 3,
                "payload": {},
            }
        )

        assert result["success"] is True
        assert result["id"] == 3
        assert result["data"]["version"] == "0.1.0"

    @pytest.mark.asyncio
    async def test_dispatches_async_handler(self):
        """Should dispatch to async handler correctly."""
        # tr_login is async and validates input
        result = await dispatch(
            {
                "command": "tr_login",
                "id": 4,
                "payload": {"phone": "", "pin": ""},
            }
        )

        # Should return validation error (missing credentials)
        assert result["success"] is False
        assert result["error"]["code"] == "TR_INVALID_CREDENTIALS"

    @pytest.mark.asyncio
    @patch("portfolio_src.headless.dispatcher.HANDLER_REGISTRY")
    async def test_handler_exception_returns_error(self, mock_registry):
        """Should return HANDLER_ERROR when handler throws."""
        mock_handler = MagicMock(side_effect=Exception("Test error"))
        mock_registry.get.return_value = mock_handler

        result = await dispatch(
            {
                "command": "test_cmd",
                "id": 5,
                "payload": {},
            }
        )

        assert result["success"] is False
        assert result["error"]["code"] == "HANDLER_ERROR"
        assert "Test error" in result["error"]["message"]


class TestDispatcherHelpers:
    """Tests for dispatcher helper functions."""

    def test_get_available_commands_returns_sorted_list(self):
        """Should return sorted list of commands."""
        commands = get_available_commands()

        assert isinstance(commands, list)
        assert len(commands) == 23
        assert commands == sorted(commands)

    def test_is_command_registered_returns_true_for_valid(self):
        """Should return True for registered commands."""
        assert is_command_registered("get_health") is True
        assert is_command_registered("sync_portfolio") is True

    def test_is_command_registered_returns_false_for_invalid(self):
        """Should return False for unregistered commands."""
        assert is_command_registered("fake_command") is False
        assert is_command_registered("") is False


class TestIPCPayloadValidation:
    """Tests for IPC payload structure validation."""

    def test_validate_valid_payload(self):
        """Should accept well-formed payload."""
        is_valid, error, cmd_id = _validate_ipc_payload(
            {"command": "get_health", "id": 1, "payload": {}}
        )
        assert is_valid is True
        assert error == ""
        assert cmd_id == 1

    def test_validate_payload_not_dict(self):
        """Should reject non-dict payload."""
        is_valid, error, cmd_id = _validate_ipc_payload("not a dict")
        assert is_valid is False
        assert "must be a dict" in error
        assert cmd_id == 0

    def test_validate_payload_none(self):
        """Should reject None payload."""
        is_valid, error, cmd_id = _validate_ipc_payload(None)
        assert is_valid is False
        assert "must be a dict" in error

    def test_validate_payload_list(self):
        """Should reject list payload."""
        is_valid, error, cmd_id = _validate_ipc_payload([1, 2, 3])
        assert is_valid is False
        assert "must be a dict" in error

    def test_validate_command_not_string(self):
        """Should reject non-string command."""
        is_valid, error, cmd_id = _validate_ipc_payload({"command": 123, "id": 1, "payload": {}})
        assert is_valid is False
        assert "'command' must be a string" in error
        assert cmd_id == 1  # ID should still be extracted

    def test_validate_command_list(self):
        """Should reject list command."""
        is_valid, error, cmd_id = _validate_ipc_payload(
            {"command": ["cmd"], "id": 2, "payload": {}}
        )
        assert is_valid is False
        assert "'command' must be a string" in error
        assert cmd_id == 2

    def test_validate_id_not_int(self):
        """Should reject non-integer id."""
        is_valid, error, cmd_id = _validate_ipc_payload(
            {"command": "test", "id": "not_int", "payload": {}}
        )
        assert is_valid is False
        assert "'id' must be an integer" in error
        assert cmd_id == 0  # Default when id is invalid

    def test_validate_id_float_coerced(self):
        """Should coerce float id to int."""
        is_valid, error, cmd_id = _validate_ipc_payload(
            {"command": "test", "id": 5.0, "payload": {}}
        )
        assert is_valid is True
        assert cmd_id == 5

    def test_validate_id_string_int_coerced(self):
        """Should coerce string integer to int."""
        is_valid, error, cmd_id = _validate_ipc_payload(
            {"command": "test", "id": "42", "payload": {}}
        )
        assert is_valid is True
        assert cmd_id == 42

    def test_validate_payload_field_not_dict(self):
        """Should reject non-dict payload field."""
        is_valid, error, cmd_id = _validate_ipc_payload(
            {"command": "test", "id": 1, "payload": "string_payload"}
        )
        assert is_valid is False
        assert "'payload' must be a dict" in error
        assert cmd_id == 1

    def test_validate_payload_field_list(self):
        """Should reject list payload field."""
        is_valid, error, cmd_id = _validate_ipc_payload(
            {"command": "test", "id": 3, "payload": [1, 2, 3]}
        )
        assert is_valid is False
        assert "'payload' must be a dict" in error
        assert cmd_id == 3

    def test_validate_missing_command_ok(self):
        """Should accept missing command (handled downstream)."""
        is_valid, error, cmd_id = _validate_ipc_payload({"id": 1, "payload": {}})
        assert is_valid is True

    def test_validate_missing_payload_ok(self):
        """Should accept missing payload."""
        is_valid, error, cmd_id = _validate_ipc_payload({"command": "test", "id": 1})
        assert is_valid is True

    def test_validate_missing_id_defaults_zero(self):
        """Should default missing id to 0."""
        is_valid, error, cmd_id = _validate_ipc_payload({"command": "test", "payload": {}})
        assert is_valid is True
        assert cmd_id == 0


class TestDispatchPayloadValidation:
    """Tests for dispatch function with invalid payloads."""

    @pytest.mark.asyncio
    async def test_dispatch_non_dict_payload(self):
        """Should return INVALID_PAYLOAD for non-dict input."""
        result = await dispatch("not a dict")

        assert result["success"] is False
        assert result["error"]["code"] == "INVALID_PAYLOAD"
        assert "must be a dict" in result["error"]["message"]
        assert result["id"] == 0

    @pytest.mark.asyncio
    async def test_dispatch_invalid_command_type(self):
        """Should return INVALID_PAYLOAD for non-string command."""
        result = await dispatch({"command": 123, "id": 5, "payload": {}})

        assert result["success"] is False
        assert result["error"]["code"] == "INVALID_PAYLOAD"
        assert "'command' must be a string" in result["error"]["message"]
        assert result["id"] == 5

    @pytest.mark.asyncio
    async def test_dispatch_invalid_id_type(self):
        """Should return INVALID_PAYLOAD for non-integer id."""
        result = await dispatch({"command": "test", "id": {"nested": "dict"}, "payload": {}})

        assert result["success"] is False
        assert result["error"]["code"] == "INVALID_PAYLOAD"
        assert "'id' must be an integer" in result["error"]["message"]

    @pytest.mark.asyncio
    async def test_dispatch_invalid_payload_type(self):
        """Should return INVALID_PAYLOAD for non-dict payload field."""
        result = await dispatch({"command": "get_health", "id": 7, "payload": "string"})

        assert result["success"] is False
        assert result["error"]["code"] == "INVALID_PAYLOAD"
        assert "'payload' must be a dict" in result["error"]["message"]
        assert result["id"] == 7
