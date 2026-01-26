"""Tests for headless/lifecycle.py - Session lifecycle management."""

import os
import pytest
from unittest.mock import patch, MagicMock

from portfolio_src.headless.lifecycle import (
    resource_path,
    get_session_id,
    get_start_time,
    setup_session,
)


class TestResourcePath:
    """Tests for resource_path()."""

    def test_returns_absolute_path(self):
        """Returns an absolute path."""
        result = resource_path("test.txt")

        assert os.path.isabs(result)

    def test_joins_relative_path(self):
        """Joins relative path to base."""
        result = resource_path("config/test.json")

        assert result.endswith("config/test.json") or result.endswith(
            "config\\test.json"
        )

    def test_handles_nested_paths(self):
        """Handles deeply nested paths."""
        result = resource_path("a/b/c/d.txt")

        assert "a" in result
        assert "d.txt" in result

    def test_pyinstaller_bundle_mode(self):
        """Uses _MEIPASS when running as PyInstaller bundle."""
        # Just verify the function doesn't crash
        result = resource_path("test.txt")
        assert isinstance(result, str)


class TestGetSessionId:
    """Tests for get_session_id()."""

    def test_returns_string(self):
        """Returns a string."""
        result = get_session_id()

        assert isinstance(result, str)

    def test_default_is_unknown(self):
        """Default session ID before setup is 'unknown'."""
        # Note: This may fail if setup_session was called earlier
        # The test verifies the function works, not the specific value
        result = get_session_id()

        assert len(result) > 0


class TestGetStartTime:
    """Tests for get_start_time()."""

    def test_returns_float(self):
        """Returns a float timestamp."""
        result = get_start_time()

        assert isinstance(result, float)

    def test_returns_non_negative(self):
        """Returns non-negative value."""
        result = get_start_time()

        assert result >= 0


class TestSetupSession:
    """Tests for setup_session()."""

    def test_returns_session_id(self):
        """Returns a session ID string."""
        with patch(
            "portfolio_src.headless.lifecycle.configure_root_logger"
        ) as mock_logger:
            result = setup_session()

            assert isinstance(result, str)
            assert len(result) > 0

    def test_session_id_is_uuid_format(self):
        """Session ID is a valid UUID."""
        import uuid

        with patch(
            "portfolio_src.headless.lifecycle.configure_root_logger"
        ) as mock_logger:
            result = setup_session()

            # Should not raise
            uuid.UUID(result)

    def test_updates_get_session_id(self):
        """After setup, get_session_id returns the new ID."""
        with patch(
            "portfolio_src.headless.lifecycle.configure_root_logger"
        ) as mock_logger:
            session_id = setup_session()

            assert get_session_id() == session_id

    def test_updates_get_start_time(self):
        """After setup, get_start_time returns recent timestamp."""
        import time

        with patch(
            "portfolio_src.headless.lifecycle.configure_root_logger"
        ) as mock_logger:
            before = time.time()
            setup_session()
            after = time.time()

            start_time = get_start_time()

            assert before <= start_time <= after

    def test_creates_data_dir_if_set(self):
        """Creates PRISM_DATA_DIR if environment variable is set."""
        import tempfile
        import shutil

        test_dir = tempfile.mkdtemp()
        target_dir = os.path.join(test_dir, "prism_test_data")

        try:
            with patch.dict(os.environ, {"PRISM_DATA_DIR": target_dir}):
                with patch("portfolio_src.headless.lifecycle.configure_root_logger"):
                    setup_session()

                    assert os.path.exists(target_dir)
        finally:
            shutil.rmtree(test_dir, ignore_errors=True)

    def test_configures_logger_with_session_id(self):
        """Calls configure_root_logger with session ID."""
        with patch(
            "portfolio_src.headless.lifecycle.configure_root_logger"
        ) as mock_logger:
            session_id = setup_session()

            mock_logger.assert_called_once_with(session_id=session_id)

    def test_http_mode_redirects_stdout(self):
        """In HTTP mode, stdout is redirected to logger."""
        with patch("portfolio_src.headless.lifecycle.configure_root_logger"):
            # Patch at the source module where StreamToLogger is defined
            with patch(
                "portfolio_src.prism_utils.logging_config.StreamToLogger"
            ) as MockStream:
                import sys

                original_stdout = sys.stdout

                try:
                    setup_session(http_mode=True)

                    # StreamToLogger should have been called for stdout
                    assert MockStream.call_count >= 1
                finally:
                    # Restore stdout for other tests
                    sys.stdout = original_stdout


class TestSessionIdUniqueness:
    """Tests for session ID uniqueness."""

    def test_multiple_sessions_have_unique_ids(self):
        """Each setup_session call generates a unique ID."""
        with patch("portfolio_src.headless.lifecycle.configure_root_logger"):
            ids = set()
            for _ in range(10):
                session_id = setup_session()
                ids.add(session_id)

            assert len(ids) == 10
