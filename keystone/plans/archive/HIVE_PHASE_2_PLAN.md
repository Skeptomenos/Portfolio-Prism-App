# Phase 2: Local Cache Infrastructure

**Workstream:** hive-extension
**Owner:** OptiPie
**Status:** Blocked (requires Phase 0)
**Estimated Effort:** 3-4 hours
**Parallel:** Can run in parallel with Phase 1

---

## Objective

Create a local SQLite cache that mirrors the Hive identity domain (assets, listings, aliases) for offline operation and reduced Hive load.

## Prerequisites

- Phase 0 complete (aliases table exists)
- Understanding of existing SQLite patterns in `database.py`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCAL SQLITE CACHE                           │
│              (~/Library/Application Support/PortfolioPrism/)    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Tables (mirroring Hive):                                       │
│  ├── cache_assets      (isin, name, asset_class, base_currency) │
│  ├── cache_listings    (ticker, exchange, isin, currency)       │
│  ├── cache_aliases     (alias, isin, alias_type)                │
│  └── cache_metadata    (table_name, last_sync, row_count)       │
│                                                                 │
│  Resolution Flow:                                               │
│  1. Check LocalCache first (instant, offline-capable)           │
│  2. If miss → query HiveClient                                  │
│  3. If Hive returns data → update LocalCache                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Task Breakdown

### HIVE-201: Create LocalCache SQLite Schema

**File:** `src-tauri/python/portfolio_src/data/local_cache.py`

```python
"""
Local SQLite Cache for Hive Identity Domain.

Provides offline-capable ticker/alias resolution by caching
Hive data locally. Syncs on startup if stale (>24h).
"""

import sqlite3
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

from portfolio_src.prism_utils.logging_config import get_logger
from portfolio_src.config import get_data_dir

logger = get_logger(__name__)

CACHE_TTL_HOURS = 24
CACHE_DB_NAME = "hive_cache.db"


@dataclass
class CachedAsset:
    """Cached asset record."""
    isin: str
    name: str
    asset_class: str
    base_currency: str


@dataclass
class CachedListing:
    """Cached listing record."""
    ticker: str
    exchange: str
    isin: str
    currency: str


class LocalCache:
    """
    SQLite-backed local cache for Hive identity domain.
    
    Thread-safe with connection pooling per thread.
    """
    
    _local = threading.local()
    
    def __init__(self, db_path: Optional[Path] = None):
        """
        Initialize LocalCache.
        
        Args:
            db_path: Path to SQLite database. Defaults to data dir.
        """
        if db_path is None:
            data_dir = get_data_dir()
            db_path = data_dir / CACHE_DB_NAME
        
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        self._init_schema()
    
    def _get_connection(self) -> sqlite3.Connection:
        """Get thread-local database connection."""
        if not hasattr(self._local, "connection") or self._local.connection is None:
            self._local.connection = sqlite3.connect(
                str(self.db_path),
                check_same_thread=False,
            )
            self._local.connection.row_factory = sqlite3.Row
            # Enable WAL mode for better concurrency
            self._local.connection.execute("PRAGMA journal_mode=WAL")
        return self._local.connection
    
    def _init_schema(self) -> None:
        """Initialize database schema."""
        conn = self._get_connection()
        
        conn.executescript("""
            -- Assets table (mirrors Hive assets)
            CREATE TABLE IF NOT EXISTS cache_assets (
                isin VARCHAR(12) PRIMARY KEY,
                name TEXT NOT NULL,
                asset_class VARCHAR(20) NOT NULL,
                base_currency VARCHAR(3) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- Listings table (mirrors Hive listings)
            CREATE TABLE IF NOT EXISTS cache_listings (
                ticker VARCHAR(30) NOT NULL,
                exchange VARCHAR(10) NOT NULL,
                isin VARCHAR(12) NOT NULL,
                currency VARCHAR(3) NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (ticker, exchange)
            );
            
            -- Aliases table (mirrors Hive aliases)
            CREATE TABLE IF NOT EXISTS cache_aliases (
                alias VARCHAR(100) NOT NULL,
                isin VARCHAR(12) NOT NULL,
                alias_type VARCHAR(20) DEFAULT 'name',
                contributor_count INTEGER DEFAULT 1,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (alias, isin)
            );
            
            -- Sync metadata
            CREATE TABLE IF NOT EXISTS cache_metadata (
                table_name VARCHAR(50) PRIMARY KEY,
                last_sync TIMESTAMP,
                row_count INTEGER DEFAULT 0
            );
            
            -- Indexes for fast lookup
            CREATE INDEX IF NOT EXISTS idx_cache_listings_ticker 
                ON cache_listings (UPPER(ticker));
            CREATE INDEX IF NOT EXISTS idx_cache_aliases_alias 
                ON cache_aliases (UPPER(alias));
            CREATE INDEX IF NOT EXISTS idx_cache_listings_isin 
                ON cache_listings (isin);
        """)
        
        conn.commit()
        logger.debug(f"LocalCache schema initialized at {self.db_path}")
```

