"""Unit tests for HiveClient read methods."""

import pytest
from unittest.mock import Mock, patch, MagicMock
from portfolio_src.data.hive_client import HiveClient, get_hive_client


class TestResolveTickerMethod:
    """Tests for resolve_ticker() method."""

    def test_resolve_ticker_success(self):
        """Should return ISIN when ticker is found."""
        client = HiveClient()

        mock_supabase = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [{"isin": "US0378331005", "name": "Apple Inc"}]
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        with patch.object(client, "_get_client", return_value=mock_supabase):
            result = client.resolve_ticker("AAPL")

        assert result == "US0378331005"
        mock_supabase.rpc.assert_called_once_with(
            "resolve_ticker_rpc", {"p_ticker": "AAPL", "p_exchange": None}
        )

    def test_resolve_ticker_not_found(self):
        """Should return None when ticker not found."""
        client = HiveClient()

        mock_supabase = MagicMock()
        mock_response = MagicMock()
        mock_response.data = []
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        with patch.object(client, "_get_client", return_value=mock_supabase):
            result = client.resolve_ticker("UNKNOWN")

        assert result is None

    def test_resolve_ticker_with_exchange(self):
        """Should pass exchange parameter to RPC."""
        client = HiveClient()

        mock_supabase = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [{"isin": "US0378331005"}]
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        with patch.object(client, "_get_client", return_value=mock_supabase):
            client.resolve_ticker("AAPL", exchange="NASDAQ")

        mock_supabase.rpc.assert_called_once_with(
            "resolve_ticker_rpc", {"p_ticker": "AAPL", "p_exchange": "NASDAQ"}
        )

    def test_resolve_ticker_client_unavailable(self):
        """Should return None when client is unavailable."""
        client = HiveClient()

        with patch.object(client, "_get_client", return_value=None):
            result = client.resolve_ticker("AAPL")

        assert result is None


class TestBatchResolveTickersMethod:
    """Tests for batch_resolve_tickers() method."""

    def test_batch_resolve_success(self):
        """Should return dict mapping tickers to ISINs."""
        client = HiveClient()

        mock_supabase = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [
            {"ticker": "AAPL", "isin": "US0378331005"},
            {"ticker": "MSFT", "isin": "US5949181045"},
        ]
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        with patch.object(client, "_get_client", return_value=mock_supabase):
            result = client.batch_resolve_tickers(["AAPL", "MSFT", "UNKNOWN"])

        assert result["AAPL"] == "US0378331005"
        assert result["MSFT"] == "US5949181045"
        assert result["UNKNOWN"] is None

    def test_batch_resolve_chunking(self):
        """Should chunk large requests."""
        client = HiveClient()

        mock_supabase = MagicMock()
        mock_response = MagicMock()
        mock_response.data = []
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        tickers = [f"TICK{i}" for i in range(250)]

        with patch.object(client, "_get_client", return_value=mock_supabase):
            client.batch_resolve_tickers(tickers, chunk_size=100)

        # Should make 3 RPC calls (100 + 100 + 50)
        assert mock_supabase.rpc.call_count == 3

    def test_batch_resolve_empty_list(self):
        """Should return empty dict for empty input."""
        client = HiveClient()
        result = client.batch_resolve_tickers([])
        assert result == {}


class TestLookupByAliasMethod:
    """Tests for lookup_by_alias() method."""

    def test_lookup_alias_success(self):
        """Should return ISIN when alias is found."""
        client = HiveClient()

        mock_supabase = MagicMock()
        mock_response = MagicMock()
        mock_response.data = [{"isin": "US0378331005", "name": "Apple Inc"}]
        mock_supabase.rpc.return_value.execute.return_value = mock_response

        with patch.object(client, "_get_client", return_value=mock_supabase):
            result = client.lookup_by_alias("Apple")

        assert result == "US0378331005"

    def test_lookup_alias_empty_input(self):
        """Should return None for empty input."""
        client = HiveClient()

        assert client.lookup_by_alias("") is None
        assert client.lookup_by_alias("   ") is None
        assert client.lookup_by_alias(None) is None  # type: ignore


class TestSyncIdentityDomainMethod:
    """Tests for sync_identity_domain() method."""

    def test_sync_returns_all_tables(self):
        """Should return data for all three tables."""
        client = HiveClient()

        mock_supabase = MagicMock()

        def mock_rpc(name, params):
            mock_resp = MagicMock()
            if name == "get_all_assets_rpc":
                mock_resp.data = [{"isin": "US0378331005", "name": "Apple"}]
            elif name == "get_all_listings_rpc":
                mock_resp.data = [{"ticker": "AAPL", "isin": "US0378331005"}]
            elif name == "get_all_aliases_rpc":
                mock_resp.data = [{"alias": "Apple", "isin": "US0378331005"}]
            else:
                mock_resp.data = []
            return MagicMock(execute=lambda: mock_resp)

        mock_supabase.rpc = mock_rpc

        with patch.object(client, "_get_client", return_value=mock_supabase):
            result = client.sync_identity_domain()

        assert len(result["assets"]) == 1
        assert len(result["listings"]) == 1
        assert len(result["aliases"]) == 1
