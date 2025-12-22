from enum import Enum
import pandas as pd
import pandera.pandas as pa
from pandera.typing import Series
from pandera.api.pandas.model_config import BaseConfig
from typing import Optional, Any


class Column(str, Enum):
    ISIN = "isin"
    NAME = "name"
    TICKER = "ticker"
    ASSET_TYPE = "asset_type"
    PROVIDER = "provider"

    QUANTITY = "quantity"
    PRICE = "price"
    MARKET_VALUE = "market_value"
    WEIGHT = "weight"

    SECTOR = "sector"
    REGION = "region"
    COUNTRY = "country"
    CURRENCY = "currency"

    LAST_UPDATED = "last_updated"
    SOURCE = "source"
    CONFIDENCE = "confidence"


class PositionsSchema(pa.DataFrameModel):
    isin: Series[str] = pa.Field(
        str_length={"min_value": 12, "max_value": 12},
        str_matches=r"^[A-Z]{2}[A-Z0-9]{10}$",
    )
    name: Series[str] = pa.Field(nullable=False)
    quantity: Series[float] = pa.Field(ge=0)
    asset_type: Series[str] = pa.Field(
        isin=["Stock", "ETF", "Cash", "Crypto", "Derivative"]
    )
    ticker: Series[str] = pa.Field(nullable=True)
    provider: Series[str] = pa.Field(nullable=True)
    price: Series[float] = pa.Field(ge=0, nullable=True)
    market_value: Series[float] = pa.Field(ge=0)
    last_updated: Series[pa.DateTime] = pa.Field(nullable=True)

    class Config(BaseConfig):
        strict = True
        coerce = True


class AssetUniverseSchema(pa.DataFrameModel):
    isin: Series[str] = pa.Field(
        str_length={"min_value": 12, "max_value": 12},
        str_matches=r"^[A-Z]{2}[A-Z0-9]{10}$",
        unique=True,
    )
    ticker: Series[str] = pa.Field(nullable=True)
    name: Series[str] = pa.Field(nullable=True)
    sector: Series[str] = pa.Field(nullable=True)
    region: Series[str] = pa.Field(nullable=True)
    country: Series[str] = pa.Field(nullable=True)
    asset_type: Series[str] = pa.Field(
        isin=["Stock", "ETF", "Cash", "Crypto", "Derivative"], nullable=True
    )
    confidence: Series[float] = pa.Field(ge=0, le=1, nullable=True)
    last_updated: Series[pa.DateTime] = pa.Field(nullable=True)

    class Config(BaseConfig):
        strict = True
        coerce = True


class SchemaNormalizer:
    MAP_TR = {
        "ISIN": Column.ISIN,
        "Name": Column.NAME,
        "Quantity": Column.QUANTITY,
        "Price": Column.PRICE,
        "Value": Column.MARKET_VALUE,
    }

    MAP_MANUAL_COMMON = {
        "isin": Column.ISIN,
        "name": Column.NAME,
        "qty": Column.QUANTITY,
        "amount": Column.QUANTITY,
        "shares": Column.QUANTITY,
        "type": Column.ASSET_TYPE,
        "asset_class": Column.ASSET_TYPE,
    }

    @classmethod
    def normalize(
        cls, df: pd.DataFrame, source_type: Optional[str] = None
    ) -> pd.DataFrame:
        df.columns = [c.lower() for c in df.columns]

        if source_type == "TR":
            tr_lower = {k.lower(): v for k, v in cls.MAP_TR.items()}
            df = df.rename(columns=tr_lower)

        df = df.rename(columns=cls.MAP_MANUAL_COMMON)

        return df
