"""
TR Protocol Tests

Tests for the JSON-RPC protocol between TRBridge and TRDaemon.
Ensures serialization/deserialization works correctly and protocol contracts are maintained.
"""

import json
import pytest
from dataclasses import asdict

from portfolio_src.core.tr_protocol import (
    TRMethod,
    TRRequest,
    TRResponse,
    TRError,
    serialize_request,
    deserialize_response,
    create_error_response,
    create_success_response,
)


class TestTRMethod:
    """Tests for TRMethod enum."""

    def test_all_methods_have_string_values(self):
        for method in TRMethod:
            assert isinstance(method.value, str)
            assert len(method.value) > 0

    def test_expected_methods_exist(self, valid_protocol_methods):
        method_values = [m.value for m in TRMethod]
        for expected in valid_protocol_methods:
            assert expected in method_values, f"Missing method: {expected}"

    def test_method_values_are_lowercase(self):
        for method in TRMethod:
            assert method.value == method.value.lower()


class TestTRRequest:
    """Tests for TRRequest dataclass."""

    def test_create_request(self):
        request = TRRequest(method="login", params={"phone": "+49123"}, id="req_1")
        assert request.method == "login"
        assert request.params == {"phone": "+49123"}
        assert request.id == "req_1"

    def test_request_to_dict(self):
        request = TRRequest(method="get_status", params={}, id="req_2")
        data = asdict(request)
        assert data["method"] == "get_status"
        assert data["params"] == {}
        assert data["id"] == "req_2"

    def test_request_with_empty_params(self):
        request = TRRequest(method="logout", params={}, id="req_3")
        assert request.params == {}


class TestTRResponse:
    """Tests for TRResponse dataclass."""

    def test_success_response(self):
        response = TRResponse(result={"status": "ok"}, error=None, id="req_1")
        assert response.result == {"status": "ok"}
        assert response.error is None
        assert response.id == "req_1"

    def test_error_response(self):
        response = TRResponse(result=None, error="Something failed", id="req_2")
        assert response.result is None
        assert response.error == "Something failed"
        assert response.id == "req_2"

    def test_response_to_dict(self):
        response = TRResponse(result={"data": 123}, error=None, id="req_3")
        data = asdict(response)
        assert "result" in data
        assert "error" in data
        assert "id" in data


class TestSerializeRequest:
    """Tests for serialize_request function."""

    def test_serialize_login_request(self, sample_login_params):
        request = TRRequest(method="login", params=sample_login_params, id="test_1")
        json_str = serialize_request(request)
        parsed = json.loads(json_str)
        assert parsed["method"] == "login"
        assert parsed["params"]["phone"] == "+491234567890"
        assert parsed["params"]["pin"] == "1234"
        assert parsed["id"] == "test_1"

    def test_serialize_empty_params(self):
        request = TRRequest(method="get_status", params={}, id="test_2")
        json_str = serialize_request(request)
        parsed = json.loads(json_str)
        assert parsed["params"] == {}

    def test_serialized_output_is_valid_json(self):
        request = TRRequest(method="logout", params={}, id="test_3")
        json_str = serialize_request(request)
        json.loads(json_str)


class TestDeserializeResponse:
    """Tests for deserialize_response function."""

    def test_deserialize_success_response(self):
        json_str = (
            '{"result": {"status": "authenticated"}, "error": null, "id": "req_1"}'
        )
        response = deserialize_response(json_str)
        assert response.result == {"status": "authenticated"}
        assert response.error is None
        assert response.id == "req_1"

    def test_deserialize_error_response(self):
        json_str = '{"result": null, "error": "Login failed", "id": "req_2"}'
        response = deserialize_response(json_str)
        assert response.result is None
        assert response.error == "Login failed"
        assert response.id == "req_2"

    def test_deserialize_missing_fields_uses_none(self):
        json_str = '{"id": "req_3"}'
        response = deserialize_response(json_str)
        assert response.result is None
        assert response.error is None
        assert response.id == "req_3"

    def test_deserialize_invalid_json_raises(self):
        with pytest.raises(json.JSONDecodeError):
            deserialize_response("not valid json")


class TestCreateErrorResponse:
    """Tests for create_error_response function."""

    def test_creates_valid_json(self):
        json_str = create_error_response("req_1", "Something went wrong")
        parsed = json.loads(json_str)
        assert parsed["error"] == "Something went wrong"
        assert parsed["result"] is None
        assert parsed["id"] == "req_1"

    def test_error_message_preserved(self):
        error_msg = "TOO_MANY_REQUESTS: Rate limited"
        json_str = create_error_response("req_2", error_msg)
        parsed = json.loads(json_str)
        assert parsed["error"] == error_msg


class TestCreateSuccessResponse:
    """Tests for create_success_response function."""

    def test_creates_valid_json(self):
        result = {"status": "authenticated", "token": "abc123"}
        json_str = create_success_response("req_1", result)
        parsed = json.loads(json_str)
        assert parsed["result"] == result
        assert parsed["error"] is None
        assert parsed["id"] == "req_1"

    def test_nested_result_preserved(self):
        result = {
            "status": "success",
            "data": {
                "positions": [{"isin": "DE123", "quantity": 10}],
                "cash": [],
            },
        }
        json_str = create_success_response("req_2", result)
        parsed = json.loads(json_str)
        assert parsed["result"]["data"]["positions"][0]["isin"] == "DE123"


class TestTRError:
    """Tests for TRError exception class."""

    def test_error_with_message(self):
        error = TRError("Connection failed")
        assert str(error) == "Connection failed"
        assert error.message == "Connection failed"

    def test_error_with_method(self):
        error = TRError("Timeout", method="fetch_portfolio")
        assert error.method == "fetch_portfolio"
        assert error.message == "Timeout"

    def test_error_is_exception(self):
        error = TRError("Test error")
        assert isinstance(error, Exception)
        with pytest.raises(TRError):
            raise error


class TestProtocolRoundTrip:
    """Tests for full request/response round-trip serialization."""

    def test_request_response_id_matches(self):
        request = TRRequest(
            method="login", params={"phone": "+49123"}, id="unique_id_123"
        )
        request_json = serialize_request(request)
        parsed_request = json.loads(request_json)

        response_json = create_success_response(
            parsed_request["id"], {"status": "waiting_2fa"}
        )
        response = deserialize_response(response_json)

        assert response.id == request.id

    def test_all_methods_can_be_serialized(self, valid_protocol_methods):
        for method in valid_protocol_methods:
            request = TRRequest(method=method, params={}, id=f"test_{method}")
            json_str = serialize_request(request)
            parsed = json.loads(json_str)
            assert parsed["method"] == method
