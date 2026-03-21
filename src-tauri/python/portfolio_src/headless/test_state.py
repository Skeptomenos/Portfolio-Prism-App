"""Tests for headless/state.py - Singleton state managers."""

import pytest
from unittest.mock import patch, MagicMock
from concurrent.futures import ThreadPoolExecutor

from portfolio_src.headless.state import (
    get_auth_manager,
    get_bridge,
    get_executor,
    reset_state,
)


class TestGetExecutor:
    """Tests for get_executor()."""

    def test_returns_thread_pool_executor(self):
        """Returns a ThreadPoolExecutor instance."""
        executor = get_executor()

        assert isinstance(executor, ThreadPoolExecutor)

    def test_returns_same_instance(self):
        """Returns the same executor on multiple calls."""
        executor1 = get_executor()
        executor2 = get_executor()

        assert executor1 is executor2

    def test_executor_has_bridge_thread_prefix(self):
        """Executor threads are named with 'bridge' prefix."""
        executor = get_executor()

        # Submit a task to verify thread naming
        import threading

        thread_name = None

        def capture_thread_name():
            nonlocal thread_name
            thread_name = threading.current_thread().name

        future = executor.submit(capture_thread_name)
        future.result()

        assert thread_name is not None
        assert "bridge" in thread_name


class TestGetAuthManager:
    """Tests for get_auth_manager()."""

    def test_returns_auth_manager_instance(self):
        """Returns a TRAuthManager instance."""
        # Patch at the source module where TRAuthManager is defined
        with patch("portfolio_src.core.tr_auth.TRAuthManager") as MockAuthManager:
            # Reset state to force new instance
            reset_state()

            mock_instance = MagicMock()
            MockAuthManager.return_value = mock_instance

            result = get_auth_manager()

            assert result is mock_instance
            MockAuthManager.assert_called_once()

    def test_returns_same_instance_on_multiple_calls(self):
        """Singleton pattern - returns same instance."""
        with patch("portfolio_src.core.tr_auth.TRAuthManager") as MockAuthManager:
            reset_state()

            mock_instance = MagicMock()
            MockAuthManager.return_value = mock_instance

            result1 = get_auth_manager()
            result2 = get_auth_manager()

            assert result1 is result2
            # Should only be called once due to singleton
            MockAuthManager.assert_called_once()


class TestGetBridge:
    """Tests for get_bridge()."""

    def test_returns_bridge_instance(self):
        """Returns a TRBridge instance."""
        with patch("portfolio_src.core.tr_bridge.TRBridge") as MockBridge:
            reset_state()

            mock_instance = MagicMock()
            MockBridge.get_instance.return_value = mock_instance

            result = get_bridge()

            assert result is mock_instance
            MockBridge.get_instance.assert_called_once()

    def test_returns_same_instance_on_multiple_calls(self):
        """Singleton pattern - returns same instance."""
        with patch("portfolio_src.core.tr_bridge.TRBridge") as MockBridge:
            reset_state()

            mock_instance = MagicMock()
            MockBridge.get_instance.return_value = mock_instance

            result1 = get_bridge()
            result2 = get_bridge()

            assert result1 is result2
            MockBridge.get_instance.assert_called_once()


class TestResetState:
    """Tests for reset_state()."""

    def test_resets_auth_manager(self):
        """After reset, get_auth_manager creates new instance."""
        with patch("portfolio_src.core.tr_auth.TRAuthManager") as MockAuthManager:
            reset_state()

            mock1 = MagicMock()
            mock2 = MagicMock()
            MockAuthManager.side_effect = [mock1, mock2]

            result1 = get_auth_manager()
            reset_state()
            result2 = get_auth_manager()

            # Should be different instances after reset
            assert result1 is mock1
            assert result2 is mock2
            assert MockAuthManager.call_count == 2

    def test_resets_bridge(self):
        """After reset, get_bridge creates new instance."""
        with patch("portfolio_src.core.tr_bridge.TRBridge") as MockBridge:
            reset_state()

            mock1 = MagicMock()
            mock2 = MagicMock()
            MockBridge.get_instance.side_effect = [mock1, mock2]

            result1 = get_bridge()
            reset_state()
            result2 = get_bridge()

            assert result1 is mock1
            assert result2 is mock2
            assert MockBridge.get_instance.call_count == 2

    def test_does_not_reset_executor(self):
        """Executor is not reset (it's pre-initialized)."""
        executor_before = get_executor()
        reset_state()
        executor_after = get_executor()

        # Executor should be the same - it's not reset
        assert executor_before is executor_after
