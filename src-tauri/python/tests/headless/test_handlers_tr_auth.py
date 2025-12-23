"""Unit tests for Trade Republic authentication handlers."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from portfolio_src.headless.handlers.tr_auth import (
    handle_tr_login,
    handle_tr_logout,
    handle_tr_get_auth_status,
    handle_tr_submit_2fa,
    handle_tr_check_saved_session,
)


class TestTRLogin:
    """Tests for handle_tr_login handler."""

    @pytest.mark.asyncio
    async def test_missing_phone_returns_error(self):
        """Should return TR_INVALID_CREDENTIALS when phone is missing."""
        result = await handle_tr_login(cmd_id=1, payload={"pin": "1234"})

        assert result["status"] == "error"
        assert result["error"]["code"] == "TR_INVALID_CREDENTIALS"
        assert result["id"] == 1

    @pytest.mark.asyncio
    async def test_missing_pin_returns_error(self):
        """Should return TR_INVALID_CREDENTIALS when PIN is missing."""
        result = await handle_tr_login(cmd_id=2, payload={"phone": "+491234567890"})

        assert result["status"] == "error"
        assert result["error"]["code"] == "TR_INVALID_CREDENTIALS"
        assert result["id"] == 2

    @pytest.mark.asyncio
    async def test_empty_credentials_returns_error(self):
        """Should return error for empty credentials."""
        result = await handle_tr_login(cmd_id=3, payload={"phone": "", "pin": ""})

        assert result["status"] == "error"
        assert result["error"]["code"] == "TR_INVALID_CREDENTIALS"

    @pytest.mark.asyncio
    @patch("portfolio_src.headless.handlers.tr_auth.get_auth_manager")
    async def test_successful_login_triggers_2fa(self, mock_get_auth):
        """Should return waiting_2fa state on successful credentials."""
        mock_auth = MagicMock()
        mock_auth.request_2fa = AsyncMock(
            return_value=MagicMock(
                state=MagicMock(value="waiting_for_2fa"),
                message="2FA code sent",
            )
        )
        mock_get_auth.return_value = mock_auth

        result = await handle_tr_login(
            cmd_id=4,
            payload={"phone": "+491234567890", "pin": "1234", "remember": True},
        )

        assert result["status"] == "success"
        assert result["data"]["authState"] == "waiting_2fa"
        assert result["data"]["countdown"] == 30

    @pytest.mark.asyncio
    @patch("portfolio_src.headless.handlers.tr_auth.get_auth_manager")
    async def test_login_exception_returns_error(self, mock_get_auth):
        """Should return TR_LOGIN_ERROR when auth manager throws."""
        mock_auth = MagicMock()
        mock_auth.request_2fa = AsyncMock(side_effect=Exception("Network timeout"))
        mock_get_auth.return_value = mock_auth

        result = await handle_tr_login(
            cmd_id=5,
            payload={"phone": "+491234567890", "pin": "1234"},
        )

        assert result["status"] == "error"
        assert result["error"]["code"] == "TR_LOGIN_ERROR"
        assert "Network timeout" in result["error"]["message"]


class TestTRSubmit2FA:
    """Tests for handle_tr_submit_2fa handler."""

    @pytest.mark.asyncio
    async def test_missing_code_returns_error(self):
        """Should return TR_2FA_INVALID when code is missing."""
        result = await handle_tr_submit_2fa(cmd_id=1, payload={})

        assert result["status"] == "error"
        assert result["error"]["code"] == "TR_2FA_INVALID"

    @pytest.mark.asyncio
    @patch("portfolio_src.headless.handlers.tr_auth.get_auth_manager")
    async def test_successful_2fa_returns_authenticated(self, mock_get_auth):
        """Should return authenticated state on valid 2FA."""
        mock_auth = MagicMock()
        mock_auth.verify_2fa = AsyncMock(
            return_value=MagicMock(success=True, message="Verified")
        )
        mock_get_auth.return_value = mock_auth

        result = await handle_tr_submit_2fa(cmd_id=2, payload={"code": "123456"})

        assert result["status"] == "success"
        assert result["data"]["authState"] == "authenticated"

    @pytest.mark.asyncio
    @patch("portfolio_src.headless.handlers.tr_auth.get_auth_manager")
    async def test_invalid_2fa_returns_error(self, mock_get_auth):
        """Should return TR_2FA_INVALID on invalid code."""
        mock_auth = MagicMock()
        mock_auth.verify_2fa = AsyncMock(
            return_value=MagicMock(success=False, message="Invalid code")
        )
        mock_get_auth.return_value = mock_auth

        result = await handle_tr_submit_2fa(cmd_id=3, payload={"code": "000000"})

        assert result["status"] == "error"
        assert result["error"]["code"] == "TR_2FA_INVALID"


class TestTRLogout:
    """Tests for handle_tr_logout handler."""

    @pytest.mark.asyncio
    @patch("portfolio_src.headless.handlers.tr_auth.os.path.exists")
    @patch("portfolio_src.headless.handlers.tr_auth.os.remove")
    @patch("portfolio_src.headless.handlers.tr_auth.get_auth_manager")
    async def test_successful_logout(self, mock_get_auth, mock_remove, mock_exists):
        """Should return idle state and clear session."""
        mock_auth = MagicMock()
        mock_auth.logout = MagicMock()
        mock_get_auth.return_value = mock_auth
        mock_exists.return_value = True

        # Use real executor - mocking it breaks asyncio.run_in_executor
        result = await handle_tr_logout(cmd_id=1, payload={})

        assert result["status"] == "success"
        assert result["data"]["authState"] == "idle"
        assert "session cleared" in result["data"]["message"].lower()
