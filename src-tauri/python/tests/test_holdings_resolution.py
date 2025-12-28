"""Phase 6A: Backend data exposure tests for holdings resolution."""

import os
import tempfile
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest


class TestHelperFunctions:
    def test_safe_str_with_none(self):
        from portfolio_src.headless.handlers.holdings import _safe_str

        assert _safe_str(None) == ""

    def test_safe_str_with_nan(self):
        from portfolio_src.headless.handlers.holdings import _safe_str

        assert _safe_str(np.nan) == ""

    def test_safe_str_with_string_nan(self):
        from portfolio_src.headless.handlers.holdings import _safe_str

        assert _safe_str("nan") == ""
        assert _safe_str("None") == ""

    def test_safe_str_with_value(self):
        from portfolio_src.headless.handlers.holdings import _safe_str

        assert _safe_str("test") == "test"
        assert _safe_str(123) == "123"

    def test_empty_summary_structure(self):
        from portfolio_src.headless.handlers.holdings import _empty_summary

        summary = _empty_summary()
        assert summary["total"] == 0
        assert summary["resolved"] == 0
        assert summary["unresolved"] == 0
        assert summary["skipped"] == 0
        assert summary["unknown"] == 0
        assert summary["bySource"] == {}
        assert summary["healthScore"] == 1.0

    def test_calculate_summary_empty(self):
        from portfolio_src.headless.handlers.holdings import (
            _calculate_summary,
            _empty_summary,
        )

        summary = _calculate_summary([])
        assert summary == _empty_summary()

    def test_calculate_summary_all_resolved(self):
        from portfolio_src.headless.handlers.holdings import _calculate_summary

        holdings = [
            {"resolutionStatus": "resolved", "resolutionSource": "provider"},
            {"resolutionStatus": "resolved", "resolutionSource": "hive"},
        ]
        summary = _calculate_summary(holdings)
        assert summary["total"] == 2
        assert summary["resolved"] == 2
        assert summary["unresolved"] == 0
        assert summary["healthScore"] == 1.0
        assert summary["bySource"]["provider"] == 1
        assert summary["bySource"]["hive"] == 1

    def test_calculate_summary_mixed(self):
        from portfolio_src.headless.handlers.holdings import _calculate_summary

        holdings = [
            {"resolutionStatus": "resolved", "resolutionSource": "provider"},
            {"resolutionStatus": "unresolved", "resolutionSource": "unknown"},
            {"resolutionStatus": "skipped", "resolutionSource": ""},
        ]
        summary = _calculate_summary(holdings)
        assert summary["total"] == 3
        assert summary["resolved"] == 1
        assert summary["unresolved"] == 1
        assert summary["skipped"] == 1
        assert summary["healthScore"] == 0.5

    def test_calculate_summary_excludes_unknown_from_health(self):
        from portfolio_src.headless.handlers.holdings import _calculate_summary

        holdings = [
            {"resolutionStatus": "resolved", "resolutionSource": "provider"},
            {"resolutionStatus": "unknown", "resolutionSource": "unknown"},
        ]
        summary = _calculate_summary(holdings)
        assert summary["resolved"] == 1
        assert summary["unknown"] == 1
        assert summary["healthScore"] == 1.0


class TestHandleGetTrueHoldings:
    def test_returns_empty_when_no_file(self):
        from portfolio_src.headless.handlers.holdings import handle_get_true_holdings

        with patch("os.path.exists", return_value=False):
            result = handle_get_true_holdings(1, {})

        assert result["data"]["holdings"] == []
        assert result["data"]["summary"]["total"] == 0

    def test_returns_resolution_fields(self):
        from portfolio_src.headless.handlers.holdings import handle_get_true_holdings

        csv_content = """parent_isin,parent_name,source,child_isin,child_name,ticker,asset_class,sector,geography,weight_percent,value_eur,resolution_status,resolution_source,resolution_confidence,resolution_detail
IE00B4L5Y983,iShares,ETF,US0378331005,Apple Inc,AAPL US,Equity,Technology,North America,5.0,1000.0,resolved,provider,1.0,provider
IE00B4L5Y983,iShares,ETF,US5949181045,Microsoft Corp,MSFT US,Equity,Technology,North America,4.0,800.0,resolved,api_finnhub,0.9,api"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        try:
            with patch("portfolio_src.config.HOLDINGS_BREAKDOWN_PATH", temp_path):
                result = handle_get_true_holdings(1, {})

            holdings = result["data"]["holdings"]
            assert len(holdings) == 2

            apple = next(h for h in holdings if "Apple" in h["stock"])
            assert apple["resolutionStatus"] == "resolved"
            assert apple["resolutionSource"] == "provider"
            assert apple["resolutionConfidence"] == 1.0
            assert apple["ticker"] == "AAPL US"
            assert apple["resolutionDetail"] == "provider"
        finally:
            os.unlink(temp_path)

    def test_handles_legacy_csv_without_resolution_columns(self):
        from portfolio_src.headless.handlers.holdings import handle_get_true_holdings

        csv_content = """parent_isin,parent_name,source,child_isin,child_name,asset_class,sector,geography,weight_percent,value_eur
IE00B4L5Y983,iShares,ETF,US0378331005,Apple,Equity,Tech,NA,5.0,1000.0"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        try:
            with patch("portfolio_src.config.HOLDINGS_BREAKDOWN_PATH", temp_path):
                result = handle_get_true_holdings(1, {})

            holdings = result["data"]["holdings"]
            assert len(holdings) == 1
            assert holdings[0]["resolutionStatus"] == "unknown"
            assert holdings[0]["resolutionConfidence"] == 0.0
        finally:
            os.unlink(temp_path)

    def test_summary_included_in_response(self):
        from portfolio_src.headless.handlers.holdings import handle_get_true_holdings

        csv_content = """parent_isin,parent_name,source,child_isin,child_name,ticker,asset_class,sector,geography,weight_percent,value_eur,resolution_status,resolution_source,resolution_confidence,resolution_detail
IE00B4L5Y983,iShares,ETF,US0378331005,Apple,AAPL,Equity,Tech,NA,5.0,1000.0,resolved,provider,1.0,provider
IE00B4L5Y983,iShares,ETF,US0000000000,Unknown,UNK,Equity,Tech,NA,2.0,500.0,unresolved,unknown,0.0,api_failed"""

        with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as f:
            f.write(csv_content)
            temp_path = f.name

        try:
            with patch("portfolio_src.config.HOLDINGS_BREAKDOWN_PATH", temp_path):
                result = handle_get_true_holdings(1, {})

            summary = result["data"]["summary"]
            assert summary["total"] == 2
            assert summary["resolved"] == 1
            assert summary["unresolved"] == 1
            assert summary["healthScore"] == 0.5
        finally:
            os.unlink(temp_path)
