"""Sync Service - Business logic for Trade Republic synchronization and pipeline execution."""

import json
import re
import time
import urllib.parse
import urllib.request
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from portfolio_src.models import AssetClass
from portfolio_src.models.sync import (
    ClassifiedPosition,
    PipelineResult,
    PortfolioSyncResult,
)
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

# Wikidata entity types for classification
STOCK_ENTITY_TYPES = {
    "Q4830453",  # business enterprise
    "Q6881511",  # enterprise
    "Q783794",  # company
    "Q891723",  # public company
}

ETF_ENTITY_TYPES = {
    "Q215380",  # exchange-traded fund
    "Q178790",  # mutual fund
    "Q180490",  # investment fund
}


class AssetClassifier:
    """Classifies assets by ISIN using cache, Wikidata, and heuristics."""

    def classify(self, isin: str, name: str) -> AssetClass:
        """Determine asset class using multi-tier approach.

        Order: 1) Local cache, 2) Wikidata API, 3) Heuristics.
        Results from Wikidata are cached for future lookups.
        """
        cached = self._get_from_cache(isin)
        if cached is not None:
            logger.debug(
                "Asset class from cache",
                extra={"isin": isin, "asset_class": cached.value},
            )
            return cached

        wikidata = self._query_wikidata(isin)
        if wikidata is not None:
            self._save_to_cache(isin, name, wikidata)
            return wikidata

        heuristic = self._detect_by_heuristics(isin, name)
        logger.debug(
            "Asset class from heuristics",
            extra={"isin": isin, "asset_class": heuristic.value},
        )
        return heuristic

    def _get_from_cache(self, isin: str) -> AssetClass | None:
        try:
            from portfolio_src.data.local_cache import LocalCache

            cache = LocalCache()
            asset = cache.get_asset(isin)
            if asset:
                return self._parse_asset_class_string(asset.asset_class)
        except Exception as e:
            logger.debug(
                "Cache lookup failed",
                extra={"isin": isin, "error": str(e), "error_type": type(e).__name__},
                exc_info=True,
            )
        return None

    def _parse_asset_class_string(self, asset_class_str: str) -> AssetClass:
        mapping = {
            "equity": AssetClass.STOCK,
            "stock": AssetClass.STOCK,
            "etf": AssetClass.ETF,
            "crypto": AssetClass.CRYPTO,
            "cryptocurrency": AssetClass.CRYPTO,
            "bond": AssetClass.BOND,
            "fund": AssetClass.FUND,
        }
        return mapping.get(asset_class_str.lower(), AssetClass.STOCK)

    def _save_to_cache(self, isin: str, name: str, asset_class: AssetClass) -> None:
        try:
            from portfolio_src.data.local_cache import LocalCache

            cache = LocalCache()
            display_name = {
                AssetClass.STOCK: "Equity",
                AssetClass.ETF: "ETF",
                AssetClass.CRYPTO: "Crypto",
                AssetClass.BOND: "Bond",
                AssetClass.FUND: "Fund",
                AssetClass.CASH: "Cash",
                AssetClass.DERIVATIVE: "Derivative",
            }.get(asset_class, "Equity")
            cache.upsert_asset(isin, name, display_name, "EUR")
            logger.debug("Cached asset class", extra={"isin": isin, "display_name": display_name})
        except Exception as e:
            logger.debug(
                "Failed to cache asset class",
                extra={"isin": isin, "error": str(e), "error_type": type(e).__name__},
                exc_info=True,
            )

    def _query_wikidata(self, isin: str) -> AssetClass | None:
        query = f"""
        SELECT ?type WHERE {{
          ?item wdt:P946 "{isin}" .
          ?item wdt:P31 ?type .
        }} LIMIT 10
        """
        url = "https://query.wikidata.org/sparql"
        params = urllib.parse.urlencode({"query": query, "format": "json"})
        full_url = f"{url}?{params}"

        try:
            req = urllib.request.Request(
                full_url,
                headers={"User-Agent": "PortfolioPrism/1.0 (asset-classification)"},
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode("utf-8"))

            bindings = data.get("results", {}).get("bindings", [])
            if not bindings:
                logger.debug("Wikidata: No results for ISIN", extra={"isin": isin})
                return None

            for binding in bindings:
                type_uri = binding.get("type", {}).get("value", "")
                if "/entity/" in type_uri:
                    q_id = type_uri.split("/entity/")[-1]
                    if q_id in STOCK_ENTITY_TYPES:
                        logger.info(
                            "Wikidata: classified as STOCK", extra={"isin": isin, "type_id": q_id}
                        )
                        return AssetClass.STOCK
                    if q_id in ETF_ENTITY_TYPES:
                        logger.info(
                            "Wikidata: classified as ETF", extra={"isin": isin, "type_id": q_id}
                        )
                        return AssetClass.ETF

            logger.debug(
                "Wikidata: found but no definitive type, assuming STOCK", extra={"isin": isin}
            )
            return AssetClass.STOCK

        except Exception as e:
            logger.debug(
                "Wikidata query failed",
                extra={"isin": isin, "error": str(e), "error_type": type(e).__name__},
                exc_info=True,
            )
            return None

    def _detect_by_heuristics(self, isin: str, name: str) -> AssetClass:
        name_upper = name.upper()
        isin_upper = isin.upper()

        # Crypto detection (ETP/ETC products)
        crypto_keywords = ["BITCOIN", "ETHEREUM", "CRYPTO", "BTC", "ETH"]
        crypto_isin_prefixes = ["XF000BTC", "XF000ETH", "CH0454664"]
        if any(kw in name_upper for kw in crypto_keywords):
            return AssetClass.CRYPTO
        if any(isin_upper.startswith(prefix) for prefix in crypto_isin_prefixes):
            return AssetClass.CRYPTO

        # ETF detection by name patterns
        etf_name_patterns = [
            r"\(ACC\)",
            r"\(DIST\)",
            r"\bETF\b",
            r"\bUCITS\b",
            r"\bMSCI\b",
            r"\bS&P\s*500\b",
            r"\bNASDAQ\s*100\b",
            r"\bSTOXX\b",
            r"\bFTSE\b",
            r"\bCORE\b.*\b(USD|EUR|GBP)\b",
            r"\bINDEX\b",
            r"\bTRACKER\b",
        ]
        for pattern in etf_name_patterns:
            if re.search(pattern, name_upper):
                return AssetClass.ETF

        etf_isin_prefixes = [
            "IE00B",
            "IE00BF",
            "IE00BK",
            "IE00BL",  # iShares Ireland
            "IE0031",  # Vanguard Ireland
            "LU0",
            "LU1",
            "LU2",  # Luxembourg funds
            "FR0010",
            "FR0011",  # Amundi France
            "DE000A0F",
            "DE000A0H",  # Xtrackers Germany
        ]
        for prefix in etf_isin_prefixes:
            if isin_upper.startswith(prefix):
                # Double-check it's not a single stock by checking name
                corporate_suffixes = ["AG", "SE", "INC", "CORP", "LTD", "PLC", "GMBH", "HOLDING"]
                if not any(x in name_upper for x in corporate_suffixes):
                    return AssetClass.ETF

        return AssetClass.STOCK


