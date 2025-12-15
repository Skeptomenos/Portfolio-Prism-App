"""
Performance Tab - P/L Analytics Dashboard

Shows unrealized gains/losses for all positions (stocks and ETFs).
Uses AvgCost data from Trade Republic via pytr.
"""

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

# Use centralized path constants from utils
from portfolio_src.dashboard.utils import HOLDINGS_PATH, CONFIG_DIR

UNIVERSE_PATH = CONFIG_DIR / "asset_universe.csv"


@st.cache_data
def load_holdings_with_pl() -> pd.DataFrame:
    """
    Load holdings with P/L calculations.

    Returns DataFrame with columns:
        - isin, name, asset_type, quantity
        - avg_cost, current_price, cost_basis, current_value
        - pl_absolute, pl_percent
    """
    if not HOLDINGS_PATH.exists():
        return pd.DataFrame()

    # Load holdings
    df = pd.read_csv(HOLDINGS_PATH)

    # Load universe for names and asset types
    universe_df = pd.DataFrame()
    if UNIVERSE_PATH.exists():
        universe_df = pd.read_csv(UNIVERSE_PATH)

    # Merge with universe
    if not universe_df.empty and "ISIN" in universe_df.columns:
        df = df.merge(
            universe_df[["ISIN", "Name", "Asset_Class"]], on="ISIN", how="left"
        )
        # Use TR_Name as fallback if Name is missing
        df["Name"] = df["Name"].fillna(df["TR_Name"])
        df["Asset_Class"] = df["Asset_Class"].fillna("Stock")
    else:
        df["Name"] = df["TR_Name"]
        df["Asset_Class"] = "Stock"

    # Rename columns for consistency
    df = df.rename(
        columns={
            "ISIN": "isin",
            "Quantity": "quantity",
            "AvgCost": "avg_cost",
            "CurrentPrice": "current_price",
            "NetValue": "current_value",
            "Name": "name",
            "Asset_Class": "asset_type",
        }
    )

    # Convert to numeric
    df["quantity"] = pd.to_numeric(df["quantity"], errors="coerce").fillna(0)
    df["avg_cost"] = pd.to_numeric(df["avg_cost"], errors="coerce").fillna(0)
    df["current_price"] = pd.to_numeric(df["current_price"], errors="coerce").fillna(0)
    df["current_value"] = pd.to_numeric(df["current_value"], errors="coerce").fillna(0)

    # Calculate P/L
    df["cost_basis"] = df["avg_cost"] * df["quantity"]
    df["pl_absolute"] = df["current_value"] - df["cost_basis"]
    df["pl_percent"] = df.apply(
        lambda row: ((row["current_value"] / row["cost_basis"]) - 1) * 100
        if row["cost_basis"] > 0
        else 0,
        axis=1,
    )

    # Select and order columns
    columns = [
        "isin",
        "name",
        "asset_type",
        "quantity",
        "avg_cost",
        "current_price",
        "cost_basis",
        "current_value",
        "pl_absolute",
        "pl_percent",
    ]

    return df[columns]


def render_summary_metrics(df: pd.DataFrame):
    """Render the top summary metrics cards."""
    total_value = df["current_value"].sum()
    total_cost = df["cost_basis"].sum()
    total_pl = total_value - total_cost
    total_pl_pct = ((total_value / total_cost) - 1) * 100 if total_cost > 0 else 0

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            label="Total Portfolio Value",
            value=f"EUR {total_value:,.2f}",
            help="Current market value of all your holdings (stocks + ETFs) based on latest prices.",
        )

    with col2:
        st.metric(
            label="Total Cost Basis",
            value=f"EUR {total_cost:,.2f}",
            help="Total amount you invested across all positions. This is your average purchase price × quantity for each holding.",
        )

    with col3:
        pl_color = "normal" if total_pl >= 0 else "inverse"
        st.metric(
            label="Unrealized P/L",
            value=f"EUR {total_pl:+,.2f}",
            delta=f"{total_pl_pct:+.2f}%",
            delta_color=pl_color,
            help="Unrealized Profit/Loss: The gain or loss you would realize if you sold all positions today. Green = profit, Red = loss.",
        )


