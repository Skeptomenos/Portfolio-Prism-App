#!/usr/bin/env python3
"""
Unit tests for Pipeline Services (Decomposer, Enricher, Aggregator).
Run with: pytest tests/test_services.py -v
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch
import pandas as pd
import pytest

# Add paths for package resolution
sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "portfolio_src"))

from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.core.services.enricher import Enricher, EnrichmentResult
from portfolio_src.core.services.aggregator import Aggregator
from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType


class TestDecomposer:
    """Tests for Decomposer service."""

    @pytest.fixture
    def setup_decomposer(self):
        holdings_cache = MagicMock()
        adapter_registry = MagicMock()
        decomposer = Decomposer(holdings_cache, adapter_registry)
        return decomposer, holdings_cache, adapter_registry

    def test_decompose_cache_hit(self, setup_decomposer):
        decomposer, cache, registry = setup_decomposer

        # Setup mock data for cache hit
        isin = "IE00B4L5Y983"
        etf_positions = pd.DataFrame([{"ISIN": isin, "Name": "Test ETF"}])
        cached_df = pd.DataFrame([{"Name": "Stock A", "Weight": 100}])

        cache.get_holdings.return_value = cached_df

        holdings_map, errors = decomposer.decompose(etf_positions)

        assert isin in holdings_map
        assert not errors
        cache.get_holdings.assert_called()
        registry.get_adapter.assert_not_called()

    def test_decompose_adapter_success(self, setup_decomposer):
        decomposer, cache, registry = setup_decomposer

        isin = "IE00B4L5Y983"
        etf_positions = pd.DataFrame([{"ISIN": isin}])
        adapter_df = pd.DataFrame([{"Name": "Stock A", "Weight": 100}])

        cache.get_holdings.return_value = None  # Cache miss
        mock_adapter = MagicMock()
        mock_adapter.fetch_holdings.return_value = adapter_df
        registry.get_adapter.return_value = mock_adapter

        holdings_map, errors = decomposer.decompose(etf_positions)

        assert isin in holdings_map
        assert not errors
        registry.get_adapter.assert_called_with(isin)
        cache._save_to_local_cache.assert_called()

    def test_decompose_no_adapter(self, setup_decomposer):
        decomposer, cache, registry = setup_decomposer

        isin = "UNKNOWN123"
        etf_positions = pd.DataFrame([{"ISIN": isin}])

        cache.get.return_value = None
        registry.get_adapter.return_value = None

        holdings_map, errors = decomposer.decompose(etf_positions)

        assert isin not in holdings_map
        assert len(errors) == 1
        assert errors[0].error_type == ErrorType.NO_ADAPTER
        assert errors[0].phase == ErrorPhase.ETF_DECOMPOSITION


class TestEnricher:
    """Tests for Enricher service."""

    @pytest.fixture
    def setup_enricher(self):
        enrichment_service = MagicMock()
        enricher = Enricher(enrichment_service)
        return enricher, enrichment_service

    def test_enrich_success(self, setup_enricher):
        enricher, service = setup_enricher

        # Setup input holdings
        etf_isin = "ETF123"
        holdings_df = pd.DataFrame(
            [
                {"isin": "Stock1", "name": "Apple"},
                {"isin": "Stock2", "name": "Microsoft"},
            ]
        )
        holdings_map = {etf_isin: holdings_df}

        service.get_metadata_batch.return_value = EnrichmentResult(
            data={
                "Stock1": {
                    "sector": "Tech",
                    "geography": "US",
                    "asset_class": "Stock",
                    "name": "Apple",
                },
                "Stock2": {
                    "sector": "Tech",
                    "geography": "US",
                    "asset_class": "Stock",
                    "name": "Microsoft",
                },
            },
            sources={"Stock1": "hive", "Stock2": "hive"},
            contributions=[],
        )

        enriched_map, errors = enricher.enrich(holdings_map)

        assert etf_isin in enriched_map
        result_df = enriched_map[etf_isin]
        assert "sector" in result_df.columns
        assert "geography" in result_df.columns
        assert result_df.iloc[0]["sector"] == "Tech"

    def test_enrich_empty(self, setup_enricher):
        enricher, service = setup_enricher
        enriched_map, errors = enricher.enrich({})
        assert not enriched_map
        assert not errors


class TestAggregator:
    """Tests for Aggregator service."""

    @pytest.fixture
    def aggregator(self):
        return Aggregator()

    def test_aggregate_simple(self, aggregator):
        direct = pd.DataFrame(
            [
                {
                    "ISIN": "Direct1",
                    "Name": "Direct Stock",
                    "NetValue": 100,
                    "sector": "Tech",
                    "geography": "US",
                }
            ]
        )

        etf = pd.DataFrame([{"ISIN": "ETF1", "Name": "Test ETF", "NetValue": 200}])

        # ETF holdings - 100% weight on one stock
        holdings_map = {
            "ETF1": pd.DataFrame(
                [
                    {
                        "ISIN": "Underlying1",
                        "Name": "Underlying",
                        "Weight": 100.0,
                        "sector": "Energy",
                        "geography": "UK",
                    }
                ]
            )
        }

        agg_df, errors = aggregator.aggregate(direct, etf, holdings_map)

        assert not errors
        assert len(agg_df) == 2

        # Check total values
        direct_row = agg_df[agg_df["isin"] == "Direct1"].iloc[0]
        assert direct_row["total_exposure"] == 100

        etf_row = agg_df[agg_df["isin"] == "Underlying1"].iloc[0]
        assert etf_row["total_exposure"] == 200  # 100% of 200

    def test_aggregate_malformed(self, aggregator):
        """Test that malformed input returns errors instead of crashing."""
        direct = pd.DataFrame()
        etf = pd.DataFrame([{"ISIN": "ETF1", "NetValue": 100}])

        # Pass garbage as holdings_map
        holdings_map = None

        agg_df, errors = aggregator.aggregate(direct, etf, holdings_map)

        assert len(errors) > 0
        assert errors[0].phase == ErrorPhase.AGGREGATION
        assert agg_df.empty
