# core/services/aggregator.py
"""
Aggregator Service - Groups and sums exposures across all positions.

UI-agnostic, reusable with React.
"""

from typing import Dict, List, Tuple
import pandas as pd

from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType
from portfolio_src.core.utils import (
    calculate_portfolio_total_value,
    get_isin_column,
    get_name_column,
    get_value_column,
    get_weight_column
)
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)


class Aggregator:
    """Aggregates holdings into exposure report. UI-agnostic."""

    def aggregate(
        self,
        direct_positions: pd.DataFrame,
        etf_positions: pd.DataFrame,
        holdings_map: Dict[str, pd.DataFrame],
    ) -> Tuple[pd.DataFrame, List[PipelineError]]:
        """
        Aggregate all positions into exposure report.

        Args:
            direct_positions: DataFrame of direct stock holdings
            etf_positions: DataFrame of ETF positions
            holdings_map: {etf_isin: enriched_holdings_df}

        Returns:
            Tuple of (exposure_df, errors)
            - exposure_df: DataFrame with columns [isin, name, sector, geography, total_exposure, portfolio_percentage]
            - errors: List of PipelineError for any issues encountered
        """
        errors = []
        
        # BASIC VALIDATION
        if not isinstance(direct_positions, pd.DataFrame):
            errors.append(PipelineError(
                phase=ErrorPhase.AGGREGATION,
                error_type=ErrorType.VALIDATION_FAILED,
                item="direct_positions",
                message="Input direct_positions must be a DataFrame"
            ))
            return pd.DataFrame(), errors

        if not isinstance(etf_positions, pd.DataFrame):
            errors.append(PipelineError(
                phase=ErrorPhase.AGGREGATION,
                error_type=ErrorType.VALIDATION_FAILED,
                item="etf_positions",
                message="Input etf_positions must be a DataFrame"
            ))
            return pd.DataFrame(), errors

        if not isinstance(holdings_map, dict):
            errors.append(PipelineError(
                phase=ErrorPhase.AGGREGATION,
                error_type=ErrorType.VALIDATION_FAILED,
                item="holdings_map",
                message="Input holdings_map must be a Dictionary"
            ))
            return pd.DataFrame(), errors

        try:
            all_exposures = []
            
            # Get total portfolio value for percentage calculation
            total_value = calculate_portfolio_total_value(direct_positions, etf_positions)
            
            # Process direct positions
            if not direct_positions.empty:
                direct_exp = self._process_direct_positions(direct_positions)
                all_exposures.append(direct_exp)
            
            # Process ETF positions
            if not etf_positions.empty:
                etf_exp = self._process_etf_positions(etf_positions, holdings_map)
                all_exposures.append(etf_exp)
            
            if not all_exposures:
                return pd.DataFrame(columns=[
                    "isin", "name", "sector", "geography", 
                    "total_exposure", "portfolio_percentage"
                ]), errors
            
            # Combine all exposures
            combined = pd.concat(all_exposures, ignore_index=True)
            
            # Group by underlying ISIN
            aggregated = combined.groupby("isin", as_index=False).agg({
                "name": "first",
                "sector": "first",
                "geography": "first",
                "total_exposure": "sum",
            })
            
            # Calculate percentages
            aggregated["portfolio_percentage"] = (
                aggregated["total_exposure"] / total_value * 100
            ) if total_value > 0 else 0
            
            # Sort by exposure
            aggregated = aggregated.sort_values("total_exposure", ascending=False)
            
            logger.info(f"Aggregation complete: {len(aggregated)} unique exposures")
            return aggregated, errors
            
        except Exception as e:
            logger.error(f"Aggregation failed: {e}", exc_info=True)
            errors.append(PipelineError(
                phase=ErrorPhase.AGGREGATION,
                error_type=ErrorType.VALIDATION_FAILED,
                item="aggregation",
                message=f"Aggregation failed: {str(e)}",
                fix_hint="Check holdings data format and column names"
            ))
            return pd.DataFrame(columns=[
                "isin", "name", "sector", "geography", 
                "total_exposure", "portfolio_percentage"
            ]), errors

    def _process_direct_positions(
        self, direct_positions: pd.DataFrame
    ) -> pd.DataFrame:
        """Process direct stock holdings into exposure format."""
        isin_col = get_isin_column(direct_positions)
        name_col = get_name_column(direct_positions)
        value_col = get_value_column(direct_positions)
        
        exposures = []
        for _, pos in direct_positions.iterrows():
            exposures.append({
                "isin": pos.get(isin_col, ""),
                "name": pos.get(name_col, pos.get("TR_Name", "Unknown")),
                "sector": pos.get("sector", "Unknown"),
                "geography": pos.get("geography", "Unknown"),
                "total_exposure": pos.get(value_col, 0),
            })
        
        return pd.DataFrame(exposures)

    def _process_etf_positions(
        self,
        etf_positions: pd.DataFrame,
        holdings_map: Dict[str, pd.DataFrame],
    ) -> pd.DataFrame:
        """Process ETF positions by decomposing into underlying holdings."""
        isin_col = get_isin_column(etf_positions)
        value_col = get_value_column(etf_positions)
        
        exposures = []
        
        for _, etf in etf_positions.iterrows():
            etf_isin = etf.get(isin_col, "")
            etf_value = etf.get(value_col, 0)
            
            if etf_isin in holdings_map:
                holdings = holdings_map[etf_isin]
                etf_exposures = self._calculate_holdings_exposure(holdings, etf_value)
                exposures.extend(etf_exposures)
            else:
                # No holdings data, treat entire ETF as single exposure
                exposures.append({
                    "isin": etf_isin,
                    "name": etf.get("Name", etf.get("TR_Name", "Unknown ETF")),
                    "sector": "ETF",
                    "geography": "Global",
                    "total_exposure": etf_value,
                })
        
        return pd.DataFrame(exposures)

    def _calculate_holdings_exposure(
        self, holdings: pd.DataFrame, etf_value: float
    ) -> List[Dict]:
        """Calculate exposure for underlying holdings of a single ETF."""
        etf_value = etf_value or 0.0  # Handle None or invalid values
        exposures = []
        
        # Determine weight column or use equal weight
        weight_col = get_weight_column(holdings)
        
        current_holdings = holdings.copy()
        if weight_col is None:
            # No weight column, distribute equally
            equal_weight = 100.0 / len(holdings) if len(holdings) > 0 else 0
            current_holdings["weight"] = equal_weight
            weight_col = "weight"
            
        h_isin_col = get_isin_column(current_holdings)
        h_name_col = get_name_column(current_holdings)
        
        for _, holding in current_holdings.iterrows():
            weight = holding.get(weight_col, 0) / 100  # Convert to decimal
            exposure = etf_value * weight
            
            exposures.append({
                "isin": holding.get(h_isin_col, ""),
                "name": holding.get(h_name_col, "Unknown"),
                "sector": holding.get("sector", "Unknown"),
                "geography": holding.get("geography", "Unknown"),
                "total_exposure": exposure,
            })
            
        return exposures
