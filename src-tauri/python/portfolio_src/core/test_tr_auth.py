"""
TR Auth Manager Unit Tests

Tests for TRAuthManager state machine and credential management.
Uses mocked TRBridge to avoid subprocess spawning.
"""

import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock

from portfolio_src.core.tr_auth import TRAuthManager, AuthState, AuthResult


class TestAuthState:
    """Tests for AuthState enum."""

    def test_all_states_have_string_values(self):
        for state in AuthState:
            assert isinstance(state.value, str)

    def test_expected_states_exist(self):
        expected = [
            "idle",
            "requesting",
            "waiting_for_2fa",
            "verifying",
            "authenticated",
            "error",
        ]
        state_values = [s.value for s in AuthState]
        for exp in expected:
            assert exp in state_values


class TestAuthResult:
    """Tests for AuthResult dataclass."""

    def test_success_result(self):
        result = AuthResult(
            success=True,
            state=AuthState.AUTHENTICATED,
            message="Login successful",
            session_token="abc123",
        )
        assert result.success is True
        assert result.state == AuthState.AUTHENTICATED
        assert result.message == "Login successful"
        assert result.session_token == "abc123"

    def test_failure_result(self):
        result = AuthResult(
            success=False,
            state=AuthState.ERROR,
            message="Login failed",
        )
        assert result.success is False
        assert result.state == AuthState.ERROR
        assert result.session_token is None


class TestTRAuthManagerInit:
    """Tests for TRAuthManager initialization."""

    def test_initial_state_is_idle(self):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = MagicMock()
            manager = TRAuthManager()

        assert manager.state == AuthState.IDLE
        assert manager.is_authenticated is False

    def test_accepts_data_dir(self, temp_data_dir):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = MagicMock()
            manager = TRAuthManager(data_dir=temp_data_dir)

        assert manager.data_dir == temp_data_dir


class TestRequest2FA:
    """Tests for request_2fa method."""

    @pytest.mark.asyncio
    async def test_request_2fa_success(self, mock_bridge):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            result = await manager.request_2fa("+49123456789", "1234")

        assert result.success is True
        assert result.state == AuthState.WAITING_FOR_2FA
        assert manager.state == AuthState.WAITING_FOR_2FA

    @pytest.mark.asyncio
    async def test_request_2fa_session_restored(self, mock_bridge):
        mock_bridge.login.return_value = {
            "status": "authenticated",
            "message": "Session restored",
        }

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            result = await manager.request_2fa("+49123456789", "1234")

        assert result.success is True
        assert result.state == AuthState.AUTHENTICATED
        assert manager.state == AuthState.AUTHENTICATED

    @pytest.mark.asyncio
    async def test_request_2fa_failure(self, mock_bridge):
        mock_bridge.login.return_value = {
            "status": "error",
            "message": "Invalid credentials",
        }

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            result = await manager.request_2fa("+49123456789", "1234")

        assert result.success is False
        assert result.state == AuthState.ERROR
        assert manager.state == AuthState.ERROR

    @pytest.mark.asyncio
    async def test_request_2fa_exception(self, mock_bridge):
        mock_bridge.login.side_effect = Exception("Connection failed")

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            result = await manager.request_2fa("+49123456789", "1234")

        assert result.success is False
        assert result.state == AuthState.ERROR
        assert "Connection failed" in result.message

    @pytest.mark.asyncio
    async def test_request_2fa_stores_phone(self, mock_bridge):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            await manager.request_2fa("+49123456789", "1234")

        assert manager._phone_number == "+49123456789"


class TestVerify2FA:
    """Tests for verify_2fa method."""

    @pytest.mark.asyncio
    async def test_verify_2fa_requires_waiting_state(self, mock_bridge):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            result = await manager.verify_2fa("1234")

        assert result.success is False
        assert "request 2FA first" in result.message

    @pytest.mark.asyncio
    async def test_verify_2fa_success(self, mock_bridge):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()
            manager._state = AuthState.WAITING_FOR_2FA

            result = await manager.verify_2fa("1234")

        assert result.success is True
        assert result.state == AuthState.AUTHENTICATED
        assert manager.state == AuthState.AUTHENTICATED

    @pytest.mark.asyncio
    async def test_verify_2fa_failure_allows_retry(self, mock_bridge):
        mock_bridge.confirm_2fa.return_value = {
            "status": "error",
            "message": "Invalid code",
        }

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()
            manager._state = AuthState.WAITING_FOR_2FA

            result = await manager.verify_2fa("wrong")

        assert result.success is False
        assert manager.state == AuthState.WAITING_FOR_2FA

    @pytest.mark.asyncio
    async def test_verify_2fa_exception(self, mock_bridge):
        mock_bridge.confirm_2fa.side_effect = Exception("Network error")

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()
            manager._state = AuthState.WAITING_FOR_2FA

            result = await manager.verify_2fa("1234")

        assert result.success is False
        assert result.state == AuthState.ERROR


