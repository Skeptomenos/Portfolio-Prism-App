"""Tests for headless/responses.py - IPC response helpers."""

import pytest

from portfolio_src.headless.responses import success_response, error_response


class TestSuccessResponse:
    """Tests for success_response()."""

    def test_returns_correct_structure(self):
        """Success response has id, status, and data keys."""
        result = success_response(1, {"foo": "bar"})

        assert "id" in result
        assert "status" in result
        assert "data" in result
        assert len(result) == 3

    def test_status_is_success(self):
        """Status field is always 'success'."""
        result = success_response(42, {})

        assert result["status"] == "success"

    def test_preserves_cmd_id(self):
        """Command ID is preserved in response."""
        result = success_response(123, {})

        assert result["id"] == 123

    def test_preserves_data_payload(self):
        """Data payload is preserved exactly."""
        data = {"version": "0.1.0", "nested": {"key": "value"}}
        result = success_response(1, data)

        assert result["data"] == data

    def test_handles_empty_data(self):
        """Empty data dict is valid."""
        result = success_response(1, {})

        assert result["data"] == {}

    def test_handles_zero_cmd_id(self):
        """Zero is a valid command ID."""
        result = success_response(0, {"test": True})

        assert result["id"] == 0


class TestErrorResponse:
    """Tests for error_response()."""

    def test_returns_correct_structure(self):
        """Error response has id, status, and error keys."""
        result = error_response(1, "TEST_ERROR", "Test message")

        assert "id" in result
        assert "status" in result
        assert "error" in result
        assert len(result) == 3

    def test_status_is_error(self):
        """Status field is always 'error'."""
        result = error_response(42, "CODE", "msg")

        assert result["status"] == "error"

    def test_preserves_cmd_id(self):
        """Command ID is preserved in response."""
        result = error_response(456, "CODE", "msg")

        assert result["id"] == 456

    def test_error_has_code_and_message(self):
        """Error object contains code and message."""
        result = error_response(1, "TR_AUTH_ERROR", "Invalid credentials")

        assert result["error"]["code"] == "TR_AUTH_ERROR"
        assert result["error"]["message"] == "Invalid credentials"

    def test_error_object_has_only_two_keys(self):
        """Error object has exactly code and message."""
        result = error_response(1, "CODE", "msg")

        assert len(result["error"]) == 2

    def test_handles_empty_message(self):
        """Empty message is valid."""
        result = error_response(1, "EMPTY_MSG", "")

        assert result["error"]["message"] == ""

    def test_handles_long_message(self):
        """Long error messages are preserved."""
        long_msg = "A" * 1000
        result = error_response(1, "LONG", long_msg)

        assert result["error"]["message"] == long_msg


class TestIPCContractCompliance:
    """Tests ensuring responses match the IPC contract with Rust."""

    def test_success_response_is_json_serializable(self):
        """Success response can be serialized to JSON."""
        import json

        result = success_response(1, {"data": [1, 2, 3]})
        serialized = json.dumps(result)

        assert isinstance(serialized, str)

    def test_error_response_is_json_serializable(self):
        """Error response can be serialized to JSON."""
        import json

        result = error_response(1, "CODE", "message")
        serialized = json.dumps(result)

        assert isinstance(serialized, str)

    def test_success_and_error_have_same_top_level_keys_except_data_error(self):
        """Both response types share 'id' and 'status' keys."""
        success = success_response(1, {})
        error = error_response(1, "CODE", "msg")

        # Both have id and status
        assert "id" in success and "id" in error
        assert "status" in success and "status" in error

        # Success has data, error has error
        assert "data" in success and "data" not in error
        assert "error" in error and "error" not in success
