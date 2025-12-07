import pandas as pd
from pathlib import Path


def calculate_positions(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculates current holdings (quantity, avg. price) from a transaction log.
    """
    # Filter for BUY and SELL transactions
    buys = df[df["TRADE_TYPE"] == "BUY"].copy()
    sells = df[df["TRADE_TYPE"] == "SELL"].copy()

    # Convert columns to numeric, handling comma as decimal separator
    for col in ["QUANTITY", "PRICE", "AMOUNT", "FEE"]:
        if col in buys.columns:
            buys[col] = pd.to_numeric(
                buys[col].astype(str).str.replace(",", "."), errors="coerce"
            )
        if col in sells.columns:
            sells[col] = pd.to_numeric(
                sells[col].astype(str).str.replace(",", "."), errors="coerce"
            )

    # Calculate total purchase cost
    buys["total_cost"] = buys["QUANTITY"] * buys["PRICE"]

    # Group by ISIN to calculate total quantity and weighted average price
    positions = (
        buys.groupby("ISIN")
        .agg(
            name=("NAME", "first"),
            total_quantity=("QUANTITY", "sum"),
            total_cost=("total_cost", "sum"),
        )
        .reset_index()
    )

    # Adjust for sales
    if not sells.empty:
        sell_quantities = sells.groupby("ISIN")["QUANTITY"].sum().reset_index()
        positions = pd.merge(
            positions, sell_quantities, on="ISIN", how="left", suffixes=("", "_sold")
        )
        if "QUANTITY_sold" in positions.columns:
            positions["QUANTITY_sold"] = positions["QUANTITY_sold"].fillna(0)
            positions["total_quantity"] -= positions["QUANTITY_sold"]
            positions = positions.drop(columns=["QUANTITY_sold"])

    # Calculate the weighted average purchase price
    positions["average_purchase_price"] = (
        positions["total_cost"]
        / positions[positions["total_quantity"] > 0]["total_quantity"]
    )

    # Clean up the dataframe
    positions = positions[positions["total_quantity"] > 0]
    positions = positions[["ISIN", "name", "total_quantity", "average_purchase_price"]]

    return positions


def main():
    # Build the path relative to the script's location
    script_dir = Path(__file__).parent
    trades_file = script_dir.parent / "output" / "trades.csv"

    if not trades_file.exists():
        print(f"Trades file not found: {trades_file}")
        print(
            "Please run the pdf_parser.py script first to generate the trades.csv file."
        )
        return

    df = pd.read_csv(trades_file)

    positions = calculate_positions(df)

    print("Current Positions:")
    print(positions)


if __name__ == "__main__":
    main()
