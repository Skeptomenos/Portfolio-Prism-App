"""
Wikidata Enrichment Service — Bulk SPARQL for sector/geography metadata.

Uses Wikidata's SPARQL endpoint with VALUES clause to enrich up to 1000 ISINs
in a single POST request. Returns sector (P452) and country (P17) for each ISIN.

This replaces the per-ISIN Finnhub API approach which caused 30min+ timeouts.
"""

import requests
from typing import Dict, List, Optional
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)

WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
WIKIDATA_TIMEOUT = 60
WIKIDATA_BATCH_SIZE = 1000  # Max ISINs per query


class WikidataEnrichmentService:
    """Enriches ISINs with sector and geography via Wikidata bulk SPARQL."""

    def enrich_batch(self, isins: List[str]) -> Dict[str, dict]:
        """
        Fetch sector and geography for a batch of ISINs from Wikidata.

        Uses SPARQL VALUES clause with POST request. Handles multiple rows per ISIN
        by taking the first sector result and always taking country.

        Args:
            isins: List of ISIN strings (up to 1000 per batch).

        Returns:
            Dict mapping ISIN to {"sector": str, "geography": str, "name": str}.
            ISINs not found in Wikidata are omitted from the result.
        """
        if not isins:
            return {}

        results: Dict[str, dict] = {}

        # Process in batches of WIKIDATA_BATCH_SIZE
        for i in range(0, len(isins), WIKIDATA_BATCH_SIZE):
            batch = isins[i : i + WIKIDATA_BATCH_SIZE]
            batch_results = self._query_batch(batch)
            results.update(batch_results)

        return results

    def _query_batch(self, isins: List[str]) -> Dict[str, dict]:
        """Execute a single SPARQL query for a batch of ISINs."""
        values_str = " ".join(f'"{isin}"' for isin in isins)

        query = f"""
        SELECT ?isin ?companyLabel ?countryLabel ?sectorLabel WHERE {{
          VALUES ?isin {{ {values_str} }}
          ?company wdt:P946 ?isin.
          OPTIONAL {{ ?company wdt:P17 ?country. }}
          OPTIONAL {{ ?company wdt:P452 ?sector. }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
        """

        try:
            response = requests.post(
                WIKIDATA_SPARQL_URL,
                data={"query": query, "format": "json"},
                headers={
                    "User-Agent": "PortfolioPrism/1.0 (https://github.com/portfolio-prism)",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                timeout=WIKIDATA_TIMEOUT,
            )
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            logger.warning(
                "Wikidata SPARQL query failed",
                extra={"error": str(e), "isin_count": len(isins)},
            )
            return {}

        data = response.json()
        rows = data.get("results", {}).get("bindings", [])

        logger.info(
            "Wikidata SPARQL response",
            extra={
                "isins_queried": len(isins),
                "rows_returned": len(rows),
            },
        )

        # Deduplicate: take first sector per ISIN, always take country
        results: Dict[str, dict] = {}
        for row in rows:
            isin = row.get("isin", {}).get("value", "")
            if not isin:
                continue

            if isin not in results:
                results[isin] = {
                    "isin": isin,
                    "name": row.get("companyLabel", {}).get("value", "Unknown"),
                    "sector": "Unknown",
                    "geography": "Unknown",
                }

            # Take first non-Unknown sector
            if results[isin]["sector"] == "Unknown":
                sector = row.get("sectorLabel", {}).get("value", "")
                if sector:
                    results[isin]["sector"] = sector

            # Take first non-Unknown country
            if results[isin]["geography"] == "Unknown":
                country = row.get("countryLabel", {}).get("value", "")
                if country:
                    results[isin]["geography"] = country

        found = len(results)
        with_sector = sum(1 for r in results.values() if r["sector"] != "Unknown")
        with_geo = sum(1 for r in results.values() if r["geography"] != "Unknown")

        logger.info(
            "Wikidata enrichment complete",
            extra={
                "isins_found": found,
                "with_sector": with_sector,
                "with_geography": with_geo,
            },
        )

        return results
