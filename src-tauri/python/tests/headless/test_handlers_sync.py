"""Tests for headless/handlers/sync.py - Sync and pipeline handlers."""

import json
from unittest.mock import MagicMock, patch

import pytest

from portfolio_src.headless.handlers.sync import (
    emit_progress,
    handle_run_pipeline,
    handle_sync_portfolio,
)


class TestEmitProgress:
    """Tests for emit_progress()."""

    def test_emits_json_to_stdout(self, capsys):
        """Emits JSON-formatted progress event to stdout."""
        emit_progress(50, "Halfway there")

        captured = capsys.readouterr()
        output = json.loads(captured.out.strip())

        assert output["event"] == "sync_progress"
        assert output["data"]["progress"] == 50
        assert output["data"]["message"] == "Halfway there"

    def test_progress_zero(self, capsys):
        """Handles 0% progress."""
        emit_progress(0, "Starting")

        captured = capsys.readouterr()
        output = json.loads(captured.out.strip())

        assert output["data"]["progress"] == 0

    def test_progress_hundred(self, capsys):
        """Handles 100% progress."""
        emit_progress(100, "Complete")

        captured = capsys.readouterr()
        output = json.loads(captured.out.strip())

        assert output["data"]["progress"] == 100

    def test_empty_message(self, capsys):
        """Handles empty message."""
        emit_progress(25, "")

        captured = capsys.readouterr()
        output = json.loads(captured.out.strip())

        assert output["data"]["message"] == ""


class TestHandleRunPipeline:
    """Tests for handle_run_pipeline()."""

    @pytest.mark.asyncio
    async def test_returns_success_on_successful_pipeline(self):
        """Returns success response when pipeline succeeds."""
        mock_result = MagicMock()
        mock_result.success = True
        mock_result.errors = []

        mock_pipeline = MagicMock()
        mock_pipeline.run.return_value = mock_result

        # Patch at the source module
        with patch(
            "portfolio_src.core.pipeline.Pipeline",
            return_value=mock_pipeline,
        ):
            with patch("portfolio_src.headless.handlers.sync.emit_progress"):
                result = await handle_run_pipeline(1, {})

        assert result["status"] == "success"
        assert result["data"]["success"] is True
        assert result["data"]["errors"] == []
        assert "durationMs" in result["data"]

    @pytest.mark.asyncio
    async def test_returns_success_with_errors_on_partial_failure(self):
        """Returns success with errors list when pipeline has warnings."""
        mock_result = MagicMock()
        mock_result.success = False
        mock_result.errors = [Exception("Warning 1"), Exception("Warning 2")]

        mock_pipeline = MagicMock()
        mock_pipeline.run.return_value = mock_result

        with patch(
            "portfolio_src.core.pipeline.Pipeline",
            return_value=mock_pipeline,
        ):
            with patch("portfolio_src.headless.handlers.sync.emit_progress"):
                result = await handle_run_pipeline(1, {})

        assert result["status"] == "success"
        assert result["data"]["success"] is False
        assert len(result["data"]["errors"]) == 2

    @pytest.mark.asyncio
    async def test_returns_error_on_exception(self):
        """Returns error response when pipeline throws."""
        with patch(
            "portfolio_src.core.pipeline.Pipeline",
            side_effect=Exception("Pipeline crashed"),
        ):
            with patch("portfolio_src.headless.handlers.sync.emit_progress"):
                result = await handle_run_pipeline(1, {})

        assert result["status"] == "error"
        assert result["error"]["code"] == "PIPELINE_ERROR"
        assert "Pipeline crashed" in result["error"]["message"]

    @pytest.mark.asyncio
    async def test_emits_progress_events(self):
        """Emits progress events during pipeline run."""
        mock_result = MagicMock()
        mock_result.success = True
        mock_result.errors = []

        mock_pipeline = MagicMock()
        mock_pipeline.run.return_value = mock_result

        with patch(
            "portfolio_src.core.pipeline.Pipeline",
            return_value=mock_pipeline,
        ):
            with patch("portfolio_src.headless.handlers.sync.emit_progress") as mock_emit:
                await handle_run_pipeline(1, {})

                # Should emit at least start and end progress
                assert mock_emit.call_count >= 2


class TestHandleSyncPortfolio:
    """Tests for handle_sync_portfolio()."""

    @pytest.mark.asyncio
    async def test_returns_error_when_not_authenticated(self):
        """Returns error when TR is not authenticated."""
        from portfolio_src.core.services.sync_service import AuthenticationError

        mock_service = MagicMock()
        mock_service.sync_portfolio.side_effect = AuthenticationError(
            "Please authenticate with Trade Republic first"
        )

        with patch(
            "portfolio_src.headless.handlers.sync.get_sync_service",
            return_value=mock_service,
        ):
            with patch("portfolio_src.headless.handlers.sync.emit_progress"):
                result = await handle_sync_portfolio(1, {})

        assert result["status"] == "error"
        assert result["error"]["code"] == "TR_AUTH_REQUIRED"

    @pytest.mark.asyncio
    async def test_uses_default_portfolio_id(self):
        """Uses portfolio ID 1 by default."""
        from portfolio_src.models.sync import PortfolioSyncResult

        mock_service = MagicMock()
        mock_service.sync_portfolio.return_value = PortfolioSyncResult(
            synced_positions=0,
            new_positions=0,
            updated_positions=0,
            total_value=0,
            duration_ms=100,
        )

        with patch(
            "portfolio_src.headless.handlers.sync.get_sync_service",
            return_value=mock_service,
        ):
            with patch("portfolio_src.headless.handlers.sync.emit_progress"):
                await handle_sync_portfolio(1, {})

                mock_service.sync_portfolio.assert_called_once()
                call_kwargs = mock_service.sync_portfolio.call_args[1]
                assert call_kwargs["portfolio_id"] == 1

    @pytest.mark.asyncio
    async def test_returns_sync_statistics(self):
        """Returns sync statistics on success."""
        from portfolio_src.models.sync import PortfolioSyncResult

        mock_service = MagicMock()
        mock_service.sync_portfolio.return_value = PortfolioSyncResult(
            synced_positions=1,
            new_positions=1,
            updated_positions=0,
            total_value=1100.0,
            duration_ms=150,
        )

        with patch(
            "portfolio_src.headless.handlers.sync.get_sync_service",
            return_value=mock_service,
        ):
            with patch("portfolio_src.headless.handlers.sync.emit_progress"):
                result = await handle_sync_portfolio(1, {})

        assert result["status"] == "success"
        assert result["data"]["syncedPositions"] == 1
        assert result["data"]["newPositions"] == 1
        assert result["data"]["totalValue"] == 1100.0
        assert "durationMs" in result["data"]
