"""
TR Daemon Unit Tests

Tests for TRDaemon handlers with mocked pytr dependencies.
These tests verify the daemon's internal logic without network calls.
"""

import asyncio
import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from pathlib import Path

from portfolio_src.core.tr_daemon import (
    TRDaemon,
    create_error_response,
    create_success_response,
)
from portfolio_src.core.tr_protocol import TRRequest, TRMethod


class TestTRDaemonInit:
    """Tests for TRDaemon initialization."""

    def test_initial_state(self):
        daemon = TRDaemon()
        assert daemon.api is None
        assert daemon._pending_phone is None
        assert daemon._pending_pin is None
        assert daemon._cached_auth_status == "idle"

    def test_get_data_dir_returns_path(self):
        daemon = TRDaemon()
        data_dir = daemon._get_data_dir()
        assert isinstance(data_dir, Path)
        assert "PortfolioPrism" in str(data_dir)


class TestHandleLogin:
    """Tests for handle_login method."""

    @pytest.mark.asyncio
    async def test_login_missing_credentials_returns_error(self):
        daemon = TRDaemon()
        result = await daemon.handle_login(None, None)
        assert result["status"] == "error"
        assert "required" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_login_missing_phone_returns_error(self):
        daemon = TRDaemon()
        result = await daemon.handle_login(None, "1234")
        assert result["status"] == "error"

    @pytest.mark.asyncio
    async def test_login_missing_pin_returns_error(self):
        daemon = TRDaemon()
        result = await daemon.handle_login("+49123", None)
        assert result["status"] == "error"

    @pytest.mark.asyncio
    async def test_login_stores_pending_credentials(self):
        daemon = TRDaemon()
        with patch("pytr.api.TradeRepublicApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.resume_websession.return_value = False
            mock_api.initiate_weblogin.return_value = 30
            mock_api_class.return_value = mock_api

            await daemon.handle_login("+49123456789", "1234")

            assert daemon._pending_phone == "+49123456789"
            assert daemon._pending_pin == "1234"

    @pytest.mark.asyncio
    async def test_login_session_restored_from_cookies(self):
        daemon = TRDaemon()
        with patch("pytr.api.TradeRepublicApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.resume_websession.return_value = True
            mock_api_class.return_value = mock_api

            result = await daemon.handle_login("+49123", "1234")

            assert result["status"] == "authenticated"
            assert daemon._cached_auth_status == "authenticated"

    @pytest.mark.asyncio
    async def test_login_initiates_2fa(self):
        daemon = TRDaemon()
        with patch("pytr.api.TradeRepublicApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.resume_websession.return_value = False
            mock_api.initiate_weblogin.return_value = 30
            mock_api_class.return_value = mock_api

            result = await daemon.handle_login("+49123", "1234")

            assert result["status"] == "waiting_2fa"
            assert result["countdown"] == 30

    @pytest.mark.asyncio
    async def test_login_handles_rate_limit(self):
        daemon = TRDaemon()
        with patch("pytr.api.TradeRepublicApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.resume_websession.side_effect = Exception("TOO_MANY_REQUESTS")
            mock_api_class.return_value = mock_api

            result = await daemon.handle_login("+49123", "1234")

            assert result["status"] == "error"
            assert result["code"] == "RATE_LIMITED"

    @pytest.mark.asyncio
    async def test_login_restore_only_fails_gracefully(self):
        daemon = TRDaemon()
        with patch("pytr.api.TradeRepublicApi") as mock_api_class:
            mock_api = MagicMock()
            mock_api.resume_websession.return_value = False
            mock_api_class.return_value = mock_api

            result = await daemon.handle_login("+49123", "1234", restore_only=True)

            assert result["status"] == "error"
            assert result["code"] == "SESSION_RESTORE_FAILED"


class TestHandleConfirm2FA:
    """Tests for handle_confirm_2fa method."""

    @pytest.mark.asyncio
    async def test_2fa_missing_token_returns_error(self):
        daemon = TRDaemon()
        result = await daemon.handle_confirm_2fa(None)
        assert result["status"] == "error"
        assert "required" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_2fa_no_api_returns_error(self):
        daemon = TRDaemon()
        result = await daemon.handle_confirm_2fa("1234")
        assert result["status"] == "error"
        assert "login first" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_2fa_success_updates_status(self):
        daemon = TRDaemon()
        daemon.api = MagicMock()
        daemon.api.complete_weblogin.return_value = None

        result = await daemon.handle_confirm_2fa("1234")

        assert result["status"] == "authenticated"
        assert daemon._cached_auth_status == "authenticated"

    @pytest.mark.asyncio
    async def test_2fa_failure_returns_error(self):
        daemon = TRDaemon()
        daemon.api = MagicMock()
        daemon.api.complete_weblogin.side_effect = Exception("Invalid token")

        result = await daemon.handle_confirm_2fa("wrong")

        assert result["status"] == "error"
        assert "failed" in result["message"].lower()


class TestHandleLogout:
    """Tests for handle_logout method."""

    @pytest.mark.asyncio
    async def test_logout_clears_api(self):
        daemon = TRDaemon()
        daemon.api = MagicMock()
        daemon._cached_auth_status = "authenticated"

        result = await daemon.handle_logout()

        assert result["status"] == "logged_out"
        assert daemon.api is None
        assert daemon._cached_auth_status == "idle"

    @pytest.mark.asyncio
    async def test_logout_deletes_cookies(self, temp_data_dir):
        daemon = TRDaemon()
        daemon.api = MagicMock()

        cookies_file = temp_data_dir / "tr_cookies.txt"
        cookies_file.write_text("session_data")

        with patch.object(daemon, "_get_data_dir", return_value=temp_data_dir):
            result = await daemon.handle_logout()

        assert result["status"] == "logged_out"
        assert not cookies_file.exists()


class TestHandleFetchPortfolio:
    """Tests for handle_fetch_portfolio method."""

    @pytest.mark.asyncio
    async def test_fetch_no_api_returns_error(self):
        daemon = TRDaemon()
        result = await daemon.handle_fetch_portfolio()
        assert result["status"] == "error"
        assert "not initialized" in result["message"].lower()

    @pytest.mark.asyncio
    async def test_fetch_success_returns_positions(self):
        daemon = TRDaemon()
        daemon.api = MagicMock()

        mock_portfolio = MagicMock()
        mock_portfolio.portfolio = [
            {"isin": "DE123", "name": "Test Stock", "quantity": 10}
        ]
        mock_portfolio.cash = []

        async def mock_loop():
            pass

        mock_portfolio.portfolio_loop = mock_loop

        with patch("pytr.portfolio.Portfolio", return_value=mock_portfolio):
            result = await daemon.handle_fetch_portfolio()

        assert result["status"] == "success"
        assert len(result["data"]["positions"]) == 1

    @pytest.mark.asyncio
    @pytest.mark.filterwarnings("ignore::RuntimeWarning")
    async def test_fetch_timeout_resets_api(self):
        daemon = TRDaemon()
        daemon.api = MagicMock()
        daemon._cached_auth_status = "authenticated"

        mock_portfolio = MagicMock()
        mock_portfolio.portfolio_loop = MagicMock()

        with patch("pytr.portfolio.Portfolio", return_value=mock_portfolio):
            with patch("asyncio.wait_for", side_effect=asyncio.TimeoutError()):
                result = await daemon.handle_fetch_portfolio()

        assert result["status"] == "error"
        assert result["code"] == "TIMEOUT"
        assert daemon.api is None
        assert daemon._cached_auth_status == "idle"

    @pytest.mark.asyncio
    async def test_fetch_auth_error_resets_api(self):
        daemon = TRDaemon()
        daemon.api = MagicMock()
        daemon._cached_auth_status = "authenticated"

        mock_portfolio = MagicMock()

        async def auth_fail_loop():
            raise Exception("401 Unauthorized")

        mock_portfolio.portfolio_loop = auth_fail_loop

        with patch("pytr.portfolio.Portfolio", return_value=mock_portfolio):
            result = await daemon.handle_fetch_portfolio()

        assert result["status"] == "error"
        assert daemon.api is None
        assert daemon._cached_auth_status == "idle"

    @pytest.mark.asyncio
    async def test_fetch_empty_positions_returns_error(self):
        daemon = TRDaemon()
        daemon.api = MagicMock()

        mock_portfolio = MagicMock()
        mock_portfolio.portfolio = []
        mock_portfolio.cash = []

        async def mock_loop():
            pass

        mock_portfolio.portfolio_loop = mock_loop

        with patch("pytr.portfolio.Portfolio", return_value=mock_portfolio):
            result = await daemon.handle_fetch_portfolio()

        assert result["status"] == "error"
        assert "no positions" in result["message"].lower()


class TestHandleGetStatus:
    """Tests for handle_get_status method."""

    @pytest.mark.asyncio
    async def test_get_status_returns_cached_status(self):
        daemon = TRDaemon()
        daemon._cached_auth_status = "authenticated"

        result = await daemon.handle_get_status()

        assert result["status"] == "authenticated"

    @pytest.mark.asyncio
    async def test_get_status_idle_by_default(self):
        daemon = TRDaemon()
        result = await daemon.handle_get_status()
        assert result["status"] == "idle"

    @pytest.mark.asyncio
    async def test_get_status_does_not_call_api(self):
        daemon = TRDaemon()
        daemon.api = MagicMock()
        daemon._cached_auth_status = "authenticated"

        await daemon.handle_get_status()

        daemon.api.resume_websession.assert_not_called()


class TestProcessRequest:
    """Tests for process_request method."""

    @pytest.mark.asyncio
    async def test_process_unknown_method_returns_error(self):
        daemon = TRDaemon()
        request = TRRequest(method="unknown_method", params={}, id="test_1")

        response_json = await daemon.process_request(request)
        response = json.loads(response_json)

        assert response["result"]["status"] == "error"
        assert "unknown" in response["result"]["message"].lower()

    @pytest.mark.asyncio
    async def test_process_get_status(self):
        daemon = TRDaemon()
        daemon._cached_auth_status = "idle"
        request = TRRequest(method=TRMethod.GET_STATUS.value, params={}, id="test_1")

        response_json = await daemon.process_request(request)
        response = json.loads(response_json)

        assert response["id"] == "test_1"
        assert response["result"]["status"] == "idle"

    @pytest.mark.asyncio
    async def test_process_logout(self):
        daemon = TRDaemon()
        daemon.api = MagicMock()
        request = TRRequest(method=TRMethod.LOGOUT.value, params={}, id="test_2")

        response_json = await daemon.process_request(request)
        response = json.loads(response_json)

        assert response["result"]["status"] == "logged_out"

    @pytest.mark.asyncio
    async def test_process_request_preserves_id(self):
        daemon = TRDaemon()
        request = TRRequest(
            method=TRMethod.GET_STATUS.value, params={}, id="unique_123"
        )

        response_json = await daemon.process_request(request)
        response = json.loads(response_json)

        assert response["id"] == "unique_123"


class TestResponseHelpers:
    """Tests for response helper functions."""

    def test_create_error_response_format(self):
        response_json = create_error_response("req_1", "Test error")
        response = json.loads(response_json)

        assert response["id"] == "req_1"
        assert response["error"] == "Test error"
        assert response["result"] is None

    def test_create_success_response_format(self):
        response_json = create_success_response("req_2", {"status": "ok"})
        response = json.loads(response_json)

        assert response["id"] == "req_2"
        assert response["result"] == {"status": "ok"}
        assert response["error"] is None

    def test_create_success_response_handles_decimal(self):
        from decimal import Decimal

        response_json = create_success_response("req_3", {"value": Decimal("123.45")})
        response = json.loads(response_json)

        assert response["result"]["value"] == 123.45
