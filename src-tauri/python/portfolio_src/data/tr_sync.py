# src-tauri/python/portfolio_src/data/tr_sync.py
"""
Trade Republic Data Sync Module

Replaces POC/scripts/fetch_tr_api.py with direct library calls.
Fetches portfolio data using pytr library and saves to CSV.
"""

from pathlib import Path
from typing import Optional, List, Dict, Any

from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class TRDataFetcher:
    """
    Fetches portfolio data from Trade Republic via TR Daemon.

    Usage:
        fetcher = TRDataFetcher(bridge)
        positions = fetcher.fetch_portfolio_sync()
        fetcher.save_to_csv(positions, output_path)
    """

    def __init__(self, bridge):
        """
        Initialize with TRBridge instance.

        Args:
            bridge: TRBridge instance from TRAuthManager.bridge
        """
        self.bridge = bridge

    def fetch_portfolio_sync(self) -> List[Dict[str, Any]]:
        """
        Fetch portfolio positions via daemon.

        Returns:
            List of position dicts
        """
        try:
            logger.info("Requesting portfolio from daemon...")
            response = self.bridge.fetch_portfolio()

            if response.get("status") != "success":
                msg = response.get("message") or "Unknown daemon error"
                logger.error(f"Trade Republic fetch failed: {msg}")
                raise RuntimeError(msg)

            data = response.get("data", {})
            raw_positions = data.get("positions", [])

            if not raw_positions:
                cash = data.get("cash", [])
                if cash:
                    logger.info("Portfolio is empty but cash found.")
                    return []
                else:
                    logger.warning(
                        "No positions or cash found in Trade Republic portfolio"
                    )
                    return []

            positions = []
            for pos in raw_positions:
                try:
                    # IMPORTANT: netSize and averageBuyIn are STRINGS, not floats!
                    quantity = float(pos.get("netSize", "0"))
                    avg_cost = float(pos.get("averageBuyIn", "0"))
                    net_value = float(pos.get("netValue", 0))

                    # Calculate current price (no "price" key in pytr output)
                    current_price = net_value / quantity if quantity > 0 else 0

                    positions.append(
                        {
                            "isin": pos["instrumentId"],
                            "name": pos.get("name", "Unknown"),
                            "quantity": quantity,
                            "avg_cost": avg_cost,
                            "current_price": current_price,
                            "net_value": net_value,
                        }
                    )
                except (KeyError, ValueError) as e:
                    logger.warning(f"Skipping malformed position: {e}")
                    continue

            logger.info(
                f"Successfully fetched {len(positions)} positions from Trade Republic"
            )
            return positions

        except Exception as e:
            err_msg = str(e)
            if any(
                x in err_msg.lower() for x in ["session", "expired", "unauthorized"]
            ):
                logger.error(f"Trade Republic session invalid: {err_msg}")
            else:
                logger.error(f"Sync error: {err_msg}")
            raise

    def save_to_csv(self, positions: List[Dict], output_path: Path) -> int:
        """
        Save positions to CSV in pipeline-compatible format.

        Format: ISIN,Quantity,AvgCost,CurrentPrice,NetValue,TR_Name
        (Compatible with state_manager.py expectations)

        Args:
            positions: List of position dicts from fetch_portfolio
            output_path: Path to save CSV file

        Returns:
            Number of positions saved
        """
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write("ISIN,Quantity,AvgCost,CurrentPrice,NetValue,TR_Name\n")
            for pos in positions:
                # Escape name for CSV
                name = pos["name"].replace('"', '""')
                if "," in name or '"' in name:
                    name = f'"{name}"'

                f.write(
                    f"{pos['isin']},{pos['quantity']:.6f},{pos['avg_cost']:.4f},"
                    f"{pos['current_price']:.4f},{pos['net_value']:.2f},{name}\n"
                )

        logger.info(f"Saved {len(positions)} positions to {output_path}")
        return len(positions)
