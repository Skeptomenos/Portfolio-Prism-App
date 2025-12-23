"""Tests for headless/handlers/telemetry.py - Telemetry and logging handlers."""

import pytest
from unittest.mock import patch, MagicMock

from portfolio_src.headless.handlers.telemetry import (
    handle_log_event,
    handle_get_recent_reports,
    handle_get_pending_reviews,
)


class TestHandleLogEvent:
    """Tests for handle_log_event()."""

    @pytest.mark.asyncio
    async def test_returns_success(self):
        """Returns success response."""
        # Patch at the source module
        with patch("portfolio_src.data.database.log_system_event") as mock_log:
            with patch(
                "portfolio_src.headless.handlers.telemetry.get_session_id",
                return_value="test-session",
            ):
                result = await handle_log_event(
                    1, {"level": "INFO", "message": "Test message"}
                )

        assert result["status"] == "success"
        assert result["data"] is True

    @pytest.mark.asyncio
    async def test_calls_log_system_event_with_params(self):
        """Calls log_system_event with correct parameters."""
        with patch("portfolio_src.data.database.log_system_event") as mock_log:
            with patch(
                "portfolio_src.headless.handlers.telemetry.get_session_id",
                return_value="test-session",
            ):
                await handle_log_event(
                    1,
                    {
                        "level": "ERROR",
                        "message": "Something went wrong",
                        "context": {"page": "dashboard"},
                        "component": "chart",
                        "category": "render",
                    },
                )

        mock_log.assert_called_once_with(
            session_id="test-session",
            level="ERROR",
            source="frontend",
            message="Something went wrong",
            context={"page": "dashboard"},
            component="chart",
            category="render",
        )

    @pytest.mark.asyncio
    async def test_uses_defaults_for_missing_params(self):
        """Uses default values for missing parameters."""
        with patch("portfolio_src.data.database.log_system_event") as mock_log:
            with patch(
                "portfolio_src.headless.handlers.telemetry.get_session_id",
                return_value="test-session",
            ):
                await handle_log_event(1, {})

        mock_log.assert_called_once_with(
            session_id="test-session",
            level="INFO",
            source="frontend",
            message="",
            context={},
            component="ui",
            category="general",
        )


class TestHandleGetRecentReports:
    """Tests for handle_get_recent_reports()."""

    @pytest.mark.asyncio
    async def test_returns_success_with_reports(self):
        """Returns success response with reports list."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cursor

        with patch(
            "portfolio_src.data.database.get_connection",
            return_value=mock_conn,
        ):
            result = await handle_get_recent_reports(1, {})

        assert result["status"] == "success"
        assert isinstance(result["data"], list)

    @pytest.mark.asyncio
    async def test_queries_processed_errors(self):
        """Queries for processed ERROR and CRITICAL logs."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cursor

        with patch(
            "portfolio_src.data.database.get_connection",
            return_value=mock_conn,
        ):
            await handle_get_recent_reports(1, {})

        # Verify the SQL query
        call_args = mock_conn.execute.call_args[0][0]
        assert "processed = 1" in call_args
        assert "ERROR" in call_args
        assert "CRITICAL" in call_args
        assert "LIMIT 20" in call_args

    @pytest.mark.asyncio
    async def test_returns_empty_list_when_no_reports(self):
        """Returns empty list when no reports exist."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cursor

        with patch(
            "portfolio_src.data.database.get_connection",
            return_value=mock_conn,
        ):
            result = await handle_get_recent_reports(1, {})

        assert result["status"] == "success"
        assert result["data"] == []


class TestHandleGetPendingReviews:
    """Tests for handle_get_pending_reviews()."""

    @pytest.mark.asyncio
    async def test_returns_success_with_pending(self):
        """Returns success response with pending reviews."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cursor

        with patch(
            "portfolio_src.data.database.get_connection",
            return_value=mock_conn,
        ):
            result = await handle_get_pending_reviews(1, {})

        assert result["status"] == "success"
        assert isinstance(result["data"], list)

    @pytest.mark.asyncio
    async def test_queries_unprocessed_errors(self):
        """Queries for unprocessed ERROR and CRITICAL logs."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cursor

        with patch(
            "portfolio_src.data.database.get_connection",
            return_value=mock_conn,
        ):
            await handle_get_pending_reviews(1, {})

        # Verify the SQL query
        call_args = mock_conn.execute.call_args[0][0]
        assert "processed = 0" in call_args
        assert "ERROR" in call_args
        assert "CRITICAL" in call_args

    @pytest.mark.asyncio
    async def test_orders_by_timestamp_desc(self):
        """Orders results by timestamp descending."""
        mock_cursor = MagicMock()
        mock_cursor.fetchall.return_value = []

        mock_conn = MagicMock()
        mock_conn.execute.return_value = mock_cursor

        with patch(
            "portfolio_src.data.database.get_connection",
            return_value=mock_conn,
        ):
            await handle_get_pending_reviews(1, {})

        call_args = mock_conn.execute.call_args[0][0]
        assert "ORDER BY timestamp DESC" in call_args
