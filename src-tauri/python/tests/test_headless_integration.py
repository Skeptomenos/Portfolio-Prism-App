import sys
import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path

# Add src-tauri/python to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Import the module under test
# We refrain from importing handle_sync_portfolio directly until we patched dependencies if needed,
# but since we patch via decorators, standard import is fine.
import prism_headless


class TestHeadlessIntegration:
    """Integration verification between Headless Engine and Pipeline."""

    @patch("portfolio_src.headless.state.get_bridge")
    @patch("portfolio_src.headless.state.get_auth_manager")
    @patch("portfolio_src.data.database.sync_positions_from_tr")
    @patch("portfolio_src.data.database.update_sync_state")
    @patch("portfolio_src.headless.handlers.sync.emit_progress")
    def test_sync_portfolio_does_not_trigger_pipeline(
        self,
        mock_emit_progress,
        mock_update_state,
        mock_sync_db,
        mock_get_auth_manager,
        mock_get_bridge,
    ):
        """Verify that sync_portfolio does NOT trigger Pipeline (decoupled)."""
        from portfolio_src.headless.handlers.sync import handle_sync_portfolio

        mock_bridge = MagicMock()
        mock_bridge.get_status.return_value = {"status": "authenticated"}
        mock_get_bridge.return_value = mock_bridge

        mock_sync_db.return_value = {
            "synced_positions": 10,
            "new_positions": 1,
            "updated_positions": 9,
            "total_value": 1000.0,
        }

        with patch("portfolio_src.data.tr_sync.TRDataFetcher") as mock_fetcher_cls:
            mock_fetcher = MagicMock()
            mock_fetcher.fetch_portfolio_sync.return_value = [
                {
                    "isin": "US0378331005",
                    "name": "Apple Inc.",
                    "quantity": 10,
                    "avg_cost": 150.0,
                    "current_price": 170.0,
                }
            ]
            mock_fetcher_cls.return_value = mock_fetcher

            with patch("portfolio_src.core.pipeline.Pipeline") as mock_pipeline_cls:
                import asyncio

                payload = {"portfolioId": 1, "force": True}
                response = asyncio.run(handle_sync_portfolio(123, payload))

                assert response["status"] == "success"
                assert response["data"]["syncedPositions"] == 10

                mock_pipeline_cls.assert_not_called()
