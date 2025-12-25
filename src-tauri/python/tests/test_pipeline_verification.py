import pytest
import pandas as pd
import os
from pathlib import Path
from typing import cast, Any
from portfolio_src.core.pipeline import Pipeline
from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.core.services.enricher import Enricher
from portfolio_src.core.services.aggregator import Aggregator

# Fixture Paths
FIXTURES_DIR = Path(__file__).parent / "fixtures"
MOCK_PORTFOLIO = FIXTURES_DIR / "mock_portfolio.csv"
MOCK_ETF_DIR = FIXTURES_DIR / "mock_etf_holdings"


class TestPipelineVerification:
    @pytest.fixture
    def mock_decomposer(self, monkeypatch):
        """Mock decomposer that reads from local CSVs instead of API."""

        def mock_get_holdings(self, isin):
            file_path = MOCK_ETF_DIR / f"{isin}.csv"
            if file_path.exists():
                return pd.read_csv(file_path), []
            return pd.DataFrame(), []

        monkeypatch.setattr(Decomposer, "_get_holdings", mock_get_holdings)
        return Decomposer(None, None)

    @pytest.fixture
    def mock_enricher(self, monkeypatch):
        """Mock enricher to avoid API calls."""

        def mock_enrich_batch(self, holdings_map, progress_callback=None):
            enriched = {}
            errors = []

            # Enrich direct Apple holding
            if "US0378331005" in holdings_map:
                df = holdings_map["US0378331005"]
                df["sector"] = "Technology"
                df["geography"] = "United States"
                enriched["US0378331005"] = df

            # Passthrough others
            for k, v in holdings_map.items():
                if k != "US0378331005":
                    enriched[k] = v

            return enriched, errors

        monkeypatch.setattr(Enricher, "enrich", mock_enrich_batch)
        return Enricher()

    def test_decomposition(self, mock_decomposer):
        """Verify ETF is decomposed into holdings."""
        # Create a DF representing the ETF position
        etf_pos = pd.DataFrame(
            [
                {
                    "isin": "IE00BK5BQT80",
                    "quantity": 20,
                    "current_price": 110.0,
                    "value": 2200.0,
                }
            ]
        )

        holdings_map, errors = mock_decomposer.decompose(etf_pos)

        assert "IE00BK5BQT80" in holdings_map
        holdings = holdings_map["IE00BK5BQT80"]
        assert not holdings.empty
        # Check specific holding from fixture
        assert "Microsoft Corp" in holdings["name"].values
        assert len(errors) == 0

    def test_aggregation_math(self, mock_decomposer, mock_enricher):
        """Verify aggregation calculations are correct."""
        # Setup Aggregator
        aggregator = Aggregator()

        # Load Mock Portfolio loaded as DFs
        portfolio_df = pd.read_csv(MOCK_PORTFOLIO)
        portfolio_df["value"] = portfolio_df["quantity"] * portfolio_df["current_price"]

        direct_pos = portfolio_df[portfolio_df["isin"] == "US0378331005"]  # AAPL
        etf_pos = portfolio_df[portfolio_df["isin"] == "IE00BK5BQT80"]  # VWCE

        # 1. Decompose
        holdings_map, _ = mock_decomposer.decompose(etf_pos)

        # 2. Enrich
        # For this test, manually ensure the decomposed DF has sector/geo
        # (our fixture already has them)
        # We need to enrich the DIRECT Apple position though
        enrichment_map = holdings_map.copy()
        enrichment_map["US0378331005"] = pd.DataFrame(
            [
                {
                    "isin": "US0378331005",
                    "name": "Apple Inc",
                    "weight": 100.0,
                    "sector": "Technology",
                    "geography": "United States",
                }
            ]
        )

        # 3. Aggregate
        exposure_df, errors = aggregator.aggregate(
            cast(pd.DataFrame, direct_pos), cast(pd.DataFrame, etf_pos), enrichment_map
        )

        assert not exposure_df.empty

        # Verify Total Value
        # AAPL: 10 * 175 = 1750
        # VWCE: 20 * 110 = 2200
        # Total: 3950
        total_value = direct_pos["value"].sum() + etf_pos["value"].sum()
        assert total_value == 3950.0

        # Verify Sector Allocation
        # AAPL (Direct): 1750 (Technology)
        # VWCE (ETF):
        #   Microsoft (4.5% of 2200) = 99
        #   Apple (4.0% of 2200) = 88
        #   SAP (0.4% of 2200) = 8.8
        #   Total Tech inside ETF = 195.8
        # Total Tech = 1750 + 195.8 = 1945.8

        tech_sector = exposure_df[exposure_df["sector"] == "Technology"]
        assert not tech_sector.empty

        # Check if Apple exposure combines Direct + ETF
        apple_row = exposure_df[exposure_df["isin"] == "US0378331005"]
        # Expected value: 1750 (Direct) + 88 (ETF) = 1838
        assert not apple_row.empty
        val = apple_row.iloc[0]["total_exposure"]
        assert abs(val - 1838.0) < 1.0  # Tolerance for rounding

    def test_full_pipeline_orchestration(
        self, monkeypatch, mock_decomposer, mock_enricher, tmp_path
    ):
        """Verify the full Pipeline.run() method works end-to-end."""

        # Mock load_portfolio to return our fixtures
        def mock_load(self):
            df = pd.read_csv(MOCK_PORTFOLIO)
            df["value"] = df["quantity"] * df["current_price"]
            direct = df[df["isin"] == "US0378331005"]
            etf = df[df["isin"] == "IE00BK5BQT80"]
            return direct, etf

        monkeypatch.setattr(Pipeline, "_load_portfolio", mock_load)

        # Mock services in Pipeline
        pipeline = Pipeline()
        pipeline._decomposer = mock_decomposer
        pipeline._enricher = mock_enricher
        pipeline._aggregator = Aggregator()

        # Override output path to output/TRUE_EXPOSURE_REPORT.csv

        result = pipeline.run()

        assert result.success
        assert len(result.errors) == 0
        assert result.total_value == 3950.0