---

### HIVE-202: Implement LocalCache CRUD Operations

**Add to `local_cache.py`:**

```python
    # =========================================================================
    # READ OPERATIONS
    # =========================================================================
    
    def get_isin_by_ticker(
        self, 
        ticker: str, 
        exchange: Optional[str] = None
    ) -> Optional[str]:
        """
        Look up ISIN by ticker symbol.
        
        Args:
            ticker: Ticker symbol (case-insensitive)
            exchange: Optional exchange filter
        
        Returns:
            ISIN if found, None otherwise
        """
        conn = self._get_connection()
        
        if exchange:
            cursor = conn.execute(
                """
                SELECT isin FROM cache_listings 
                WHERE UPPER(ticker) = UPPER(?) AND UPPER(exchange) = UPPER(?)
                LIMIT 1
                """,
                (ticker, exchange)
            )
        else:
            cursor = conn.execute(
                """
                SELECT isin FROM cache_listings 
                WHERE UPPER(ticker) = UPPER(?)
                LIMIT 1
                """,
                (ticker,)
            )
        
        row = cursor.fetchone()
        return row["isin"] if row else None
    
    def get_isin_by_alias(self, alias: str) -> Optional[str]:
        """
        Look up ISIN by name/alias (case-insensitive).
        
        Args:
            alias: Name or alias to search
        
        Returns:
            ISIN if found, None otherwise
        """
        if not alias or not alias.strip():
            return None
        
        conn = self._get_connection()
        cursor = conn.execute(
            """
            SELECT isin FROM cache_aliases 
            WHERE UPPER(alias) = UPPER(?)
            ORDER BY contributor_count DESC
            LIMIT 1
            """,
            (alias.strip(),)
        )
        
        row = cursor.fetchone()
        return row["isin"] if row else None
    
    def get_asset(self, isin: str) -> Optional[CachedAsset]:
        """Get asset details by ISIN."""
        conn = self._get_connection()
        cursor = conn.execute(
            "SELECT * FROM cache_assets WHERE isin = ?",
            (isin,)
        )
        
        row = cursor.fetchone()
        if row:
            return CachedAsset(
                isin=row["isin"],
                name=row["name"],
                asset_class=row["asset_class"],
                base_currency=row["base_currency"],
            )
        return None
    
    def batch_get_isins(
        self, 
        tickers: List[str]
    ) -> Dict[str, Optional[str]]:
        """
        Batch lookup ISINs for multiple tickers.
        
        Args:
            tickers: List of ticker symbols
        
        Returns:
            Dict mapping ticker -> ISIN (or None if not found)
        """
        if not tickers:
            return {}
        
        results = {t: None for t in tickers}
        conn = self._get_connection()
        
        # SQLite doesn't support array parameters, so we use IN clause
        placeholders = ",".join("?" * len(tickers))
        upper_tickers = [t.upper() for t in tickers]
        
        cursor = conn.execute(
            f"""
            SELECT ticker, isin FROM cache_listings 
            WHERE UPPER(ticker) IN ({placeholders})
            """,
            upper_tickers
        )
        
        for row in cursor:
            # Match back to original case
            for orig_ticker in tickers:
                if orig_ticker.upper() == row["ticker"].upper():
                    results[orig_ticker] = row["isin"]
                    break
        
        return results
    
    # =========================================================================
    # WRITE OPERATIONS
    # =========================================================================
    
    def upsert_asset(
        self,
        isin: str,
        name: str,
        asset_class: str,
        base_currency: str,
    ) -> bool:
        """Upsert a single asset."""
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO cache_assets (isin, name, asset_class, base_currency, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(isin) DO UPDATE SET
                    name = excluded.name,
                    asset_class = excluded.asset_class,
                    base_currency = excluded.base_currency,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (isin, name, asset_class, base_currency)
            )
            conn.commit()
            return True
        except Exception as e:
            logger.warning(f"Failed to upsert asset {isin}: {e}")
            return False
    
    def upsert_listing(
        self,
        ticker: str,
        exchange: str,
        isin: str,
        currency: str,
    ) -> bool:
        """Upsert a single listing."""
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO cache_listings (ticker, exchange, isin, currency, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(ticker, exchange) DO UPDATE SET
                    isin = excluded.isin,
                    currency = excluded.currency,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (ticker, exchange, isin, currency)
            )
            conn.commit()
            return True
        except Exception as e:
            logger.warning(f"Failed to upsert listing {ticker}: {e}")
            return False
    
    def upsert_alias(
        self,
        alias: str,
        isin: str,
        alias_type: str = "name",
        contributor_count: int = 1,
    ) -> bool:
        """Upsert a single alias."""
        conn = self._get_connection()
        try:
            conn.execute(
                """
                INSERT INTO cache_aliases (alias, isin, alias_type, contributor_count, updated_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(alias, isin) DO UPDATE SET
                    alias_type = excluded.alias_type,
                    contributor_count = excluded.contributor_count,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (alias, isin, alias_type, contributor_count)
            )
            conn.commit()
            return True
        except Exception as e:
            logger.warning(f"Failed to upsert alias {alias}: {e}")
            return False
    
    def bulk_upsert_assets(self, assets: List[Dict[str, Any]]) -> int:
        """Bulk upsert assets. Returns count of rows affected."""
        if not assets:
            return 0
        
        conn = self._get_connection()
        try:
            conn.executemany(
                """
                INSERT INTO cache_assets (isin, name, asset_class, base_currency, updated_at)
                VALUES (:isin, :name, :asset_class, :base_currency, CURRENT_TIMESTAMP)
                ON CONFLICT(isin) DO UPDATE SET
                    name = excluded.name,
                    asset_class = excluded.asset_class,
                    base_currency = excluded.base_currency,
                    updated_at = CURRENT_TIMESTAMP
                """,
                assets
            )
            conn.commit()
            return len(assets)
        except Exception as e:
            logger.error(f"Bulk upsert assets failed: {e}")
            return 0
    
    def bulk_upsert_listings(self, listings: List[Dict[str, Any]]) -> int:
        """Bulk upsert listings. Returns count of rows affected."""
        if not listings:
            return 0
        
        conn = self._get_connection()
        try:
            conn.executemany(
                """
                INSERT INTO cache_listings (ticker, exchange, isin, currency, updated_at)
                VALUES (:ticker, :exchange, :isin, :currency, CURRENT_TIMESTAMP)
                ON CONFLICT(ticker, exchange) DO UPDATE SET
                    isin = excluded.isin,
                    currency = excluded.currency,
                    updated_at = CURRENT_TIMESTAMP
                """,
                listings
            )
            conn.commit()
            return len(listings)
        except Exception as e:
            logger.error(f"Bulk upsert listings failed: {e}")
            return 0
    
    def bulk_upsert_aliases(self, aliases: List[Dict[str, Any]]) -> int:
        """Bulk upsert aliases. Returns count of rows affected."""
        if not aliases:
            return 0
        
        conn = self._get_connection()
        try:
            conn.executemany(
                """
                INSERT INTO cache_aliases (alias, isin, alias_type, contributor_count, updated_at)
                VALUES (:alias, :isin, :alias_type, :contributor_count, CURRENT_TIMESTAMP)
                ON CONFLICT(alias, isin) DO UPDATE SET
                    alias_type = excluded.alias_type,
                    contributor_count = excluded.contributor_count,
                    updated_at = CURRENT_TIMESTAMP
                """,
                aliases
            )
            conn.commit()
            return len(aliases)
        except Exception as e:
            logger.error(f"Bulk upsert aliases failed: {e}")
            return 0
```

