"""
Phase 4 Tests: Per-Holding Provenance.

Tests for resolution_source and resolution_confidence columns.
"""

import pytest
import pandas as pd
from unittest.mock import patch, MagicMock

from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.core.aggregation.enrichment import enrich_etf_holdings
from portfolio_src.data.resolution import (
    ISINResolver,
    ResolutionResult,
    CONFIDENCE_PROVIDER,
    CONFIDENCE_LOCAL_CACHE,
    CONFIDENCE_HIVE,
    CONFIDENCE_WIKIDATA,
    CONFIDENCE_FINNHUB,
    CONFIDENCE_YFINANCE,
)


class TestDecomposerProvenance:
    """Test provenance storage in Decomposer._resolve_holdings_isins()."""

    def test_provenance_columns_created(self):
        """Holdings should have resolution_source and resolution_confidence columns."""
        holdings = pd.DataFrame(
            {
                "ticker": ["NVDA", "AAPL"],
                "name": ["NVIDIA", "Apple"],
                "weight": [5.0, 3.0],
            }
        )

        mock_resolver = MagicMock(spec=ISINResolver)
        mock_resolver.resolve.return_value = ResolutionResult(
            isin="US67066G1040",
            status="resolved",
            detail="api_finnhub",
            source="api_finnhub",
            confidence=0.75,
        )

        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )

        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")

        assert "resolution_source" in result.columns
        assert "resolution_confidence" in result.columns

    def test_resolved_holding_has_provenance(self):
        """Resolved holdings should have source and confidence stored."""
        holdings = pd.DataFrame(
            {
                "ticker": ["NVDA"],
                "name": ["NVIDIA"],
                "weight": [5.0],
            }
        )

        mock_resolver = MagicMock(spec=ISINResolver)
        mock_resolver.resolve.return_value = ResolutionResult(
            isin="US67066G1040",
            status="resolved",
            detail="api_finnhub",
            source="api_finnhub",
            confidence=0.75,
        )

        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )

        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")

        assert result.loc[0, "resolution_source"] == "api_finnhub"
        assert result.loc[0, "resolution_confidence"] == 0.75

    def test_existing_isin_has_provider_confidence(self):
        """Holdings with existing valid ISIN should have provider confidence."""
        holdings = pd.DataFrame(
            {
                "ticker": ["NVDA"],
                "name": ["NVIDIA"],
                "isin": ["US67066G1040"],
                "weight": [5.0],
            }
        )

        mock_resolver = MagicMock(spec=ISINResolver)

        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )

        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")

        mock_resolver.resolve.assert_not_called()

        assert result.loc[0, "resolution_source"] == "provider"
        assert result.loc[0, "resolution_confidence"] == 1.0

    def test_unresolved_holding_has_zero_confidence(self):
        """Unresolved holdings should have confidence 0.0."""
        holdings = pd.DataFrame(
            {
                "ticker": ["UNKNOWN"],
                "name": ["Unknown Corp"],
                "weight": [5.0],
            }
        )

        mock_resolver = MagicMock(spec=ISINResolver)
        mock_resolver.resolve.return_value = ResolutionResult(
            isin=None,
            status="unresolved",
            detail="api_all_failed",
            source=None,
            confidence=0.0,
        )

        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )

        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")

        assert result.loc[0, "resolution_source"] is None
        assert result.loc[0, "resolution_confidence"] == 0.0

    def test_skipped_holding_no_ticker_has_zero_confidence(self):
        """Skipped holdings (no ticker) should have confidence 0.0."""
        holdings = pd.DataFrame(
            {
                "ticker": [""],
                "name": ["No Ticker Corp"],
                "weight": [5.0],
            }
        )

        mock_resolver = MagicMock(spec=ISINResolver)

        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=mock_resolver,
        )

        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")

        assert result.loc[0, "resolution_status"] == "skipped"
        assert result.loc[0, "resolution_source"] is None
        assert result.loc[0, "resolution_confidence"] == 0.0


