# phases/shared/schemas.py
import pandera.pandas as pa
from pandera.typing import Series
from typing import Optional


class HoldingsSchema(pa.DataFrameModel):
    """
    Defines the data contract for DataFrames returned by all data acquisition adapters.

    This schema is used to validate the output of each adapter to ensure it conforms
    to the structure expected by the downstream aggregation and reporting modules.
    """

    name: Series[str] = pa.Field(nullable=False)
    ticker: Series[str] = pa.Field(nullable=True)  # Ticker can sometimes be null
    isin: Optional[Series[str]] = pa.Field(
        nullable=True
    )  # ISIN is optional (enriched later if missing)
    weight_percentage: Series[float] = pa.Field(nullable=False, ge=0.0)

    class Config:
        strict = "filter"  # Drop columns not defined in the schema
        coerce = True  # Coerce data types to match the schema