---

### HIVE-203: Implement Sync Logic

**Add to `local_cache.py`:**

```python
    # =========================================================================
    # SYNC OPERATIONS
    # =========================================================================
    
    def sync_from_hive(self, hive_client: Any) -> Dict[str, int]:
        """
        Sync local cache from Hive.
        
        Args:
            hive_client: HiveClient instance
        
        Returns:
            Dict with counts: {"assets": N, "listings": N, "aliases": N}
        """
        logger.info("Starting LocalCache sync from Hive...")
        
        # Get data from Hive
        data = hive_client.sync_identity_domain()
        
        counts = {"assets": 0, "listings": 0, "aliases": 0}
        
        # Sync assets
        if data.get("assets"):
            counts["assets"] = self.bulk_upsert_assets(data["assets"])
            self._update_sync_metadata("assets", counts["assets"])
        
        # Sync listings
        if data.get("listings"):
            counts["listings"] = self.bulk_upsert_listings(data["listings"])
            self._update_sync_metadata("listings", counts["listings"])
        
        # Sync aliases
        if data.get("aliases"):
            counts["aliases"] = self.bulk_upsert_aliases(data["aliases"])
            self._update_sync_metadata("aliases", counts["aliases"])
        
        logger.info(
            f"LocalCache sync complete: "
            f"{counts['assets']} assets, "
            f"{counts['listings']} listings, "
            f"{counts['aliases']} aliases"
        )
        
        return counts
    
    def _update_sync_metadata(self, table_name: str, row_count: int) -> None:
        """Update sync metadata for a table."""
        conn = self._get_connection()
        conn.execute(
            """
            INSERT INTO cache_metadata (table_name, last_sync, row_count)
            VALUES (?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(table_name) DO UPDATE SET
                last_sync = CURRENT_TIMESTAMP,
                row_count = excluded.row_count
            """,
            (table_name, row_count)
        )
        conn.commit()
```

