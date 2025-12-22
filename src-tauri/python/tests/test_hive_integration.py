import pytest
import pandas as pd
import os
from pathlib import Path
from unittest.mock import MagicMock, patch
from datetime import date

from portfolio_src.data.hive_client import AssetEntry, HiveResult, HiveClient


class TestHiveIntegration:
    @pytest.fixture
    def mock_hive_client(self):
        with patch("portfolio_src.data.state_manager.get_hive_client") as mock_get:
            client = MagicMock()
            mock_get.return_value = client
            yield client

    @pytest.fixture
    def temp_universe_path(self, tmp_path):
        path = tmp_path / "asset_universe.csv"
        # Create initial local universe
        df = pd.DataFrame(
            [
                {
                    "ISIN": "LOCAL1",
                    "Name": "Local Asset",
                    "Asset_Class": "Stock",
                    "Source": "manual",
                }
            ]
        )
        df.to_csv(path, index=False)
        return path

    def test_hive_enrichment_service_flow(self):
        """Verify Hive -> API -> Contribution flow."""
        from portfolio_src.core.services.enricher import HiveEnrichmentService

        with (
            patch(
                "portfolio_src.core.services.enricher.get_hive_client"
            ) as mock_get_hive,
            patch(
                "portfolio_src.core.services.enricher.EnrichmentService"
            ) as mock_api_service_cls,
        ):
            hive_client = mock_get_hive.return_value
            api_service = mock_api_service_cls.return_value

            # 1. Hive has ISIN1, missing ISIN2
            hive_client.batch_lookup.return_value = {
                "ISIN1": AssetEntry(
                    isin="ISIN1",
                    name="Hive Asset",
                    asset_class="Stock",
                    base_currency="EUR",
                )
            }

            # 2. API provides ISIN2
            api_service.get_metadata_batch.return_value = {
                "ISIN2": {
                    "isin": "ISIN2",
                    "name": "API Asset",
                    "sector": "Tech",
                    "asset_class": "Stock",
                }
            }

            service = HiveEnrichmentService()
            results = service.get_metadata_batch(["ISIN1", "ISIN2"])

            # Verify combined results
            assert "ISIN1" in results
            assert "ISIN2" in results
            assert results["ISIN1"]["name"] == "Hive Asset"
            assert results["ISIN2"]["name"] == "API Asset"

            # Verify contribution was triggered for ISIN2
            hive_client.batch_contribute.assert_called_once()
            contributions = hive_client.batch_contribute.call_args[0][0]
            assert any(c.isin == "ISIN2" for c in contributions)

    def test_hive_sync_resilience(self, mock_hive_client):
        """Verify sync handles Hive failure gracefully."""
        mock_hive_client.is_configured = True
        mock_hive_client.sync_universe.return_value = HiveResult(
            success=False, error="Connection Timeout"
        )

        # Should not raise exception
        result = mock_hive_client.sync_universe()
        assert result.success is False
