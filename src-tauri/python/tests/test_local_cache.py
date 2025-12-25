"""Unit tests for LocalCache."""

import pytest
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

from portfolio_src.data.local_cache import LocalCache


@pytest.fixture
def temp_cache():
    """Create a temporary cache for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_cache.db"
        cache = LocalCache(db_path=db_path)
        yield cache
        cache.close()


class TestLocalCacheSchema:
    def test_schema_creates_tables(self, temp_cache):
        conn = temp_cache._get_connection()
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = {row[0] for row in cursor.fetchall()}

        assert "cache_assets" in tables
        assert "cache_listings" in tables
        assert "cache_aliases" in tables
        assert "cache_metadata" in tables


class TestLocalCacheRead:
    def test_get_isin_by_ticker_found(self, temp_cache):
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")

        result = temp_cache.get_isin_by_ticker("AAPL")
        assert result == "US0378331005"

    def test_get_isin_by_ticker_case_insensitive(self, temp_cache):
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")

        assert temp_cache.get_isin_by_ticker("aapl") == "US0378331005"
        assert temp_cache.get_isin_by_ticker("Aapl") == "US0378331005"

    def test_get_isin_by_ticker_with_exchange(self, temp_cache):
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")
        temp_cache.upsert_listing("AAPL", "XETRA", "US0378331005", "EUR")

        result = temp_cache.get_isin_by_ticker("AAPL", exchange="NASDAQ")
        assert result == "US0378331005"

    def test_get_isin_by_ticker_not_found(self, temp_cache):
        result = temp_cache.get_isin_by_ticker("UNKNOWN")
        assert result is None

    def test_get_isin_by_alias_found(self, temp_cache):
        temp_cache.upsert_alias("Apple Inc", "US0378331005")

        result = temp_cache.get_isin_by_alias("Apple Inc")
        assert result == "US0378331005"

    def test_get_isin_by_alias_case_insensitive(self, temp_cache):
        temp_cache.upsert_alias("Apple Inc", "US0378331005")

        assert temp_cache.get_isin_by_alias("apple inc") == "US0378331005"
        assert temp_cache.get_isin_by_alias("APPLE INC") == "US0378331005"

    def test_get_isin_by_alias_empty_string(self, temp_cache):
        assert temp_cache.get_isin_by_alias("") is None
        assert temp_cache.get_isin_by_alias("   ") is None

    def test_get_isin_by_alias_not_found(self, temp_cache):
        result = temp_cache.get_isin_by_alias("Unknown Company")
        assert result is None

    def test_get_asset(self, temp_cache):
        temp_cache.upsert_asset("US0378331005", "Apple Inc", "Equity", "USD")

        asset = temp_cache.get_asset("US0378331005")

        assert asset is not None
        assert asset.isin == "US0378331005"
        assert asset.name == "Apple Inc"
        assert asset.asset_class == "Equity"
        assert asset.base_currency == "USD"

    def test_get_asset_not_found(self, temp_cache):
        assert temp_cache.get_asset("UNKNOWN") is None

    def test_batch_get_isins(self, temp_cache):
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")
        temp_cache.upsert_listing("MSFT", "NASDAQ", "US5949181045", "USD")

        result = temp_cache.batch_get_isins(["AAPL", "MSFT", "UNKNOWN"])

        assert result["AAPL"] == "US0378331005"
        assert result["MSFT"] == "US5949181045"
        assert result["UNKNOWN"] is None

    def test_batch_get_isins_empty_list(self, temp_cache):
        result = temp_cache.batch_get_isins([])
        assert result == {}

    def test_batch_get_isins_preserves_case(self, temp_cache):
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")

        result = temp_cache.batch_get_isins(["aapl", "Aapl"])

        assert result["aapl"] == "US0378331005"
        assert result["Aapl"] == "US0378331005"


class TestLocalCacheWrite:
    def test_upsert_asset_insert(self, temp_cache):
        result = temp_cache.upsert_asset("US0378331005", "Apple Inc", "Equity", "USD")
        assert result is True

        asset = temp_cache.get_asset("US0378331005")
        assert asset.name == "Apple Inc"

    def test_upsert_asset_update(self, temp_cache):
        temp_cache.upsert_asset("US0378331005", "Apple Inc", "Equity", "USD")
        temp_cache.upsert_asset("US0378331005", "Apple Inc.", "Equity", "USD")

        asset = temp_cache.get_asset("US0378331005")
        assert asset.name == "Apple Inc."

    def test_upsert_listing(self, temp_cache):
        result = temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")
        assert result is True

        isin = temp_cache.get_isin_by_ticker("AAPL")
        assert isin == "US0378331005"

    def test_upsert_alias(self, temp_cache):
        result = temp_cache.upsert_alias("Apple Inc", "US0378331005", "name", 5)
        assert result is True

        isin = temp_cache.get_isin_by_alias("Apple Inc")
        assert isin == "US0378331005"

    def test_bulk_upsert_assets(self, temp_cache):
        assets = [
            {
                "isin": "US0378331005",
                "name": "Apple Inc",
                "asset_class": "Equity",
                "base_currency": "USD",
            },
            {
                "isin": "US5949181045",
                "name": "Microsoft Corp",
                "asset_class": "Equity",
                "base_currency": "USD",
            },
        ]

        count = temp_cache.bulk_upsert_assets(assets)
        assert count == 2

        assert temp_cache.get_asset("US0378331005") is not None
        assert temp_cache.get_asset("US5949181045") is not None

    def test_bulk_upsert_assets_empty(self, temp_cache):
        count = temp_cache.bulk_upsert_assets([])
        assert count == 0

    def test_bulk_upsert_listings(self, temp_cache):
        listings = [
            {
                "ticker": "AAPL",
                "exchange": "NASDAQ",
                "isin": "US0378331005",
                "currency": "USD",
            },
            {
                "ticker": "MSFT",
                "exchange": "NASDAQ",
                "isin": "US5949181045",
                "currency": "USD",
            },
        ]

        count = temp_cache.bulk_upsert_listings(listings)
        assert count == 2

        assert temp_cache.get_isin_by_ticker("AAPL") == "US0378331005"
        assert temp_cache.get_isin_by_ticker("MSFT") == "US5949181045"

    def test_bulk_upsert_aliases(self, temp_cache):
        aliases = [
            {
                "alias": "Apple Inc",
                "isin": "US0378331005",
                "alias_type": "name",
                "contributor_count": 1,
            },
            {
                "alias": "AAPL",
                "isin": "US0378331005",
                "alias_type": "ticker",
                "contributor_count": 1,
            },
        ]

        count = temp_cache.bulk_upsert_aliases(aliases)
        assert count == 2


class TestLocalCacheStaleness:
    def test_is_stale_when_empty(self, temp_cache):
        assert temp_cache.is_stale() is True

    def test_is_stale_partial_sync(self, temp_cache):
        temp_cache._update_sync_metadata("assets", 10)
        temp_cache._update_sync_metadata("listings", 20)

        assert temp_cache.is_stale() is True

    def test_is_stale_after_full_sync(self, temp_cache):
        temp_cache._update_sync_metadata("assets", 10)
        temp_cache._update_sync_metadata("listings", 20)
        temp_cache._update_sync_metadata("aliases", 5)

        assert temp_cache.is_stale() is False

    def test_get_last_sync_empty(self, temp_cache):
        assert temp_cache.get_last_sync() is None

    def test_get_last_sync_after_sync(self, temp_cache):
        temp_cache._update_sync_metadata("assets", 10)

        last_sync = temp_cache.get_last_sync()
        assert last_sync is not None

    def test_get_stats(self, temp_cache):
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")
        temp_cache._update_sync_metadata("listings", 1)

        stats = temp_cache.get_stats()

        assert "db_path" in stats
        assert "is_stale" in stats
        assert "tables" in stats
        assert "listings" in stats["tables"]
        assert stats["tables"]["listings"]["row_count"] == 1


class TestLocalCacheSync:
    def test_sync_from_hive(self, temp_cache):
        mock_hive = MagicMock()
        mock_hive.sync_identity_domain.return_value = {
            "assets": [
                {
                    "isin": "US0378331005",
                    "name": "Apple Inc",
                    "asset_class": "Equity",
                    "base_currency": "USD",
                },
            ],
            "listings": [
                {
                    "ticker": "AAPL",
                    "exchange": "NASDAQ",
                    "isin": "US0378331005",
                    "currency": "USD",
                },
            ],
            "aliases": [
                {
                    "alias": "Apple Inc",
                    "isin": "US0378331005",
                    "alias_type": "name",
                    "contributor_count": 1,
                },
            ],
        }

        counts = temp_cache.sync_from_hive(mock_hive)

        assert counts["assets"] == 1
        assert counts["listings"] == 1
        assert counts["aliases"] == 1

        assert temp_cache.get_asset("US0378331005") is not None
        assert temp_cache.get_isin_by_ticker("AAPL") == "US0378331005"
        assert temp_cache.get_isin_by_alias("Apple Inc") == "US0378331005"

    def test_sync_from_hive_empty_data(self, temp_cache):
        mock_hive = MagicMock()
        mock_hive.sync_identity_domain.return_value = {}

        counts = temp_cache.sync_from_hive(mock_hive)

        assert counts["assets"] == 0
        assert counts["listings"] == 0
        assert counts["aliases"] == 0

    def test_sync_updates_staleness(self, temp_cache):
        assert temp_cache.is_stale() is True

        mock_hive = MagicMock()
        mock_hive.sync_identity_domain.return_value = {
            "assets": [
                {
                    "isin": "US0378331005",
                    "name": "Apple",
                    "asset_class": "Equity",
                    "base_currency": "USD",
                }
            ],
            "listings": [
                {
                    "ticker": "AAPL",
                    "exchange": "NASDAQ",
                    "isin": "US0378331005",
                    "currency": "USD",
                }
            ],
            "aliases": [
                {
                    "alias": "Apple",
                    "isin": "US0378331005",
                    "alias_type": "name",
                    "contributor_count": 1,
                }
            ],
        }

        temp_cache.sync_from_hive(mock_hive)

        assert temp_cache.is_stale() is False
