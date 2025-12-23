"""Tests for headless/handlers/holdings.py - Holdings and overlap handlers."""

import json
import os
import tempfile
import pytest
from unittest.mock import patch, MagicMock
import pandas as pd

from portfolio_src.headless.handlers.holdings import (
    handle_upload_holdings,
    handle_get_true_holdings,
    handle_get_overlap_analysis,
    handle_get_pipeline_report,
)


class TestHandleUploadHoldings:
    """Tests for handle_upload_holdings()."""

    def test_returns_error_when_file_path_missing(self):
        """Returns error when filePath is not provided."""
        result = handle_upload_holdings(1, {"etfIsin": "IE00B4L5Y983"})

        assert result["status"] == "error"
        assert result["error"]["code"] == "INVALID_PARAMS"

    def test_returns_error_when_etf_isin_missing(self):
        """Returns error when etfIsin is not provided."""
        result = handle_upload_holdings(1, {"filePath": "/path/to/file.csv"})

        assert result["status"] == "error"
        assert result["error"]["code"] == "INVALID_PARAMS"

    def test_returns_error_when_both_missing(self):
        """Returns error when both params are missing."""
        result = handle_upload_holdings(1, {})

        assert result["status"] == "error"
        assert result["error"]["code"] == "INVALID_PARAMS"

    def test_returns_error_on_empty_cleanup(self):
        """Returns error when cleanup produces empty dataframe."""
        mock_df = pd.DataFrame()

        # Patch at the source module
        with patch("portfolio_src.core.data_cleaner.DataCleaner") as MockCleaner:
            MockCleaner.smart_load.return_value = pd.DataFrame({"col": [1]})
            MockCleaner.cleanup.return_value = mock_df

            result = handle_upload_holdings(
                1, {"filePath": "/path/to/file.csv", "etfIsin": "IE00B4L5Y983"}
            )

        assert result["status"] == "error"
        assert result["error"]["code"] == "CLEANUP_FAILED"

    def test_returns_success_with_holdings_count(self):
        """Returns success with holdings count on valid upload."""
        mock_df = pd.DataFrame(
            {
                "isin": ["US1234567890", "US0987654321"],
                "name": ["Stock A", "Stock B"],
                "weight": [50.0, 50.0],
            }
        )

        mock_cache = MagicMock()
        mock_hive = MagicMock()
        mock_hive.is_configured = False

        with patch("portfolio_src.core.data_cleaner.DataCleaner") as MockCleaner:
            MockCleaner.smart_load.return_value = mock_df
            MockCleaner.cleanup.return_value = mock_df

            with patch(
                "portfolio_src.data.holdings_cache.get_holdings_cache",
                return_value=mock_cache,
            ):
                with patch(
                    "portfolio_src.data.hive_client.get_hive_client",
                    return_value=mock_hive,
                ):
                    result = handle_upload_holdings(
                        1,
                        {
                            "filePath": "/path/to/file.csv",
                            "etfIsin": "IE00B4L5Y983",
                        },
                    )

        assert result["status"] == "success"
        assert result["data"]["holdingsCount"] == 2
        assert result["data"]["totalWeight"] == 100.0
        assert result["data"]["isin"] == "IE00B4L5Y983"


class TestHandleGetTrueHoldings:
    """Tests for handle_get_true_holdings()."""

    def test_returns_empty_when_file_not_exists(self):
        """Returns empty holdings when breakdown file doesn't exist."""
        with patch("os.path.exists", return_value=False):
            result = handle_get_true_holdings(1, {})

        assert result["status"] == "success"
        assert result["data"]["holdings"] == []

    def test_returns_empty_when_dataframe_empty(self):
        """Returns empty holdings when breakdown file is empty."""
        with patch("os.path.exists", return_value=True):
            with patch("pandas.read_csv", return_value=pd.DataFrame()):
                result = handle_get_true_holdings(1, {})

        assert result["status"] == "success"
        assert result["data"]["holdings"] == []

    def test_returns_grouped_holdings(self):
        """Returns holdings grouped by child security."""
        mock_df = pd.DataFrame(
            {
                "parent_isin": ["ETF1", "ETF2", "ETF1"],
                "child_isin": ["STOCK1", "STOCK1", "STOCK2"],
                "child_name": ["Apple", "Apple", "Microsoft"],
                "value_eur": [100.0, 50.0, 200.0],
                "weight_percent": [10.0, 5.0, 20.0],
                "sector": ["Tech", "Tech", "Tech"],
                "geography": ["US", "US", "US"],
            }
        )

        with patch("os.path.exists", return_value=True):
            with patch("pandas.read_csv", return_value=mock_df):
                result = handle_get_true_holdings(1, {})

        assert result["status"] == "success"
        holdings = result["data"]["holdings"]

        # Should have 2 unique stocks
        assert len(holdings) == 2

        # Microsoft should be first (higher value)
        assert holdings[0]["stock"] == "Microsoft"
        assert holdings[0]["totalValue"] == 200.0

        # Apple should have sources from both ETFs
        apple = next(h for h in holdings if h["stock"] == "Apple")
        assert len(apple["sources"]) == 2