class TestTryRestoreSession:
    """Tests for try_restore_session method."""

    @pytest.mark.asyncio
    async def test_restore_already_authenticated(self, mock_bridge):
        mock_bridge.get_status.return_value = {"status": "authenticated"}

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            result = await manager.try_restore_session()

        assert result.success is True
        assert result.state == AuthState.AUTHENTICATED
        mock_bridge.login.assert_not_called()

    @pytest.mark.asyncio
    async def test_restore_no_credentials(self, mock_bridge):
        mock_bridge.get_status.return_value = {"status": "idle"}

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            with patch.object(
                manager, "get_stored_credentials", return_value=(None, None)
            ):
                result = await manager.try_restore_session()

        assert result.success is False
        assert "No saved credentials" in result.message

    @pytest.mark.asyncio
    async def test_restore_success(self, mock_bridge):
        mock_bridge.get_status.return_value = {"status": "idle"}
        mock_bridge.login.return_value = {
            "status": "authenticated",
            "message": "Restored",
        }

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            with patch.object(
                manager, "get_stored_credentials", return_value=("+49123", "1234")
            ):
                result = await manager.try_restore_session()

        assert result.success is True
        assert result.state == AuthState.AUTHENTICATED

    @pytest.mark.asyncio
    async def test_restore_session_expired(self, mock_bridge):
        mock_bridge.get_status.return_value = {"status": "idle"}
        mock_bridge.login.return_value = {
            "status": "error",
            "code": "SESSION_RESTORE_FAILED",
        }

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            with patch.object(
                manager, "get_stored_credentials", return_value=("+49123", "1234")
            ):
                result = await manager.try_restore_session()

        assert result.success is False
        assert "expired" in result.message.lower()

    @pytest.mark.asyncio
    async def test_restore_needs_2fa(self, mock_bridge):
        mock_bridge.get_status.return_value = {"status": "idle"}
        mock_bridge.login.return_value = {"status": "waiting_2fa"}

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            with patch.object(
                manager, "get_stored_credentials", return_value=("+49123", "1234")
            ):
                result = await manager.try_restore_session()

        assert result.success is False
        assert result.state == AuthState.WAITING_FOR_2FA


class TestCredentialStorage:
    """Tests for credential storage methods."""

    def test_save_credentials_to_file(self, temp_data_dir):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = MagicMock()
            manager = TRAuthManager(data_dir=temp_data_dir)

            result = manager.save_credentials("+49123456789", "1234")

        assert result is True
        cred_file = temp_data_dir / "config" / ".credentials.json"
        assert cred_file.exists()

    def test_load_credentials_from_file(self, temp_data_dir):
        import base64

        config_dir = temp_data_dir / "config"
        config_dir.mkdir(parents=True, exist_ok=True)
        cred_file = config_dir / ".credentials.json"
        cred_file.write_text(
            json.dumps(
                {
                    "phone": base64.b64encode(b"+49123456789").decode(),
                    "pin": base64.b64encode(b"1234").decode(),
                }
            )
        )

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = MagicMock()
            manager = TRAuthManager(data_dir=temp_data_dir)

            phone, pin = manager.get_stored_credentials()

        assert phone == "+49123456789"
        assert pin == "1234"

    def test_load_credentials_no_file(self, temp_data_dir):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = MagicMock()
            manager = TRAuthManager(data_dir=temp_data_dir)

            phone, pin = manager.get_stored_credentials()

        assert phone is None
        assert pin is None

    def test_has_credentials(self, temp_data_dir):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = MagicMock()
            manager = TRAuthManager(data_dir=temp_data_dir)

            with patch.object(
                manager, "get_stored_credentials", return_value=("+49123", "1234")
            ):
                assert manager.has_credentials() is True

            with patch.object(
                manager, "get_stored_credentials", return_value=(None, None)
            ):
                assert manager.has_credentials() is False

    def test_delete_credentials(self, temp_data_dir):
        config_dir = temp_data_dir / "config"
        config_dir.mkdir(parents=True, exist_ok=True)
        cred_file = config_dir / ".credentials.json"
        cred_file.write_text("{}")

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = MagicMock()
            manager = TRAuthManager(data_dir=temp_data_dir)

            manager.delete_credentials()

        assert not cred_file.exists()


class TestLogout:
    """Tests for logout method."""

    def test_logout_clears_state(self, mock_bridge):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()
            manager._state = AuthState.AUTHENTICATED
            manager._phone_number = "+49123"

            manager.logout()

        assert manager.state == AuthState.IDLE
        assert manager._phone_number is None

    def test_logout_calls_bridge_logout(self, mock_bridge):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            manager.logout()

        mock_bridge.logout.assert_called_once()


class TestStateTransitions:
    """Tests for state machine transitions."""

    @pytest.mark.asyncio
    async def test_full_login_flow(self, mock_bridge):
        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            assert manager.state == AuthState.IDLE

            result1 = await manager.request_2fa("+49123", "1234")
            assert manager.state == AuthState.WAITING_FOR_2FA

            result2 = await manager.verify_2fa("5678")
            assert manager.state == AuthState.AUTHENTICATED
            assert manager.is_authenticated is True

    @pytest.mark.asyncio
    async def test_login_error_recovery(self, mock_bridge):
        mock_bridge.login.side_effect = Exception("Network error")

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()

            result = await manager.request_2fa("+49123", "1234")
            assert manager.state == AuthState.ERROR

            mock_bridge.login.side_effect = None
            mock_bridge.login.return_value = {"status": "waiting_2fa"}

            manager._state = AuthState.IDLE
            result = await manager.request_2fa("+49123", "1234")
            assert manager.state == AuthState.WAITING_FOR_2FA

    @pytest.mark.asyncio
    async def test_2fa_retry_on_wrong_code(self, mock_bridge):
        mock_bridge.confirm_2fa.return_value = {
            "status": "error",
            "message": "Wrong code",
        }

        with patch("portfolio_src.core.tr_auth.TRBridge") as mock_bridge_class:
            mock_bridge_class.get_instance.return_value = mock_bridge
            manager = TRAuthManager()
            manager._state = AuthState.WAITING_FOR_2FA

            result1 = await manager.verify_2fa("wrong")
            assert manager.state == AuthState.WAITING_FOR_2FA

            mock_bridge.confirm_2fa.return_value = {"status": "authenticated"}
            result2 = await manager.verify_2fa("correct")
            assert manager.state == AuthState.AUTHENTICATED
