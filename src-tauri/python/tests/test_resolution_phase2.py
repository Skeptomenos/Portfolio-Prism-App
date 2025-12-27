"""Unit tests for ISINResolver Phase 2: Cascade Reorder & Confidence Scoring."""

import time
import pytest
from unittest.mock import MagicMock, patch, call

from portfolio_src.data.resolution import (
    ISINResolver,
    ResolutionResult,
    CONFIDENCE_PROVIDER,
    CONFIDENCE_LOCAL_CACHE,
    CONFIDENCE_HIVE,
    CONFIDENCE_MANUAL,
    CONFIDENCE_WIKIDATA,
    CONFIDENCE_FINNHUB,
    CONFIDENCE_YFINANCE,
)


class TestConfidenceScores:
    """Test that resolution results have correct confidence scores."""

    def test_provider_isin_has_confidence_1(self):
        """Provider-supplied ISIN should have confidence 1.0."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache
                mock_hive_fn.return_value = MagicMock()

                resolver = ISINResolver()
                result = resolver.resolve(
                    "AAPL", "Apple Inc", provider_isin="US0378331005"
                )

                assert result.isin == "US0378331005"
                assert result.confidence == CONFIDENCE_PROVIDER
                assert result.confidence == 1.0

    def test_manual_enrichment_has_confidence_085(self):
        """Manual enrichment should have confidence 0.85."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                with patch(
                    "portfolio_src.data.resolution.load_manual_enrichments"
                ) as mock_manual:
                    mock_cache = MagicMock()
                    mock_cache.is_stale.return_value = False
                    mock_cache_fn.return_value = mock_cache
                    mock_hive_fn.return_value = MagicMock()
                    mock_manual.return_value = {"AAPL": "US0378331005"}

                    resolver = ISINResolver()
                    result = resolver.resolve("AAPL", "Apple Inc")

                    assert result.isin == "US0378331005"
                    assert result.confidence == CONFIDENCE_MANUAL
                    assert result.confidence == 0.85

    def test_local_cache_has_confidence_095(self):
        """Local cache hit should have confidence 0.95."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = "US0378331005"
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache
                mock_hive_fn.return_value = MagicMock()

                resolver = ISINResolver()
                result = resolver.resolve("AAPL", "Apple Inc")

                assert result.isin == "US0378331005"
                assert result.confidence == CONFIDENCE_LOCAL_CACHE
                assert result.confidence == 0.95

    def test_hive_has_confidence_090(self):
        """Hive network hit should have confidence 0.90."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = "US0378331005"
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver(tier1_threshold=0.5)
                result = resolver.resolve("AAPL", "Apple Inc", weight=1.0)

                assert result.isin == "US0378331005"
                assert result.confidence == CONFIDENCE_HIVE
                assert result.confidence == 0.90


