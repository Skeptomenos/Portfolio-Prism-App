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

    @patch("prism_headless.get_bridge")
    @patch("portfolio_src.core.pipeline.Pipeline")  # Patch where it is imported/used
    @patch("portfolio_src.data.database.sync_positions_from_tr")
    @patch("portfolio_src.data.database.update_sync_state")
    @patch("prism_headless.emit_progress")
    def test_sync_portfolio_triggers_pipeline(
        self,
        mock_emit_progress,
        mock_update_state,
        mock_sync_db,
        mock_pipeline_cls,
        mock_get_bridge,
    ):
        """Verify that sync_portfolio command triggers Pipeline.run()."""

        # Setup Mocks
        mock_bridge = MagicMock()
        mock_bridge.get_status.return_value = {"status": "authenticated"}
        mock_get_bridge.return_value = mock_bridge

        mock_pipeline_instance = MagicMock()
        mock_pipeline_cls.return_value = mock_pipeline_instance

        mock_sync_db.return_value = {
            "synced_positions": 10,
            "new_positions": 1,
            "updated_positions": 9,
            "total_value": 1000.0,
        }

        # Mock TRDataFetcher to return some dummy data so logic proceeds
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

            # Execute
            payload = {"portfolioId": 1, "force": True}

            import asyncio

            response = asyncio.run(prism_headless.handle_sync_portfolio(123, payload))

            # Assertions
            assert response["status"] == "success"

            # VERIFY PIPELINE TRIGGER
            # This is expected to FAIL until we wire it up
            mock_pipeline_cls.assert_called_once()
            mock_pipeline_instance.run.assert_called_once()
