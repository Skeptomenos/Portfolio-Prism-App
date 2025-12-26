# Phase 1: HiveClient Upgrade

**Workstream:** hive-extension
**Owner:** OptiPie
**Status:** Blocked (requires Phase 0)
**Estimated Effort:** 2-3 hours

---

## Objective

Add read capability to `HiveClient` for ticker-to-ISIN resolution by calling the new RPC functions created in Phase 0.

## Prerequisites

- Phase 0 complete (RPCs deployed and verified)
- `resolve_ticker_rpc`, `batch_resolve_tickers_rpc`, `lookup_alias_rpc` working

---

## Task Breakdown

### HIVE-101: Add `resolve_ticker()` Method

**File:** `src-tauri/python/portfolio_src/data/hive_client.py`

**Location:** Add after `contribute_mapping()` method (~line 555)

```python
def resolve_ticker(
    self,
    ticker: str,
    exchange: Optional[str] = None,
) -> Optional[str]:
    """
    Resolve a ticker symbol to ISIN via Hive.
    
    Args:
        ticker: Ticker symbol (e.g., "AAPL", "NVDA")
        exchange: Optional exchange code (e.g., "NASDAQ", "NYSE")
    
    Returns:
        ISIN string if found, None otherwise
    """
    client = self._get_client()
    if not client:
        return None
    
    try:
        response = client.rpc(
            "resolve_ticker_rpc",
            {
                "p_ticker": ticker,
                "p_exchange": exchange,
            },
        ).execute()
        
        if response.data and len(response.data) > 0:
            isin = response.data[0].get("isin")
            if isin:
                logger.debug(f"Hive resolved {ticker} -> {isin}")
                return isin
        
        return None
        
    except Exception as e:
        logger.warning(f"Hive ticker resolution failed for {ticker}: {e}")
        return None
```

**Add import at top of file:**
```python
from portfolio_src.prism_utils.logging_config import get_logger
logger = get_logger(__name__)
```

---

### HIVE-102: Add `batch_resolve_tickers()` Method

**File:** `src-tauri/python/portfolio_src/data/hive_client.py`

```python
def batch_resolve_tickers(
    self,
    tickers: List[str],
    chunk_size: int = 100,
) -> Dict[str, Optional[str]]:
    """
    Batch resolve multiple tickers to ISINs.
    
    Args:
        tickers: List of ticker symbols
        chunk_size: Max tickers per RPC call (default 100)
    
    Returns:
        Dict mapping ticker -> ISIN (or None if not found)
    """
    if not tickers:
        return {}
    
    client = self._get_client()
    if not client:
        return {t: None for t in tickers}
    
    results: Dict[str, Optional[str]] = {t: None for t in tickers}
    
    # Process in chunks to avoid RPC payload limits
    for i in range(0, len(tickers), chunk_size):
        chunk = tickers[i:i + chunk_size]
        
        try:
            response = client.rpc(
                "batch_resolve_tickers_rpc",
                {"p_tickers": chunk},
            ).execute()
            
            if response.data:
                for row in response.data:
                    ticker = row.get("ticker", "").upper()
                    isin = row.get("isin")
                    # Match back to original case
                    for orig_ticker in chunk:
                        if orig_ticker.upper() == ticker:
                            results[orig_ticker] = isin
                            break
                            
        except Exception as e:
            logger.warning(f"Hive batch resolution failed for chunk: {e}")
            # Continue with next chunk
    
    resolved_count = sum(1 for v in results.values() if v is not None)
    logger.info(f"Hive batch resolved {resolved_count}/{len(tickers)} tickers")
    
    return results
```

---

### HIVE-103: Add `lookup_by_alias()` Method

**File:** `src-tauri/python/portfolio_src/data/hive_client.py`

```python
def lookup_by_alias(
    self,
    alias: str,
) -> Optional[str]:
    """
    Look up ISIN by name/alias (case-insensitive).
    
    Args:
        alias: Name or alias to search (e.g., "Apple", "NVIDIA Corp")
    
    Returns:
        ISIN string if found, None otherwise
    """
    if not alias or not alias.strip():
        return None
    
    client = self._get_client()
    if not client:
        return None
    
    try:
        response = client.rpc(
            "lookup_alias_rpc",
            {"p_alias": alias.strip()},
        ).execute()
        
        if response.data and len(response.data) > 0:
            isin = response.data[0].get("isin")
            if isin:
                logger.debug(f"Hive alias resolved '{alias}' -> {isin}")
                return isin
        
        return None
        
    except Exception as e:
        logger.warning(f"Hive alias lookup failed for '{alias}': {e}")
        return None
```