class TestCascadeOrder:
    """Test that APIs are called in correct order: Wikidata → Finnhub → yFinance."""

    def test_wikidata_called_before_finnhub(self):
        """Wikidata should be tried before Finnhub."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()

                call_order = []

                def track_wikidata(*args, **kwargs):
                    call_order.append("wikidata")
                    return "US0378331005"

                def track_finnhub(*args, **kwargs):
                    call_order.append("finnhub")
                    return (None, False)

                with patch.object(
                    resolver, "_call_wikidata_batch", side_effect=track_wikidata
                ):
                    with patch.object(
                        resolver, "_call_finnhub_with_status", side_effect=track_finnhub
                    ):
                        result = resolver.resolve("AAPL", "Apple Inc", weight=5.0)

                assert call_order == ["wikidata"]
                assert result.isin == "US0378331005"
                assert result.confidence == CONFIDENCE_WIKIDATA

    def test_finnhub_called_after_wikidata_fails(self):
        """Finnhub should be tried after Wikidata fails."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()

                call_order = []

                def track_wikidata(*args, **kwargs):
                    call_order.append("wikidata")
                    return None

                def track_finnhub(*args, **kwargs):
                    call_order.append("finnhub")
                    return ("US0378331005", False)

                with patch.object(
                    resolver, "_call_wikidata_batch", side_effect=track_wikidata
                ):
                    with patch.object(
                        resolver, "_call_finnhub_with_status", side_effect=track_finnhub
                    ):
                        result = resolver.resolve("AAPL", "Apple Inc", weight=5.0)

                assert call_order == ["wikidata", "finnhub"]
                assert result.isin == "US0378331005"
                assert result.confidence == CONFIDENCE_FINNHUB

    def test_yfinance_called_after_finnhub_fails(self):
        """yFinance should be tried after Finnhub fails."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()

                call_order = []

                def track_wikidata(*args, **kwargs):
                    call_order.append("wikidata")
                    return None

                def track_finnhub(*args, **kwargs):
                    call_order.append("finnhub")
                    return (None, False)

                def track_yfinance(*args, **kwargs):
                    call_order.append("yfinance")
                    return "US0378331005"

                with patch.object(
                    resolver, "_call_wikidata_batch", side_effect=track_wikidata
                ):
                    with patch.object(
                        resolver, "_call_finnhub_with_status", side_effect=track_finnhub
                    ):
                        with patch.object(
                            resolver, "_call_yfinance", side_effect=track_yfinance
                        ):
                            result = resolver.resolve("AAPL", "Apple Inc", weight=5.0)

                assert "wikidata" in call_order
                assert "finnhub" in call_order
                assert "yfinance" in call_order
                assert call_order.index("wikidata") < call_order.index("finnhub")
                assert call_order.index("finnhub") < call_order.index("yfinance")
                assert result.isin == "US0378331005"
                assert result.confidence == CONFIDENCE_YFINANCE


class TestTieredVariantStrategy:
    """Test that APIs use appropriate variant strategies."""

    def test_finnhub_uses_primary_ticker_only(self):
        """Finnhub should only try primary ticker, not all variants."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()

                finnhub_calls = []

                def track_finnhub(ticker):
                    finnhub_calls.append(ticker)
                    return (None, False)

                with patch.object(resolver, "_call_wikidata_batch", return_value=None):
                    with patch.object(
                        resolver, "_call_finnhub_with_status", side_effect=track_finnhub
                    ):
                        with patch.object(
                            resolver, "_call_yfinance", return_value=None
                        ):
                            resolver.resolve("BRK/B", "Berkshire Hathaway", weight=5.0)

                # Should only call Finnhub once with primary ticker
                assert len(finnhub_calls) == 1

    def test_yfinance_uses_top_2_variants(self):
        """yFinance should try at most 2 ticker variants."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()

                yfinance_calls = []

                def track_yfinance(ticker):
                    yfinance_calls.append(ticker)
                    return None

                with patch.object(resolver, "_call_wikidata_batch", return_value=None):
                    with patch.object(
                        resolver,
                        "_call_finnhub_with_status",
                        return_value=(None, False),
                    ):
                        with patch.object(
                            resolver, "_call_yfinance", side_effect=track_yfinance
                        ):
                            resolver.resolve("BRK/B", "Berkshire Hathaway", weight=5.0)

                # Should call yFinance at most 2 times
                assert len(yfinance_calls) <= 2


class TestNegativeCache:
    """Test in-memory negative cache behavior."""

    def test_negative_cache_prevents_repeated_calls(self):
        """Failed ticker should not trigger API calls again."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False

                negative_cache_calls = [0]

                def is_negative_cached_side_effect(*args, **kwargs):
                    negative_cache_calls[0] += 1
                    return negative_cache_calls[0] > 1

                mock_cache.is_negative_cached.side_effect = (
                    is_negative_cached_side_effect
                )
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()

                api_call_count = 0

                def track_wikidata(*args, **kwargs):
                    nonlocal api_call_count
                    api_call_count += 1
                    return None

                def track_finnhub(*args, **kwargs):
                    nonlocal api_call_count
                    api_call_count += 1
                    return (None, False)

                def track_yfinance(*args, **kwargs):
                    nonlocal api_call_count
                    api_call_count += 1
                    return None

                with patch.object(
                    resolver, "_call_wikidata_batch", side_effect=track_wikidata
                ):
                    with patch.object(
                        resolver, "_call_finnhub_with_status", side_effect=track_finnhub
                    ):
                        with patch.object(
                            resolver, "_call_yfinance", side_effect=track_yfinance
                        ):
                            result1 = resolver.resolve(
                                "UNKNOWN", "Unknown Company", weight=5.0
                            )
                            first_call_count = api_call_count

                            result2 = resolver.resolve(
                                "UNKNOWN", "Unknown Company", weight=5.0
                            )
                            second_call_count = api_call_count - first_call_count

                assert result1.status == "unresolved"
                assert result2.status == "unresolved"
                assert result2.detail == "negative_cached"
                assert second_call_count == 0

    def test_negative_cache_expires_after_ttl(self, tmp_path):
        """Negative cache entries should expire after TTL (tested via direct insertion)."""
        from datetime import datetime, timedelta
        from portfolio_src.data.local_cache import LocalCache

        cache = LocalCache(db_path=tmp_path / "test.db")

        conn = cache._get_connection()
        past_time = (datetime.now() - timedelta(hours=1)).isoformat()
        conn.execute(
            """
            INSERT INTO isin_cache (alias, alias_type, isin, resolution_status, confidence, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            ("EXPIRED", "ticker", None, "unresolved", 0.0, past_time),
        )
        conn.commit()

        assert not cache.is_negative_cached("EXPIRED", "ticker")

    def test_negative_cache_is_per_ticker(self):
        """Different tickers should have independent cache entries."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()

                with patch.object(resolver, "_call_wikidata_batch", return_value=None):
                    with patch.object(
                        resolver,
                        "_call_finnhub_with_status",
                        return_value=(None, False),
                    ):
                        with patch.object(
                            resolver, "_call_yfinance", return_value=None
                        ):
                            resolver.resolve("UNKNOWN1", "Unknown 1", weight=5.0)

                            result = resolver.resolve(
                                "UNKNOWN2", "Unknown 2", weight=5.0
                            )

                assert result.detail == "api_all_failed"


class TestWikidataBatch:
    """Test batched Wikidata SPARQL queries."""

    def test_wikidata_batch_receives_name_variants(self):
        """Wikidata batch should receive all name variants."""
        with patch("portfolio_src.data.resolution.get_local_cache") as mock_cache_fn:
            with patch("portfolio_src.data.resolution.get_hive_client") as mock_hive_fn:
                mock_cache = MagicMock()
                mock_cache.get_isin_by_ticker.return_value = None
                mock_cache.get_isin_by_alias.return_value = None
                mock_cache.is_stale.return_value = False
                mock_cache.is_negative_cached.return_value = False
                mock_cache_fn.return_value = mock_cache

                mock_hive = MagicMock()
                mock_hive.is_configured = True
                mock_hive.resolve_ticker.return_value = None
                mock_hive.lookup_by_alias.return_value = None
                mock_hive_fn.return_value = mock_hive

                resolver = ISINResolver()

                received_variants = []

                def capture_variants(name_variants):
                    received_variants.extend(name_variants)
                    return None

                with patch.object(
                    resolver, "_call_wikidata_batch", side_effect=capture_variants
                ):
                    with patch.object(
                        resolver,
                        "_call_finnhub_with_status",
                        return_value=(None, False),
                    ):
                        with patch.object(
                            resolver, "_call_yfinance", return_value=None
                        ):
                            resolver.resolve(
                                "AAPL", "Apple Inc Corporation", weight=5.0
                            )

                assert len(received_variants) > 0
                assert any("APPLE" in v.upper() for v in received_variants)


class TestResolutionResultDataclass:
    """Test ResolutionResult dataclass behavior."""

    def test_invalid_isin_resets_confidence(self):
        """Invalid ISIN should reset confidence to 0.0."""
        result = ResolutionResult(
            isin="INVALID",
            status="resolved",
            detail="test",
            confidence=0.95,
        )

        # __post_init__ should have reset these
        assert result.isin is None
        assert result.status == "unresolved"
        assert result.confidence == 0.0

    def test_valid_isin_preserves_confidence(self):
        """Valid ISIN should preserve confidence."""
        result = ResolutionResult(
            isin="US0378331005",
            status="resolved",
            detail="test",
            confidence=0.95,
        )

        assert result.isin == "US0378331005"
        assert result.status == "resolved"
        assert result.confidence == 0.95
