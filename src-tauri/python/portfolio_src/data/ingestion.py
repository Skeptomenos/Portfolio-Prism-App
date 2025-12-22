import pandas as pd
from typing import Optional
from portfolio_src.core.schema import (
    PositionsSchema,
    AssetUniverseSchema,
    SchemaNormalizer,
    Column,
)
from portfolio_src.data.database import transaction


class DataIngestion:
    @classmethod
    def ingest_positions(
        cls, df: pd.DataFrame, portfolio_id: int = 1, source: str = "manual"
    ) -> dict:
        df = SchemaNormalizer.normalize(
            df, source_type="TR" if source == "trade_republic" else None
        )
        validated_df = PositionsSchema.validate(df)

        processed = 0
        with transaction() as conn:
            for _, row in validated_df.iterrows():
                conn.execute(
                    """
                    INSERT INTO assets (isin, name, symbol, asset_class, updated_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(isin) DO UPDATE SET
                        name = excluded.name,
                        symbol = COALESCE(excluded.symbol, assets.symbol),
                        asset_class = excluded.asset_class,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        row[Column.ISIN],
                        row[Column.NAME],
                        row.get(Column.TICKER),
                        row[Column.ASSET_TYPE],
                    ),
                )

                conn.execute(
                    """
                    INSERT INTO positions (portfolio_id, isin, quantity, current_price, updated_at)
                    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(portfolio_id, isin) DO UPDATE SET
                        quantity = excluded.quantity,
                        current_price = COALESCE(excluded.current_price, positions.current_price),
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        portfolio_id,
                        row[Column.ISIN],
                        row[Column.QUANTITY],
                        row.get(Column.PRICE),
                    ),
                )
                processed += 1

        return {
            "status": "success",
            "processed": processed,
            "source": source,
        }

    @classmethod
    def ingest_metadata(cls, df: pd.DataFrame) -> dict:
        validated_df = AssetUniverseSchema.validate(df)

        updated = 0
        with transaction() as conn:
            for _, row in validated_df.iterrows():
                conn.execute(
                    """
                    INSERT INTO assets (isin, symbol, name, sector, region, country, asset_class, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(isin) DO UPDATE SET
                        symbol = COALESCE(excluded.symbol, assets.symbol),
                        name = COALESCE(excluded.name, assets.name),
                        sector = COALESCE(excluded.sector, assets.sector),
                        region = COALESCE(excluded.region, assets.region),
                        country = COALESCE(excluded.country, assets.country),
                        asset_class = COALESCE(excluded.asset_class, assets.asset_class),
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        row[Column.ISIN],
                        row.get(Column.TICKER),
                        row.get(Column.NAME),
                        row.get(Column.SECTOR),
                        row.get(Column.REGION),
                        row.get(Column.COUNTRY),
                        row.get(Column.ASSET_TYPE),
                    ),
                )
                updated += 1

        return {
            "status": "success",
            "updated": updated,
        }
