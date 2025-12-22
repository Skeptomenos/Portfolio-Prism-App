"""
Pytest fixtures for Trade Republic integration tests.

These fixtures provide mocked versions of pytr and other external dependencies
to enable safe, isolated testing of TR logic without network calls.
"""

import json
import pytest
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Dict, Any, List
from unittest.mock import MagicMock, AsyncMock


# === Mock pytr API ===


class MockTradeRepublicApi:
    """Mock of pytr.api.TradeRepublicApi for testing."""

    def __init__(
        self,
        phone_no: str = "",
        pin: str = "",
        save_cookies: bool = True,
        cookies_file: str = "",
    ):
        self.phone_no = phone_no
        self.pin = pin
        self.save_cookies = save_cookies
        self.cookies_file = cookies_file

        self._session_valid = False
        self._2fa_pending = False
        self._should_fail = False
        self._fail_message = ""
        self._rate_limited = False

    def resume_websession(self) -> bool:
        if self._rate_limited:
            raise Exception("TOO_MANY_REQUESTS")
        return self._session_valid

    def initiate_weblogin(self) -> int:
        if self._rate_limited:
            raise Exception("TOO_MANY_REQUESTS")
        if self._should_fail:
            raise Exception(self._fail_message)
        self._2fa_pending = True
        return 30

    def inititate_weblogin(self) -> int:
        return self.initiate_weblogin()

    def complete_weblogin(self, token: str) -> None:
        if self._should_fail:
            raise Exception(self._fail_message)
        if token == "1234":
            self._session_valid = True
            self._2fa_pending = False
        else:
            raise Exception("Invalid 2FA token")

    def set_session_valid(self, valid: bool) -> None:
        self._session_valid = valid

    def set_rate_limited(self, limited: bool) -> None:
        self._rate_limited = limited

    def set_should_fail(self, fail: bool, message: str = "Mock failure") -> None:
        self._should_fail = fail
        self._fail_message = message


class MockPortfolio:
    """Mock of pytr.portfolio.Portfolio for testing."""

    def __init__(self, api: MockTradeRepublicApi):
        self.api = api
        self.portfolio: List[Dict[str, Any]] = []
        self.cash: List[Dict[str, Any]] = []
        self._should_timeout = False
        self._should_fail = False

    async def portfolio_loop(self) -> None:
        if self._should_timeout:
            import asyncio

            await asyncio.sleep(100)
        if self._should_fail:
            raise Exception("Portfolio fetch failed")
        self.portfolio = [
            {
                "instrumentId": "DE0007164600",
                "isin": "DE0007164600",
                "name": "SAP SE",
                "quantity": 10.0,
                "averageBuyIn": 120.50,
                "currentPrice": 135.20,
            },
            {
                "instrumentId": "IE00B4L5Y983",
                "isin": "IE00B4L5Y983",
                "name": "iShares Core MSCI World",
                "quantity": 50.0,
                "averageBuyIn": 75.00,
                "currentPrice": 82.30,
            },
        ]

    def set_timeout(self, timeout: bool) -> None:
        self._should_timeout = timeout

    def set_fail(self, fail: bool) -> None:
        self._should_fail = fail


@pytest.fixture
def mock_tr_api():
    """Provides a mock Trade Republic API instance."""
    return MockTradeRepublicApi()


@pytest.fixture
def mock_portfolio(mock_tr_api):
    """Provides a mock Portfolio instance."""
    return MockPortfolio(mock_tr_api)


# === TR Daemon Fixtures ===


@dataclass
class MockDaemonResponse:
    """Represents a response from the TR daemon."""

    result: Optional[Dict[str, Any]]
    error: Optional[str]
    id: str


@pytest.fixture
def daemon_request_factory():
    """Factory for creating daemon request JSON."""

    def _create(
        method: str, params: Optional[Dict[str, Any]] = None, request_id: str = "test_1"
    ):
        return json.dumps(
            {
                "method": method,
                "params": params or {},
                "id": request_id,
            }
        )

    return _create


@pytest.fixture
def daemon_response_parser():
    """Parser for daemon response JSON."""

    def _parse(response_line: str) -> MockDaemonResponse:
        data = json.loads(response_line.strip())
        return MockDaemonResponse(
            result=data.get("result"),
            error=data.get("error"),
            id=data.get("id", ""),
        )

    return _parse


# === TRBridge Fixtures ===


@pytest.fixture
def mock_bridge():
    """Provides a mock TRBridge for testing auth manager."""
    bridge = MagicMock()
    bridge.login.return_value = {"status": "waiting_2fa", "message": "2FA sent"}
    bridge.confirm_2fa.return_value = {"status": "authenticated", "message": "Success"}
    bridge.get_status.return_value = {"status": "idle"}
    bridge.logout.return_value = {"status": "logged_out"}
    bridge.fetch_portfolio.return_value = {
        "status": "success",
        "data": {"positions": [], "cash": []},
    }
    return bridge


# === Temp Directory Fixtures ===


@pytest.fixture
def temp_data_dir(tmp_path):
    """Provides a temporary data directory for tests."""
    data_dir = tmp_path / "PortfolioPrism"
    data_dir.mkdir(parents=True)
    (data_dir / "config").mkdir()
    return data_dir


@pytest.fixture
def temp_cookies_file(temp_data_dir):
    """Provides a temporary cookies file path."""
    return temp_data_dir / "tr_cookies.txt"


# === Protocol Test Fixtures ===


@pytest.fixture
def valid_protocol_methods():
    """List of valid TR daemon methods."""
    return [
        "login",
        "logout",
        "confirm_2fa",
        "fetch_portfolio",
        "get_status",
        "shutdown",
    ]


@pytest.fixture
def sample_login_params():
    """Sample login parameters."""
    return {"phone": "+491234567890", "pin": "1234"}


@pytest.fixture
def sample_2fa_params():
    """Sample 2FA parameters."""
    return {"token": "5678"}
