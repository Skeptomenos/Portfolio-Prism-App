import pytest
import pandas as pd
import math
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Add paths for package resolution
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "portfolio_src"))

from portfolio_src.data.hive_client import AssetEntry
from portfolio_src.core.services.aggregator import Aggregator
from portfolio_src.core.pipeline import PipelineMonitor


class TestConfidenceScoring:
    def test_calculate_confidence_basic(self):
        """Test confidence calculation with various factors."""
        # 1. High confidence: Verified, many contributors, fresh
        asset = AssetEntry(
            isin="US0378331005",
            name="Apple",
            asset_class="Stock",
            base_currency="USD",
            enrichment_status="verified",
            contributor_count=100,
            last_updated=datetime.now().isoformat(),
        )
        score = asset.calculate_confidence()
        # contrib (0.4) + freshness (0.3) + status (0.3) = 1.0
        assert score == 1.0

        # 2. Low confidence: Stub, 1 contributor, old
        old_date = (datetime.now() - timedelta(days=200)).isoformat()
        asset = AssetEntry(
            isin="DE000BASF111",
            name="BASF",
            asset_class="Stock",
            base_currency="EUR",
            enrichment_status="stub",
            contributor_count=1,
            last_updated=old_date,
        )
        score = asset.calculate_confidence()
        # contrib (0.1) + freshness (0.0) + status (0.1) = 0.2
        assert score == 0.2

    def test_confidence_log_scaling(self):
        """Verify contributor count scales logarithmically."""
        asset1 = AssetEntry(
            isin="1", name="A", asset_class="S", base_currency="E", contributor_count=1
        )
        asset2 = AssetEntry(
            isin="2", name="B", asset_class="S", base_currency="E", contributor_count=10
        )

        # Freshness and status are same (0.0 and 0.1)
        assert asset1.calculate_confidence() == 0.2  # 0.1 + 0 + 0.1
        assert asset2.calculate_confidence() == 0.5  # 0.4 + 0 + 0.1


class TestVectorizedAggregator:
    @pytest.fixture
    def aggregator(self):
        return Aggregator()

    def test_aggregate_vectorization_math(self, aggregator):
        """Verify math works correctly with vectorized operations."""
        direct = pd.DataFrame(
            [
                {
                    "isin": "S1",
                    "name": "Stock 1",
                    "market_value": 1000.0,
                    "sector": "Tech",
                },
                {
                    "isin": "S2",
                    "name": "Stock 2",
                    "market_value": 2000.0,
                    "sector": "Finance",
                },
            ]
        )

        etf = pd.DataFrame([{"isin": "E1", "name": "ETF 1", "market_value": 1000.0}])

        holdings = {
            "E1": pd.DataFrame(
                [
                    {"isin": "S1", "name": "Stock 1", "weight": 50.0, "sector": "Tech"},
                    {
                        "isin": "S3",
                        "name": "Stock 3",
                        "weight": 50.0,
                        "sector": "Energy",
                    },
                ]
            )
        }

        agg_df, errors = aggregator.aggregate(direct, etf, holdings)

        assert not errors
        # S1: 1000 (direct) + 500 (from E1) = 1500
        # S2: 2000 (direct) = 2000
        # S3: 500 (from E1) = 500

        s1_row = agg_df[agg_df["isin"] == "S1"].iloc[0]
        assert s1_row["total_exposure"] == 1500.0

        s3_row = agg_df[agg_df["isin"] == "S3"].iloc[0]
        assert s3_row["total_exposure"] == 500.0

        # Total portfolio value = 1000 + 2000 + 1000 = 4000
        assert s1_row["portfolio_percentage"] == (1500 / 4000) * 100


class TestPipelineMonitor:
    def test_monitor_metrics(self):
        monitor = PipelineMonitor()

        monitor.record_enrichment("ISIN1", "hive")
        monitor.record_enrichment("ISIN2", "hive")
        monitor.record_enrichment("ISIN3", "api")
        monitor.record_enrichment("ISIN4", "unknown")

        metrics = monitor.get_metrics()

        assert metrics["total_assets_processed"] == 4
        assert metrics["hive_hit_rate"] == 50.0  # 2/4
        assert metrics["api_fallback_rate"] == 50.0  # 2/4 (api + unknown)
        assert "execution_time_seconds" in metrics
        assert "phase_durations" in metrics
        assert metrics["hive_hits_count"] == 2
        assert metrics["contributions_count"] == 0

    def test_monitor_contributions(self):
        monitor = PipelineMonitor()

        monitor.record_contribution("ISIN1")
        monitor.record_contribution("ISIN2")

        hive_log = monitor.get_hive_log()
        assert len(hive_log["contributions"]) == 2
        assert "ISIN1" in hive_log["contributions"]