class TestEnrichmentProvenance:
    """Test provenance storage in enrichment."""

    @patch("portfolio_src.core.aggregation.enrichment.get_resolver")
    def test_enrichment_stores_provenance(self, mock_get_resolver):
        """enrich_etf_holdings should store source and confidence."""
        mock_resolver = MagicMock(spec=ISINResolver)
        mock_resolver.resolve.return_value = ResolutionResult(
            isin="US67066G1040",
            status="resolved",
            detail="api_wikidata",
            source="api_wikidata",
            confidence=0.80,
        )
        mock_get_resolver.return_value = mock_resolver

        holdings = pd.DataFrame(
            {
                "ticker": ["NVDA"],
                "name": ["NVIDIA"],
                "weight_percentage": [5.0],
                "asset_class": ["Equity"],
            }
        )

        result = enrich_etf_holdings(holdings, etf_market_value=1000000)

        assert "resolution_source" in result.columns
        assert "resolution_confidence" in result.columns
        assert result.loc[0, "resolution_source"] == "api_wikidata"
        assert result.loc[0, "resolution_confidence"] == 0.80

    @patch("portfolio_src.core.aggregation.enrichment.get_resolver")
    def test_non_equity_has_zero_confidence(self, mock_get_resolver):
        """Non-equity holdings should have confidence 0.0."""
        holdings = pd.DataFrame(
            {
                "ticker": ["CASH"],
                "name": ["Cash"],
                "weight_percentage": [5.0],
                "asset_class": ["Cash"],
            }
        )

        result = enrich_etf_holdings(holdings, etf_market_value=1000000)

        assert result.loc[0, "resolution_status"] == "skipped"
        assert result.loc[0, "resolution_source"] is None
        assert result.loc[0, "resolution_confidence"] == 0.0

    @patch("portfolio_src.core.aggregation.enrichment.get_resolver")
    def test_enrichment_preserves_existing_provenance(self, mock_get_resolver):
        """Enrichment should not overwrite existing provenance from Decomposer."""
        holdings = pd.DataFrame(
            {
                "ticker": ["NVDA"],
                "name": ["NVIDIA"],
                "isin": ["US67066G1040"],
                "asset_class": ["Equity"],
                "weight_percentage": [5.0],
                "resolution_status": ["resolved"],
                "resolution_detail": ["api_finnhub"],
                "resolution_source": ["api_finnhub"],
                "resolution_confidence": [0.75],
            }
        )

        result = enrich_etf_holdings(holdings, etf_market_value=1000000)

        assert result.loc[0, "resolution_source"] == "api_finnhub"
        assert result.loc[0, "resolution_confidence"] == 0.75


class TestConfidenceValues:
    """Test that confidence values match spec."""

    def test_provider_confidence_is_1_0(self):
        """Provider-supplied ISIN should have confidence 1.0."""
        assert CONFIDENCE_PROVIDER == 1.0

    def test_local_cache_confidence_is_0_95(self):
        """Local cache should have confidence 0.95."""
        assert CONFIDENCE_LOCAL_CACHE == 0.95

    def test_hive_confidence_is_0_90(self):
        """Hive should have confidence 0.90."""
        assert CONFIDENCE_HIVE == 0.90

    def test_wikidata_confidence_is_0_80(self):
        """Wikidata should have confidence 0.80."""
        assert CONFIDENCE_WIKIDATA == 0.80

    def test_finnhub_confidence_is_0_75(self):
        """Finnhub should have confidence 0.75."""
        assert CONFIDENCE_FINNHUB == 0.75

    def test_yfinance_confidence_is_0_70(self):
        """yFinance should have confidence 0.70."""
        assert CONFIDENCE_YFINANCE == 0.70


class TestAggregationProvenance:
    """Test provenance preservation in aggregation."""

    def test_aggregation_takes_max_confidence(self):
        """Aggregation should preserve highest confidence value."""
        holdings = pd.DataFrame(
            {
                "isin": ["US67066G1040", "US67066G1040"],
                "name": ["NVIDIA", "NVIDIA Corp"],
                "total_exposure": [1000, 2000],
                "resolution_source": ["api_yfinance", "api_finnhub"],
                "resolution_confidence": [0.70, 0.75],
            }
        )

        agg_dict = {
            "total_exposure": "sum",
            "resolution_confidence": "max",
        }

        aggregated = holdings.groupby("isin", as_index=False).agg(agg_dict)

        assert aggregated.loc[0, "resolution_confidence"] == 0.75
        assert aggregated.loc[0, "total_exposure"] == 3000

    def test_aggregation_takes_source_from_max_confidence_row(self):
        """Aggregation should take source from row with highest confidence."""
        holdings = pd.DataFrame(
            {
                "isin": ["US67066G1040", "US67066G1040"],
                "name": ["NVIDIA", "NVIDIA Corp"],
                "resolution_source": ["api_yfinance", "api_finnhub"],
                "resolution_confidence": [0.70, 0.75],
            }
        )

        source_map = {}
        for isin, group in holdings.groupby("isin"):
            max_idx = group["resolution_confidence"].idxmax()
            source_map[isin] = group.loc[max_idx, "resolution_source"]

        assert source_map["US67066G1040"] == "api_finnhub"


class TestBackwardCompatibility:
    """Test handling of DataFrames without provenance columns."""

    def test_aggregation_handles_missing_provenance_columns(self):
        """Aggregation should work when provenance columns are missing."""
        holdings = pd.DataFrame(
            {
                "isin": ["US67066G1040"],
                "name": ["NVIDIA"],
                "total_exposure": [1000],
            }
        )

        agg_dict = {"total_exposure": "sum", "name": "first"}

        if "resolution_confidence" in holdings.columns:
            agg_dict["resolution_confidence"] = "max"

        aggregated = holdings.groupby("isin", as_index=False).agg(agg_dict)

        assert "resolution_confidence" not in aggregated.columns
        assert aggregated.loc[0, "total_exposure"] == 1000

    def test_decomposer_without_resolver_skips_resolution(self):
        """Decomposer without resolver should skip resolution gracefully."""
        holdings = pd.DataFrame(
            {
                "ticker": ["NVDA"],
                "name": ["NVIDIA"],
                "weight": [5.0],
            }
        )

        decomposer = Decomposer(
            holdings_cache=MagicMock(),
            adapter_registry=MagicMock(),
            isin_resolver=None,
        )

        result, stats = decomposer._resolve_holdings_isins(holdings, "TEST_ETF")

        assert stats.get("skipped") is True
        assert "resolution_source" not in result.columns
