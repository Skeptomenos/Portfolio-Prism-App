"""
Exposure aggregation models.

Defines the structure for aggregated exposure records,
representing the final "true exposure" after decomposition.
"""

from pydantic import BaseModel, Field, computed_field
from typing import Optional, Literal, Any
import pandas as pd


class ExposureRecord(BaseModel):
    """
    Single security exposure (direct + indirect combined).

    Represents one row in the final true_exposure_report.csv,
    aggregating all sources of exposure to a single security.

    Attributes:
        isin: Security identifier (ISIN or group_key for unresolved)
        name: Security name
        direct: EUR value from direct holdings
        indirect: EUR value from ETF decomposition
        asset_class: Classification (Equity, Cash, Derivative)
        sector: Industry sector
        geography: Country of domicile
    """

    isin: str  # This is actually group_key (ISIN or UNRESOLVED:...)
    name: str
    direct: float = Field(default=0.0, ge=0)
    indirect: float = Field(default=0.0, ge=0)
    asset_class: Literal["Equity", "Cash", "Derivative"] = "Equity"
    sector: Optional[str] = None
    geography: Optional[str] = None

    @computed_field
    @property
    def resolution_status(self) -> Literal["resolved", "unresolved"]:
        """
        Determine resolution status from the ISIN/group_key.

        Returns:
            'resolved' if valid ISIN, 'unresolved' if UNRESOLVED:... pattern
        """
        if self.isin and self.isin.startswith("UNRESOLVED:"):
            return "unresolved"
        return "resolved"

    @computed_field
    @property
    def total_exposure(self) -> float:
        """
        Calculate total exposure (direct + indirect).

        Returns:
            Total EUR value of exposure to this security
        """
        return self.direct + self.indirect

    def add_indirect(self, value: float) -> None:
        """
        Add indirect exposure from an ETF.

        Args:
            value: EUR value to add to indirect exposure
        """
        self.indirect += value

    def to_dict(self) -> dict[str, Any]:
        """
        Convert to dictionary for DataFrame creation.

        Returns:
            Dictionary with all fields including computed total_exposure
        """
        return {
            "isin": self.isin,
            "name": self.name,
            "direct": self.direct,
            "indirect": self.indirect,
            "total_exposure": self.total_exposure,
            "asset_class": self.asset_class,
            "resolution_status": self.resolution_status,
            "sector": self.sector,
            "geography": self.geography,
        }


class AggregatedExposure(BaseModel):
    """
    Complete aggregated exposure with portfolio percentage.

    Container for all exposure records with methods for
    DataFrame conversion and summary statistics.

    Attributes:
        records: List of individual exposure records
        total_portfolio_value: Sum of all exposures in EUR
        true_total_value: True top-down portfolio value (optional, overrides sum for %)
    """

    records: list[ExposureRecord] = Field(default_factory=list)
    total_portfolio_value: float = Field(default=0.0, ge=0)
    true_total_value: Optional[float] = None

    def add_record(self, record: ExposureRecord) -> None:
        """
        Add an exposure record to the collection.

        Args:
            record: ExposureRecord to add
        """
        self.records.append(record)
        self.total_portfolio_value += record.total_exposure

    def get_record(self, isin: str) -> Optional[ExposureRecord]:
        """
        Find a record by ISIN.

        Args:
            isin: ISIN or fallback key to search for

        Returns:
            ExposureRecord if found, None otherwise
        """
        for r in self.records:
            if r.isin == isin:
                return r
        return None

    def get_or_create_record(
        self,
        isin: str,
        name: str,
        asset_class: Literal["Equity", "Cash", "Derivative"] = "Equity",
    ) -> ExposureRecord:
        """
        Get existing record or create new one.

        Args:
            isin: Security identifier
            name: Security name (used if creating new)
            asset_class: Asset classification (used if creating new)

        Returns:
            Existing or newly created ExposureRecord
        """
        record = self.get_record(isin)
        if record is None:
            record = ExposureRecord(isin=isin, name=name, asset_class=asset_class)
            self.records.append(record)
        return record

    def calculate_total(self) -> float:
        """
        Recalculate total portfolio value from records.

        Returns:
            Total portfolio value in EUR
        """
        self.total_portfolio_value = sum(r.total_exposure for r in self.records)
        return self.total_portfolio_value

    def to_dataframe(self) -> pd.DataFrame:
        """
        Convert to pandas DataFrame with portfolio percentages.

        Returns:
            DataFrame with all exposure data and percentages
        """
        if not self.records:
            return pd.DataFrame(
                columns=[
                    "isin",
                    "name",
                    "direct",
                    "indirect",
                    "total_exposure",
                    "portfolio_percentage",
                    "asset_class",
                    "resolution_status",
                    "sector",
                    "geography",
                ]
            )

        data = [r.to_dict() for r in self.records]
        df = pd.DataFrame(data)

        # Calculate portfolio percentage
        # Use true_total_value if set, otherwise fallback to sum of exposures
        total = (
            self.true_total_value
            if self.true_total_value is not None
            else (self.total_portfolio_value or self.calculate_total())
        )

        if total > 0:
            df["portfolio_percentage"] = (df["total_exposure"] / total) * 100
        else:
            df["portfolio_percentage"] = 0.0

        return df

    def to_csv(self, filepath: str) -> None:
        """
        Save to CSV file.

        Args:
            filepath: Path to output CSV file
        """
        df = self.to_dataframe()
        df.to_csv(filepath, index=False)

    @classmethod
    def from_dataframe(cls, df: pd.DataFrame) -> "AggregatedExposure":
        """
        Create from pandas DataFrame.

        Args:
            df: DataFrame with exposure data

        Returns:
            AggregatedExposure instance
        """
        records = []
        for _, row in df.iterrows():
            record = ExposureRecord(
                isin=row.get("isin", ""),
                name=row.get("name", ""),
                direct=row.get("direct", 0.0),
                indirect=row.get("indirect", 0.0),
                asset_class=row.get("asset_class", "Equity"),
                sector=row.get("sector"),
                geography=row.get("geography"),
            )
            records.append(record)

        exposure = cls(records=records)
        exposure.calculate_total()
        return exposure
