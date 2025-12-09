# src-tauri/python/portfolio_src/data/tr_sync.py
"""
Trade Republic Data Sync Module

Replaces POC/scripts/fetch_tr_api.py with direct library calls.
Fetches portfolio data using pytr library and saves to CSV.
"""


from pathlib import Path
from typing import Optional, List, Dict, Any

from ..prism_utils.logging_config import get_logger

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
                raise RuntimeError(f"Daemon error: {response.get('message')}")
                
            data = response.get("data", {})
            raw_positions = data.get("positions", [])
            
            # Use raw_positions directly if it's the list, otherwise check structure
            # tr_daemon returns {"positions": [...], "cash": ...} in data
            # So raw_positions is the list.

            if raw_positions and len(raw_positions) > 0:
                logger.warning(f"DEBUG: First TR position keys: {list(raw_positions[0].keys())}")
                logger.warning(f"DEBUG: First TR position content: {raw_positions[0]}")
            
            positions = []
            for pos in raw_positions:
                # IMPORTANT: netSize and averageBuyIn are STRINGS, not floats!
                quantity = float(pos.get("netSize", "0"))
                avg_cost = float(pos.get("averageBuyIn", "0"))
                net_value = float(pos.get("netValue", 0))
                
                # Calculate current price (no "price" key in pytr output)
                current_price = net_value / quantity if quantity > 0 else 0
                
                positions.append({
                    "isin": pos["instrumentId"],
                    "name": pos.get("name", "Unknown"),
                    "quantity": quantity,
                    "avg_cost": avg_cost,
                    "current_price": current_price,
                    "net_value": net_value,
                })
            
            logger.info(f"Fetched {len(positions)} positions from Trade Republic")
            return positions
            
        except Exception as e:
            logger.error(f"Failed to fetch portfolio: {e}")
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