class TestHandleGetOverlapAnalysis:
    """Tests for handle_get_overlap_analysis()."""

    def test_returns_empty_when_file_not_exists(self):
        """Returns empty analysis when breakdown file doesn't exist."""
        with patch("os.path.exists", return_value=False):
            result = handle_get_overlap_analysis(1, {})

        assert result["status"] == "success"
        assert result["data"]["etfs"] == []
        assert result["data"]["matrix"] == []
        assert result["data"]["sharedHoldings"] == []

    def test_returns_empty_when_dataframe_empty(self):
        """Returns empty analysis when breakdown file is empty."""
        with patch("os.path.exists", return_value=True):
            with patch("pandas.read_csv", return_value=pd.DataFrame()):
                result = handle_get_overlap_analysis(1, {})

        assert result["status"] == "success"
        assert result["data"]["etfs"] == []

    def test_returns_overlap_matrix(self):
        """Returns overlap matrix for ETFs."""
        mock_df = pd.DataFrame(
            {
                "parent_isin": ["ETF1", "ETF1", "ETF2", "ETF2"],
                "child_isin": ["STOCK1", "STOCK2", "STOCK1", "STOCK3"],
                "child_name": ["Apple", "Microsoft", "Apple", "Google"],
                "value_eur": [100.0, 100.0, 100.0, 100.0],
                "weight_percent": [50.0, 50.0, 50.0, 50.0],
            }
        )

        with patch("os.path.exists", return_value=True):
            with patch("pandas.read_csv", return_value=mock_df):
                result = handle_get_overlap_analysis(1, {})

        assert result["status"] == "success"
        assert len(result["data"]["etfs"]) == 2
        assert len(result["data"]["matrix"]) == 2
        assert len(result["data"]["matrix"][0]) == 2

        # Diagonal should be 100%
        matrix = result["data"]["matrix"]
        assert matrix[0][0] == 100.0
        assert matrix[1][1] == 100.0

    def test_identifies_shared_holdings(self):
        """Identifies holdings shared between multiple ETFs."""
        mock_df = pd.DataFrame(
            {
                "parent_isin": ["ETF1", "ETF2"],
                "child_isin": ["STOCK1", "STOCK1"],
                "child_name": ["Apple", "Apple"],
                "value_eur": [100.0, 150.0],
                "weight_percent": [50.0, 75.0],
            }
        )

        with patch("os.path.exists", return_value=True):
            with patch("pandas.read_csv", return_value=mock_df):
                result = handle_get_overlap_analysis(1, {})

        shared = result["data"]["sharedHoldings"]
        assert len(shared) == 1
        assert shared[0]["stock"] == "Apple"
        assert len(shared[0]["etfs"]) == 2
        assert shared[0]["totalValue"] == 250.0


class TestHandleGetPipelineReport:
    """Tests for handle_get_pipeline_report()."""

    def test_returns_none_when_file_not_exists(self):
        """Returns None when report file doesn't exist."""
        with patch("os.path.exists", return_value=False):
            result = handle_get_pipeline_report(1, {})

        assert result["status"] == "success"
        assert result["data"] is None

    def test_returns_report_data(self):
        """Returns report data from file."""
        report_data = {
            "timestamp": "2025-12-23T10:00:00",
            "status": "healthy",
            "metrics": {"coverage": 95.5},
        }

        with patch("os.path.exists", return_value=True):
            with patch(
                "builtins.open",
                MagicMock(
                    return_value=MagicMock(
                        __enter__=MagicMock(
                            return_value=MagicMock(
                                read=MagicMock(return_value=json.dumps(report_data))
                            )
                        ),
                        __exit__=MagicMock(return_value=False),
                    )
                ),
            ):
                with patch("json.load", return_value=report_data):
                    result = handle_get_pipeline_report(1, {})

        assert result["status"] == "success"
        assert result["data"]["status"] == "healthy"

    def test_returns_error_on_invalid_json(self):
        """Returns error when report file has invalid JSON."""
        with patch("os.path.exists", return_value=True):
            with patch(
                "builtins.open",
                MagicMock(
                    return_value=MagicMock(
                        __enter__=MagicMock(
                            return_value=MagicMock(
                                read=MagicMock(return_value="invalid json")
                            )
                        ),
                        __exit__=MagicMock(return_value=False),
                    )
                ),
            ):
                with patch(
                    "json.load",
                    side_effect=json.JSONDecodeError("test", "doc", 0),
                ):
                    result = handle_get_pipeline_report(1, {})

        assert result["status"] == "error"
        assert result["error"]["code"] == "REPORT_ERROR"