---

### HIVE-204: Implement Staleness Check

**Add to `local_cache.py`:**

```python
    # =========================================================================
    # STALENESS CHECK
    # =========================================================================
    
    def is_stale(self, max_age_hours: int = CACHE_TTL_HOURS) -> bool:
        """
        Check if cache is stale (older than max_age_hours).
        
        Returns True if ANY table is stale or never synced.
        """
        conn = self._get_connection()
        cursor = conn.execute(
            """
            SELECT table_name, last_sync FROM cache_metadata
            WHERE table_name IN ('assets', 'listings', 'aliases')
            """
        )
        
        rows = cursor.fetchall()
        
        # If no metadata, cache is stale
        if len(rows) < 3:
            return True
        
        cutoff = datetime.now() - timedelta(hours=max_age_hours)
        
        for row in rows:
            if row["last_sync"] is None:
                return True
            
            last_sync = datetime.fromisoformat(row["last_sync"])
            if last_sync < cutoff:
                return True
        
        return False
    
    def get_last_sync(self) -> Optional[datetime]:
        """Get the oldest last_sync timestamp across all tables."""
        conn = self._get_connection()
        cursor = conn.execute(
            """
            SELECT MIN(last_sync) as oldest_sync FROM cache_metadata
            WHERE table_name IN ('assets', 'listings', 'aliases')
            """
        )
        
        row = cursor.fetchone()
        if row and row["oldest_sync"]:
            return datetime.fromisoformat(row["oldest_sync"])
        return None
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        conn = self._get_connection()
        
        stats = {
            "db_path": str(self.db_path),
            "is_stale": self.is_stale(),
            "last_sync": None,
            "tables": {},
        }
        
        last_sync = self.get_last_sync()
        if last_sync:
            stats["last_sync"] = last_sync.isoformat()
        
        cursor = conn.execute(
            "SELECT table_name, last_sync, row_count FROM cache_metadata"
        )
        
        for row in cursor:
            stats["tables"][row["table_name"]] = {
                "last_sync": row["last_sync"],
                "row_count": row["row_count"],
            }
        
        return stats


# Singleton instance
_local_cache: Optional[LocalCache] = None


def get_local_cache() -> LocalCache:
    """Get or create the singleton LocalCache instance."""
    global _local_cache
    if _local_cache is None:
        _local_cache = LocalCache()
    return _local_cache
```

---

### HIVE-205: Unit Tests for LocalCache

**File:** `src-tauri/python/tests/test_local_cache.py`