class SyncService:
    """Orchestrates Trade Republic sync and analytics pipeline execution.

    Encapsulates the business logic for:
    - Authenticating/restoring TR sessions
    - Fetching and classifying portfolio positions
    - Writing to database
    - Running analytics pipeline
    """

    def __init__(self) -> None:
        self._classifier = AssetClassifier()

    def sync_portfolio(
        self,
        portfolio_id: int,
        progress_callback: Callable[[int, str, str], None] | None = None,
    ) -> PortfolioSyncResult:
        """Synchronize portfolio data from Trade Republic.

        Args:
            portfolio_id: Portfolio ID to sync (typically 1).
            progress_callback: Optional callback(progress%, message, phase).

        Returns:
            PortfolioSyncResult with sync statistics.

        Raises:
            AuthenticationError: If TR session is invalid/expired.
            SyncError: If sync operation fails.
        """
        from portfolio_src.data.database import sync_positions_from_tr, update_sync_state
        from portfolio_src.data.tr_sync import TRDataFetcher
        from portfolio_src.headless.state import get_auth_manager, get_bridge, get_executor

        def emit(progress: int, message: str, phase: str = "sync") -> None:
            if progress_callback:
                progress_callback(progress, message, phase)

        emit(0, "Starting sync...", "sync")
        start_time = time.time()

        bridge = get_bridge()
        executor = get_executor()
        status = self._get_bridge_status_sync(bridge, executor)

        # Restore session if needed
        if status.get("status") != "authenticated":
            emit(2, "Restoring session...", "sync")
            auth_manager = get_auth_manager()
            import asyncio

            loop = asyncio.new_event_loop()
            try:
                restore_result = loop.run_until_complete(auth_manager.try_restore_session())
            finally:
                loop.close()

            if restore_result.success:
                emit(5, "Session restored.", "sync")
                status = self._get_bridge_status_sync(bridge, executor)
            else:
                logger.warning(
                    "Session restoration failed", extra={"message": restore_result.message}
                )

        if status.get("status") != "authenticated":
            raise AuthenticationError("Please authenticate with Trade Republic first")

        emit(10, "Connecting to Trade Republic...", "sync")

        fetcher = TRDataFetcher(bridge)
        emit(30, "Fetching portfolio...", "sync")

        raw_positions = self._fetch_positions_sync(fetcher, executor)

        emit(50, f"Processing {len(raw_positions)} positions...", "sync")

        classified, counts = self._classify_positions(raw_positions)

        emit(70, "Writing to database...", "sync")

        # Convert to format expected by database
        db_positions = [
            {
                "isin": p.isin,
                "name": p.name,
                "symbol": p.symbol,
                "quantity": p.quantity,
                "cost_basis": p.cost_basis,
                "current_price": p.current_price,
                "asset_class": p.asset_class,
            }
            for p in classified
        ]

        sync_result = sync_positions_from_tr(portfolio_id, db_positions)
        update_sync_state(
            "trade_republic",
            "success",
            f"Synced {sync_result['synced_positions']} positions",
        )

        duration_ms = int((time.time() - start_time) * 1000)
        emit(100, "Sync complete!", "sync")

        logger.info(
            "Portfolio sync complete",
            extra={
                "synced_positions": sync_result["synced_positions"],
                "duration_ms": duration_ms,
            },
        )

        return PortfolioSyncResult(
            synced_positions=sync_result["synced_positions"],
            new_positions=sync_result["new_positions"],
            updated_positions=sync_result["updated_positions"],
            total_value=sync_result["total_value"],
            duration_ms=duration_ms,
            etf_count=counts["etf"],
            crypto_count=counts["crypto"],
            stock_count=counts["stock"],
        )

    def run_pipeline(
        self,
        progress_callback: Callable[[int, str, str], None] | None = None,
    ) -> PipelineResult:
        """Run the analytics pipeline (decomposition, enrichment, aggregation).

        Args:
            progress_callback: Optional callback(progress%, message, phase).

        Returns:
            PipelineResult with success status and any errors.
        """
        from portfolio_src.core.pipeline import Pipeline

        def emit(progress: int, message: str, phase: str = "pipeline") -> None:
            if progress_callback:
                progress_callback(progress, message, phase)

        emit(0, "Starting analytics pipeline...", "pipeline")
        start_time = time.time()

        def pipeline_progress(msg: str, pct: float, phase: str = "pipeline") -> None:
            time.sleep(0.1)  # Small delay to prevent flooding
            emit(int(pct * 100), msg, phase)

        pipeline = Pipeline()
        result = pipeline.run(pipeline_progress)

        duration_ms = int((time.time() - start_time) * 1000)

        if not result.success:
            emit(100, "Analytics completed with warnings.", "complete")
            logger.warning(
                "Pipeline completed with errors", extra={"error_count": len(result.errors)}
            )
            return PipelineResult(
                success=False,
                errors=[str(e) for e in result.errors],
                duration_ms=duration_ms,
            )

        emit(100, "Analytics complete!", "complete")
        logger.info("Pipeline complete", extra={"duration_ms": duration_ms})
        return PipelineResult(success=True, errors=[], duration_ms=duration_ms)

    def _get_bridge_status_sync(self, bridge: Any, executor: ThreadPoolExecutor) -> dict[str, Any]:
        future = executor.submit(bridge.get_status)
        return future.result(timeout=30)

    def _fetch_positions_sync(
        self, fetcher: Any, executor: ThreadPoolExecutor
    ) -> list[dict[str, Any]]:
        future = executor.submit(fetcher.fetch_portfolio_sync)
        return future.result(timeout=120)

    def _classify_positions(
        self, raw_positions: list[dict[str, Any]]
    ) -> tuple[list[ClassifiedPosition], dict[str, int]]:
        """Classify all positions and return with counts."""
        classified: list[ClassifiedPosition] = []
        counts = {"etf": 0, "crypto": 0, "stock": 0}

        for pos in raw_positions:
            isin = pos["isin"]
            name = pos["name"]
            asset_class = self._classifier.classify(isin, name)

            if asset_class == AssetClass.ETF:
                counts["etf"] += 1
            elif asset_class == AssetClass.CRYPTO:
                counts["crypto"] += 1
            else:
                counts["stock"] += 1

            classified.append(
                ClassifiedPosition(
                    isin=isin,
                    name=name,
                    symbol="",
                    quantity=pos["quantity"],
                    cost_basis=pos["avg_cost"],
                    current_price=pos["current_price"],
                    asset_class=asset_class.value,
                )
            )

        logger.info(
            "Classified positions",
            extra={
                "total_classified": len(classified),
                "etf_count": counts["etf"],
                "crypto_count": counts["crypto"],
                "stock_count": counts["stock"],
            },
        )
        return classified, counts

    def record_sync_error(self, error: str) -> None:
        from portfolio_src.data.database import update_sync_state

        update_sync_state("trade_republic", "error", error)


class AuthenticationError(Exception):
    """Raised when Trade Republic authentication fails or is required."""

    pass


class SyncError(Exception):
    """Raised when portfolio synchronization fails."""

    pass