def render_cost_vs_value_chart(df: pd.DataFrame):
    """Render bar chart comparing cost basis vs current value."""
    st.subheader("Cost Basis vs Current Value")

    # Prepare data for chart
    chart_data = df[["name", "cost_basis", "current_value"]].copy()
    chart_data = chart_data.sort_values("current_value", ascending=True).tail(15)

    fig = go.Figure()

    fig.add_trace(
        go.Bar(
            name="Cost Basis",
            y=chart_data["name"],
            x=chart_data["cost_basis"],
            orientation="h",
            marker_color="#636EFA",
        )
    )

    fig.add_trace(
        go.Bar(
            name="Current Value",
            y=chart_data["name"],
            x=chart_data["current_value"],
            orientation="h",
            marker_color="#00CC96",
        )
    )

    fig.update_layout(
        barmode="group",
        height=500,
        margin=dict(l=20, r=20, t=20, b=20),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
    )

    st.plotly_chart(fig, use_container_width=True)


def render_winners_losers(df: pd.DataFrame):
    """Render winners and losers visualization."""
    st.subheader("Winners & Losers")

    col1, col2 = st.columns(2)

    # Winners (top 5 by P/L %)
    winners = df[df["pl_percent"] > 0].nlargest(5, "pl_percent")
    losers = df[df["pl_percent"] < 0].nsmallest(5, "pl_percent")

    with col1:
        st.markdown("**Top Winners (by P/L %)**")
        if not winners.empty:
            fig = px.bar(
                winners,
                x="pl_percent",
                y="name",
                orientation="h",
                color="pl_percent",
                color_continuous_scale=["#00CC96", "#00CC96"],
                labels={"pl_percent": "P/L %", "name": ""},
            )
            fig.update_layout(
                height=250,
                margin=dict(l=20, r=20, t=20, b=20),
                showlegend=False,
                coloraxis_showscale=False,
            )
            fig.update_traces(
                text=[f"+{x:.1f}%" for x in winners["pl_percent"]],
                textposition="outside",
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No winning positions")

    with col2:
        st.markdown("**Top Losers (by P/L %)**")
        if not losers.empty:
            fig = px.bar(
                losers,
                x="pl_percent",
                y="name",
                orientation="h",
                color="pl_percent",
                color_continuous_scale=["#EF553B", "#EF553B"],
                labels={"pl_percent": "P/L %", "name": ""},
            )
            fig.update_layout(
                height=250,
                margin=dict(l=20, r=20, t=20, b=20),
                showlegend=False,
                coloraxis_showscale=False,
            )
            fig.update_traces(
                text=[f"{x:.1f}%" for x in losers["pl_percent"]], textposition="outside"
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No losing positions")

    # Summary stats
    winners_count = len(df[df["pl_percent"] > 0])
    losers_count = len(df[df["pl_percent"] < 0])
    total_count = len(df)

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric(
            "Winners",
            f"{winners_count} positions",
            f"{winners_count / total_count * 100:.0f}%",
            help="Positions with positive returns (current value > cost basis). A higher winner ratio generally indicates good stock selection.",
        )
    with col2:
        st.metric(
            "Losers",
            f"{losers_count} positions",
            f"{losers_count / total_count * 100:.0f}%",
            help="Positions with negative returns (current value < cost basis). Some losers are normal in any portfolio.",
        )
    with col3:
        best_pct = df["pl_percent"].max()
        worst_pct = df["pl_percent"].min()
        st.metric(
            "Range",
            f"{worst_pct:+.1f}% to {best_pct:+.1f}%",
            help="The spread between your worst and best performing positions. A wide range indicates high dispersion in returns.",
        )


def render_portfolio_insights(df: pd.DataFrame):
    """Render portfolio health summary with insights."""
    from ..insights import (
        generate_portfolio_summary,
        generate_performance_insights,
    )

    summary = generate_portfolio_summary(df)
    if summary is None:
        return

    # Headline in an info box
    if summary.total_pl >= 0:
        st.success(f"**{summary.headline}**")
    else:
        st.error(f"**{summary.headline}**")

    # Key observations
    insights = generate_performance_insights(df)
    all_observations = summary.observations + insights

    if all_observations:
        with st.expander("Portfolio Insights", expanded=True):
            for obs in all_observations:
                if obs.level == "success":
                    st.success(obs.text)
                elif obs.level == "warning":
                    st.warning(obs.text)
                elif obs.level == "error":
                    st.error(obs.text)
                else:
                    st.info(obs.text)


def render_positions_table(df: pd.DataFrame):
    """Render the full positions table with P/L data."""
    st.subheader("All Positions")

    # Sort options
    sort_options = {
        "P/L % (Best First)": ("pl_percent", False),
        "P/L % (Worst First)": ("pl_percent", True),
        "P/L EUR (Best First)": ("pl_absolute", False),
        "P/L EUR (Worst First)": ("pl_absolute", True),
        "Value (Largest First)": ("current_value", False),
        "Name (A-Z)": ("name", True),
    }

    col1, col2 = st.columns([3, 1])
    with col2:
        sort_by = st.selectbox("Sort by", list(sort_options.keys()), index=0)

    sort_col, ascending = sort_options[sort_by]
    display_df = df.sort_values(sort_col, ascending=ascending)

    # Format for display
    display_df = display_df.copy()
    display_df["Avg Cost"] = display_df["avg_cost"].apply(lambda x: f"EUR {x:,.2f}")
    display_df["Current Price"] = display_df["current_price"].apply(
        lambda x: f"EUR {x:,.2f}"
    )
    display_df["Cost Basis"] = display_df["cost_basis"].apply(lambda x: f"EUR {x:,.2f}")
    display_df["Current Value"] = display_df["current_value"].apply(
        lambda x: f"EUR {x:,.2f}"
    )
    display_df["P/L EUR"] = display_df["pl_absolute"].apply(lambda x: f"EUR {x:+,.2f}")
    display_df["P/L %"] = display_df["pl_percent"].apply(lambda x: f"{x:+.2f}%")
    display_df["Quantity"] = display_df["quantity"].apply(lambda x: f"{x:,.4f}")

    # Select columns for display
    display_cols = [
        "name",
        "asset_type",
        "Quantity",
        "Avg Cost",
        "Current Price",
        "Cost Basis",
        "Current Value",
        "P/L EUR",
        "P/L %",
    ]
    display_df = display_df.rename(columns={"name": "Name", "asset_type": "Type"})

    st.dataframe(
        display_df[
            [
                "Name",
                "Type",
                "Quantity",
                "Avg Cost",
                "Current Price",
                "Current Value",
                "P/L EUR",
                "P/L %",
            ]
        ],
        use_container_width=True,
        hide_index=True,
    )


def render():
    """Main render function for Performance tab."""
    st.header("Performance Analytics")

    st.caption(
        "Track your unrealized gains and losses. See which positions are working "
        "for you and which need attention. Data is based on your average purchase price from Trade Republic."
    )

    # Auto-snapshot on load (if >24h old)
    from ..utils import save_snapshot_if_needed

    if save_snapshot_if_needed():
        st.toast("Portfolio snapshot saved", icon="📸")

    # Load data
    df = load_holdings_with_pl()

    if df.empty:
        st.warning("No holdings data available. Please run the pipeline first.")
        st.code("bash run.sh")
        return

    # Check if we have P/L data
    if df["avg_cost"].sum() == 0:
        st.warning(
            "No average cost data available. Please fetch fresh data from Trade Republic."
        )
        st.code("bash run.sh  # Select option [1] Trade Republic API")
        return

    # Render components
    render_summary_metrics(df)

    # Portfolio Health Summary
    render_portfolio_insights(df)

    st.divider()

    render_cost_vs_value_chart(df)

    st.divider()

    render_winners_losers(df)

    st.divider()

    render_positions_table(df)