```python
"""Unit tests for LocalCache."""

import pytest
import tempfile
from pathlib import Path
from portfolio_src.data.local_cache import LocalCache


@pytest.fixture
def temp_cache():
    """Create a temporary cache for testing."""
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = Path(tmpdir) / "test_cache.db"
        cache = LocalCache(db_path=db_path)
        yield cache


class TestLocalCacheSchema:
    """Tests for schema initialization."""
    
    def test_schema_creates_tables(self, temp_cache):
        """Should create all required tables."""
        conn = temp_cache._get_connection()
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )
        tables = {row[0] for row in cursor.fetchall()}
        
        assert "cache_assets" in tables
        assert "cache_listings" in tables
        assert "cache_aliases" in tables
        assert "cache_metadata" in tables


class TestLocalCacheRead:
    """Tests for read operations."""
    
    def test_get_isin_by_ticker_found(self, temp_cache):
        """Should return ISIN when ticker exists."""
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")
        
        result = temp_cache.get_isin_by_ticker("AAPL")
        assert result == "US0378331005"
    
    def test_get_isin_by_ticker_case_insensitive(self, temp_cache):
        """Should match ticker case-insensitively."""
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")
        
        assert temp_cache.get_isin_by_ticker("aapl") == "US0378331005"
        assert temp_cache.get_isin_by_ticker("Aapl") == "US0378331005"
    
    def test_get_isin_by_ticker_not_found(self, temp_cache):
        """Should return None when ticker not found."""
        result = temp_cache.get_isin_by_ticker("UNKNOWN")
        assert result is None
    
    def test_get_isin_by_alias_found(self, temp_cache):
        """Should return ISIN when alias exists."""
        temp_cache.upsert_alias("Apple Inc", "US0378331005")
        
        result = temp_cache.get_isin_by_alias("Apple Inc")
        assert result == "US0378331005"
    
    def test_get_isin_by_alias_case_insensitive(self, temp_cache):
        """Should match alias case-insensitively."""
        temp_cache.upsert_alias("Apple Inc", "US0378331005")
        
        assert temp_cache.get_isin_by_alias("apple inc") == "US0378331005"
    
    def test_batch_get_isins(self, temp_cache):
        """Should return dict of ticker -> ISIN."""
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")
        temp_cache.upsert_listing("MSFT", "NASDAQ", "US5949181045", "USD")
        
        result = temp_cache.batch_get_isins(["AAPL", "MSFT", "UNKNOWN"])
        
        assert result["AAPL"] == "US0378331005"
        assert result["MSFT"] == "US5949181045"
        assert result["UNKNOWN"] is None


class TestLocalCacheWrite:
    """Tests for write operations."""
    
    def test_upsert_asset(self, temp_cache):
        """Should insert and update asset."""
        # Insert
        result = temp_cache.upsert_asset(
            "US0378331005", "Apple Inc", "Equity", "USD"
        )
        assert result is True
        
        # Verify
        asset = temp_cache.get_asset("US0378331005")
        assert asset.name == "Apple Inc"
        
        # Update
        temp_cache.upsert_asset(
            "US0378331005", "Apple Inc.", "Equity", "USD"
        )
        asset = temp_cache.get_asset("US0378331005")
        assert asset.name == "Apple Inc."
    
    def test_bulk_upsert_listings(self, temp_cache):
        """Should bulk insert listings."""
        listings = [
            {"ticker": "AAPL", "exchange": "NASDAQ", "isin": "US0378331005", "currency": "USD"},
            {"ticker": "MSFT", "exchange": "NASDAQ", "isin": "US5949181045", "currency": "USD"},
        ]
        
        count = temp_cache.bulk_upsert_listings(listings)
        assert count == 2
        
        assert temp_cache.get_isin_by_ticker("AAPL") == "US0378331005"
        assert temp_cache.get_isin_by_ticker("MSFT") == "US5949181045"


class TestLocalCacheStaleness:
    """Tests for staleness checking."""
    
    def test_is_stale_when_empty(self, temp_cache):
        """Should be stale when no sync has occurred."""
        assert temp_cache.is_stale() is True
    
    def test_is_stale_after_sync(self, temp_cache):
        """Should not be stale immediately after sync."""
        temp_cache._update_sync_metadata("assets", 10)
        temp_cache._update_sync_metadata("listings", 20)
        temp_cache._update_sync_metadata("aliases", 5)
        
        assert temp_cache.is_stale() is False
    
    def test_get_stats(self, temp_cache):
        """Should return cache statistics."""
        temp_cache.upsert_listing("AAPL", "NASDAQ", "US0378331005", "USD")
        temp_cache._update_sync_metadata("listings", 1)
        
        stats = temp_cache.get_stats()
        
        assert "db_path" in stats
        assert "is_stale" in stats
        assert "tables" in stats
```

---

## Success Criteria

- [ ] `LocalCache` class created with SQLite schema
- [ ] CRUD operations work (upsert, get by ticker, get by alias)
- [ ] Bulk operations work for sync
- [ ] Staleness check returns correct values
- [ ] All unit tests pass
- [ ] Thread-safe (WAL mode, connection per thread)
