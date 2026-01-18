# core/services/aggregator.py
"""
Aggregator Service - Groups and sums exposures across all positions.

UI-agnostic, reusable with React.
"""

from typing import Dict, List, Tuple, cast, Any, Optional
import pandas as pd

from portfolio_src.core.errors import PipelineError, ErrorPhase, ErrorType
from portfolio_src.core.utils import (
    calculate_portfolio_total_value,
    get_isin_column,
    get_name_column,
    get_value_column,
    get_weight_column,
    SchemaNormalizer,
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
        Aggregate all positions into exposure report using vectorized operations.

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
            errors.append(
                PipelineError(
                    phase=ErrorPhase.AGGREGATION,
                    error_type=ErrorType.VALIDATION_FAILED,
                    item="direct_positions",
                    message="Input direct_positions must be a DataFrame",
                )
            )
            return pd.DataFrame(), errors

        if not isinstance(etf_positions, pd.DataFrame):
            errors.append(
                PipelineError(
                    phase=ErrorPhase.AGGREGATION,
                    error_type=ErrorType.VALIDATION_FAILED,
                    item="etf_positions",
                    message="Input etf_positions must be a DataFrame",
                )
            )
            return pd.DataFrame(), errors

        if not isinstance(holdings_map, dict):
            errors.append(
                PipelineError(
                    phase=ErrorPhase.AGGREGATION,
                    error_type=ErrorType.VALIDATION_FAILED,
                    item="holdings_map",
                    message="Input holdings_map must be a Dictionary",
                )
            )
            return pd.DataFrame(), errors

        try:
            all_exposures = []

            # Normalize inputs
            norm_direct = SchemaNormalizer.normalize_columns(direct_positions)
            norm_etf = SchemaNormalizer.normalize_columns(etf_positions)

            # Get total portfolio value for percentage calculation
            total_value = calculate_portfolio_total_value(norm_direct, norm_etf)

            # Process direct positions (Vectorized)
            if not norm_direct.empty:
                direct_exp = self._process_direct_positions(norm_direct)
                all_exposures.append(direct_exp)

            # Process ETF positions (Vectorized per ETF)
            if not norm_etf.empty:
                etf_exp = self._process_etf_positions(norm_etf, holdings_map)
                all_exposures.append(etf_exp)

            if not all_exposures:
                cols: Any = [
                    "isin",
                    "name",
                    "sector",
                    "geography",
                    "total_exposure",
                    "portfolio_percentage",
                ]
                return pd.DataFrame(columns=cols), errors

            combined = pd.concat(all_exposures, ignore_index=True)

            # Sort by confidence before groupby so 'first' picks highest confidence
            combined = self._sort_by_confidence(combined)

            agg_dict: Dict[str, Any] = {
                "name": "first",
                "sector": "first",
                "geography": "first",
                "total_exposure": "sum",
            }

            if "resolution_confidence" in combined.columns:
                agg_dict["resolution_confidence"] = "max"

            aggregated: Any = combined.groupby("isin", as_index=False).agg(agg_dict)

            if (
                "resolution_source" in combined.columns
                and "resolution_confidence" in combined.columns
            ):
                source_map: Dict[str, Any] = {}
                for isin, group in combined.groupby("isin"):
                    if group["resolution_confidence"].notna().any():
                        max_idx = group["resolution_confidence"].idxmax()
                        source_map[isin] = group.loc[max_idx, "resolution_source"]
                    else:
                        source_map[isin] = None
                aggregated["resolution_source"] = aggregated["isin"].map(source_map)
            if total_value > 0:
                aggregated["portfolio_percentage"] = (
                    aggregated["total_exposure"] / total_value * 100
                )
            else:
                aggregated["portfolio_percentage"] = 0.0

            # Sort by exposure
            aggregated = aggregated.sort_values("total_exposure", ascending=False)

            logger.info(
                f"Aggregation complete: {len(aggregated)} unique underlying assets identified"
            )
            return cast(pd.DataFrame, aggregated), errors

        except Exception as e:
            logger.error(f"Aggregation failed: {e}", exc_info=True)
            errors.append(
                PipelineError(
                    phase=ErrorPhase.AGGREGATION,
                    error_type=ErrorType.VALIDATION_FAILED,
                    item="aggregation",
                    message=f"Aggregation failed: {str(e)}",
                    fix_hint="Check holdings data format and column names",
                )
            )
            cols: Any = [
                "isin",
                "name",
                "sector",
                "geography",
                "total_exposure",
                "portfolio_percentage",
            ]
            return pd.DataFrame(columns=cols), errors

    def _process_direct_positions(self, direct_positions: pd.DataFrame) -> pd.DataFrame:
        """Process direct stock holdings into exposure format using vectorized operations."""
        if direct_positions.empty:
            return pd.DataFrame()

        name_col = get_name_column(direct_positions)
        if name_col:
            cash_mask = (
                direct_positions[name_col]
                .astype(str)
                .str.upper()
                .str.contains("CASH", na=False)
            )
            direct_positions = direct_positions[~cash_mask].copy()
            if direct_positions.empty:
                return pd.DataFrame()

        isin_col = get_isin_column(direct_positions)
        name_col = get_name_column(direct_positions)
        value_col = get_value_column(direct_positions)

        # Create a clean exposure DataFrame
        df = pd.DataFrame()
        df["isin"] = direct_positions[isin_col].astype(str) if isin_col else "Unknown"

        # Handle Name (fallback to TR_Name)
        if name_col:
            df["name"] = direct_positions[name_col].astype(str)
        elif "TR_Name" in direct_positions.columns:
            df["name"] = direct_positions["TR_Name"].astype(str)
        else:
            df["name"] = "Unknown"

        # Metadata
        df["sector"] = (
            direct_positions["sector"].astype(str)
            if "sector" in direct_positions.columns
            else "Unknown"
        )
        df["geography"] = (
            direct_positions["geography"].astype(str)
            if "geography" in direct_positions.columns
            else "Unknown"
        )

        # Exposure (Value) - calculate as quantity * price if no market_value
        if value_col and value_col == "market_value":
            # Direct market value column available
            vals = direct_positions[value_col]
            if isinstance(vals, pd.DataFrame):
                vals = vals.iloc[:, 0]
            numeric_vals = pd.to_numeric(cast(Any, vals), errors="coerce")
            df["total_exposure"] = getattr(numeric_vals, "fillna")(0.0)
        elif (
            "quantity" in direct_positions.columns
            and "price" in direct_positions.columns
        ):
            # Calculate from quantity * price
            qty = pd.to_numeric(direct_positions["quantity"], errors="coerce").fillna(0)
            price = pd.to_numeric(direct_positions["price"], errors="coerce").fillna(0)
            df["total_exposure"] = qty * price
        elif (
            "quantity" in direct_positions.columns
            and "current_price" in direct_positions.columns
        ):
            # Fallback: use current_price column name directly
            qty = pd.to_numeric(direct_positions["quantity"], errors="coerce").fillna(0)
            price = pd.to_numeric(
                direct_positions["current_price"], errors="coerce"
            ).fillna(0)
            df["total_exposure"] = qty * price
        else:
            logger.warning(
                f"Cannot calculate exposure: missing value columns. "
                f"Available: {list(direct_positions.columns)}"
            )
            df["total_exposure"] = 0.0

        if "resolution_confidence" in direct_positions.columns:
            df["resolution_confidence"] = direct_positions[
                "resolution_confidence"
            ].values

        if "resolution_source" in direct_positions.columns:
            df["resolution_source"] = direct_positions["resolution_source"].values

        return df

    def _process_etf_positions(
        self,
        etf_positions: pd.DataFrame,
        holdings_map: Dict[str, pd.DataFrame],
    ) -> pd.DataFrame:
        """Process ETF positions by decomposing into underlying holdings using vectorization."""
        if etf_positions.empty:
            return pd.DataFrame()

        isin_col = get_isin_column(etf_positions)
        value_col = get_value_column(etf_positions)

        all_etf_exposures = []

        for _, etf in etf_positions.iterrows():
            etf_isin = str(etf.get(isin_col, "")) if isin_col else ""

            val = etf.get(value_col, 0.0) if value_col else 0.0
            if isinstance(val, pd.Series):
                val = val.iloc[0]
            etf_value = float(val or 0.0)

            if etf_isin and etf_isin in holdings_map:
                holdings = holdings_map[etf_isin]
                # Vectorized calculation for this specific ETF
                norm_holdings = SchemaNormalizer.normalize_columns(holdings)
                weight_col = get_weight_column(norm_holdings)

                # Create exposure DF for this ETF
                df = pd.DataFrame()
                h_isin_col = get_isin_column(norm_holdings)
                h_name_col = get_name_column(norm_holdings)

                # Ensure we get a Series, not a DataFrame (in case of duplicate columns)
                def get_series(df_in, col_name):
                    if col_name not in df_in.columns:
                        return None
                    series = df_in[col_name]
                    if isinstance(series, pd.DataFrame):
                        return series.iloc[:, 0]
                    return series

                isin_series = (
                    get_series(norm_holdings, h_isin_col) if h_isin_col else None
                )
                name_series = (
                    get_series(norm_holdings, h_name_col) if h_name_col else None
                )

                df["isin"] = (
                    isin_series.astype(str) if isin_series is not None else "Unknown"
                )
                df["name"] = (
                    name_series.astype(str) if name_series is not None else "Unknown"
                )
                df["sector"] = (
                    norm_holdings["sector"].astype(str)
                    if "sector" in norm_holdings.columns
                    else "Unknown"
                )
                df["geography"] = (
                    norm_holdings["geography"].astype(str)
                    if "geography" in norm_holdings.columns
                    else "Unknown"
                )

                if weight_col:
                    numeric_weights = pd.to_numeric(
                        cast(Any, norm_holdings[weight_col]), errors="coerce"
                    )
                    weights = getattr(numeric_weights, "fillna")(0.0)
                    df["total_exposure"] = etf_value * (cast(Any, weights) / 100.0)
                else:
                    count = len(norm_holdings)
                    df["total_exposure"] = etf_value / count if count > 0 else 0.0

                if "resolution_confidence" in norm_holdings.columns:
                    df["resolution_confidence"] = norm_holdings[
                        "resolution_confidence"
                    ].values

                if "resolution_source" in norm_holdings.columns:
                    df["resolution_source"] = norm_holdings["resolution_source"].values

                all_etf_exposures.append(df)
            else:
                # No holdings data, treat entire ETF as single exposure
                all_etf_exposures.append(
                    pd.DataFrame(
                        [
                            {
                                "isin": etf_isin or "Unknown",
                                "name": str(
                                    etf.get("name", etf.get("TR_Name", "Unknown ETF"))
                                ),
                                "sector": "ETF",
                                "geography": "Global",
                                "total_exposure": etf_value,
                            }
                        ]
                    )
                )

        if not all_etf_exposures:
            return pd.DataFrame()

        return pd.concat(all_etf_exposures, ignore_index=True)

    def _sort_by_confidence(self, df: pd.DataFrame) -> pd.DataFrame:
        """Sort DataFrame so highest confidence rows come first per ISIN.

        When confidence is equal, prefer non-'Unknown' values.
        This ensures 'first' aggregation picks the best data source.
        """
        if df.empty:
            return df

        if "resolution_confidence" not in df.columns:
            return df

        df = df.copy()

        confidence_sort_key = df["resolution_confidence"].fillna(0.0)
        df["_conf_sort"] = confidence_sort_key

        unknown_penalty = (
            (df["name"].fillna("").astype(str) == "Unknown").astype(int)
            + (df["sector"].fillna("").astype(str) == "Unknown").astype(int)
            + (df["geography"].fillna("").astype(str) == "Unknown").astype(int)
        )
        df["_unknown_count"] = unknown_penalty

        df = df.sort_values(
            ["_conf_sort", "_unknown_count"],
            ascending=[False, True],
        )

        df = df.drop(columns=["_conf_sort", "_unknown_count"])

        logger.debug(
            f"Sorted {len(df)} rows by confidence for highest-quality aggregation"
        )

        return df