---

### HIVE-104: Add `sync_identity_domain()` Method

**File:** `src-tauri/python/portfolio_src/data/hive_client.py`

```python
def sync_identity_domain(
    self,
    page_size: int = 1000,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Pull full identity domain (assets, listings, aliases) from Hive.
    
    Used by LocalCache to sync data for offline operation.
    
    Args:
        page_size: Rows per page for pagination
    
    Returns:
        Dict with keys 'assets', 'listings', 'aliases', each containing
        a list of row dicts.
    """
    client = self._get_client()
    if not client:
        return {"assets": [], "listings": [], "aliases": []}
    
    result = {"assets": [], "listings": [], "aliases": []}
    
    # Fetch assets
    try:
        # Use RPC to bypass RLS
        response = client.rpc("get_all_assets_rpc", {}).execute()
        if response.data:
            result["assets"] = response.data
            logger.info(f"Synced {len(response.data)} assets from Hive")
    except Exception as e:
        logger.warning(f"Failed to sync assets: {e}")
        # Fallback: try direct query (may fail due to RLS)
        try:
            response = client.from_("assets").select("*").execute()
            if response.data:
                result["assets"] = response.data
        except Exception:
            pass
    
    # Fetch listings
    try:
        response = client.rpc("get_all_listings_rpc", {}).execute()
        if response.data:
            result["listings"] = response.data
            logger.info(f"Synced {len(response.data)} listings from Hive")
    except Exception as e:
        logger.warning(f"Failed to sync listings: {e}")
        try:
            response = client.from_("listings").select("*").execute()
            if response.data:
                result["listings"] = response.data
        except Exception:
            pass
    
    # Fetch aliases
    try:
        response = client.rpc("get_all_aliases_rpc", {}).execute()
        if response.data:
            result["aliases"] = response.data
            logger.info(f"Synced {len(response.data)} aliases from Hive")
    except Exception as e:
        logger.warning(f"Failed to sync aliases: {e}")
        try:
            response = client.from_("aliases").select("*").execute()
            if response.data:
                result["aliases"] = response.data
        except Exception:
            pass
    
    return result
```

**Note:** This requires additional RPCs for bulk data access. Add to Phase 0 if not already present:

```sql
-- Add to functions.sql
CREATE OR REPLACE FUNCTION public.get_all_assets_rpc()
RETURNS SETOF assets
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$ SELECT * FROM public.assets; $$;

CREATE OR REPLACE FUNCTION public.get_all_listings_rpc()
RETURNS SETOF listings
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$ SELECT * FROM public.listings; $$;

CREATE OR REPLACE FUNCTION public.get_all_aliases_rpc()
RETURNS SETOF aliases
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$ SELECT * FROM public.aliases; $$;

GRANT EXECUTE ON FUNCTION public.get_all_assets_rpc() TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_listings_rpc() TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_aliases_rpc() TO anon;
```

---

### HIVE-105: Unit Tests for HiveClient Read Methods

**File:** `src-tauri/python/tests/test_hive_client_read.py`

```python
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
            "resolve_ticker_rpc",
            {"p_ticker": "AAPL", "p_exchange": None}
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
            "resolve_ticker_rpc",
            {"p_ticker": "AAPL", "p_exchange": "NASDAQ"}
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
        assert client.lookup_by_alias(None) is None


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
```

**Run tests:**
```bash
cd src-tauri/python
pytest tests/test_hive_client_read.py -v
```

---

## Integration Points

After Phase 1, the following methods are available on `HiveClient`:

| Method | Signature | Returns |
|--------|-----------|---------|
| `resolve_ticker` | `(ticker: str, exchange: Optional[str]) -> Optional[str]` | ISIN or None |
| `batch_resolve_tickers` | `(tickers: List[str]) -> Dict[str, Optional[str]]` | ticker→ISIN map |
| `lookup_by_alias` | `(alias: str) -> Optional[str]` | ISIN or None |
| `sync_identity_domain` | `() -> Dict[str, List[Dict]]` | Full table data |

---

## Success Criteria

- [ ] All 4 new methods implemented
- [ ] Unit tests pass (mock Supabase client)
- [ ] Integration test: `resolve_ticker("AAPL")` returns `US0378331005`
- [ ] Integration test: `batch_resolve_tickers(["AAPL", "MSFT"])` returns 2 ISINs
- [ ] Graceful degradation when Hive is unreachable (returns None, no crash)
