"""
ETF Overlap Analysis Tab

Analyzes overlap between ETFs in the portfolio to identify:
- Securities held in multiple ETFs
- Hidden concentration (same stock via multiple ETFs)
- Overlap matrix between ETF pairs
"""

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from pathlib import Path

from src.dashboard.utils import load_holdings_breakdown, load_direct_holdings


def calculate_etf_overlap(breakdown_df: pd.DataFrame) -> dict:
    """
    Calculate overlap statistics between ETFs.

    Returns dict with:
        - overlap_matrix: DataFrame with pairwise overlap percentages
        - securities_in_multiple: DataFrame of securities in multiple ETFs
        - hidden_concentration: DataFrame of top hidden concentration risks
    """
    if breakdown_df.empty:
        return {}

    # Get unique ETFs
    etfs = breakdown_df["parent_isin"].unique()

    # Build matrix of which securities are in which ETFs
    security_etf_matrix = breakdown_df.pivot_table(
        index="child_isin",
        columns="parent_isin",
        values="value_eur",
        aggfunc="sum",
        fill_value=0,
    )

    # Count how many ETFs each security appears in
    securities_count = (security_etf_matrix > 0).sum(axis=1)
    securities_in_multiple = securities_count[securities_count > 1].sort_values(
        ascending=False
    )

    # Get details for securities in multiple ETFs
    multi_etf_securities = []
    for isin in securities_in_multiple.index[:20]:  # Top 20
        etf_count = securities_in_multiple[isin]
        total_value = security_etf_matrix.loc[isin].sum()

        # Get which ETFs hold this security
        holding_etfs = security_etf_matrix.loc[isin]
        holding_etfs = holding_etfs[holding_etfs > 0]
        etf_names = []
        for etf_isin in holding_etfs.index:
            etf_name = breakdown_df[breakdown_df["parent_isin"] == etf_isin][
                "parent_name"
            ].iloc[0]
            etf_names.append(f"{etf_name[:20]}...")

        # Get security name
        sec_name = breakdown_df[breakdown_df["child_isin"] == isin]["child_name"].iloc[
            0
        ]

        multi_etf_securities.append(
            {
                "isin": isin,
                "name": sec_name,
                "etf_count": int(etf_count),
                "total_value": total_value,
                "etfs": ", ".join(etf_names[:3])
                + ("..." if len(etf_names) > 3 else ""),
            }
        )

    multi_df = pd.DataFrame(multi_etf_securities)

    # Calculate overlap matrix between ETFs
    overlap_matrix = pd.DataFrame(index=etfs, columns=etfs, dtype=float)

    etf_names_map = {}
    for etf in etfs:
        name = breakdown_df[breakdown_df["parent_isin"] == etf]["parent_name"].iloc[0]
        etf_names_map[etf] = name[:15] + "..." if len(name) > 15 else name

    for etf1 in etfs:
        holdings1 = set(security_etf_matrix[security_etf_matrix[etf1] > 0].index)
        for etf2 in etfs:
            if etf1 == etf2:
                overlap_matrix.loc[etf1, etf2] = 100.0
            else:
                holdings2 = set(
                    security_etf_matrix[security_etf_matrix[etf2] > 0].index
                )
                intersection = holdings1 & holdings2
                union = holdings1 | holdings2
                if len(union) > 0:
                    jaccard = len(intersection) / len(union) * 100
                    overlap_matrix.loc[etf1, etf2] = jaccard
                else:
                    overlap_matrix.loc[etf1, etf2] = 0.0

    # Rename index/columns to ETF names
    overlap_matrix.index = [etf_names_map.get(e, e) for e in overlap_matrix.index]
    overlap_matrix.columns = [etf_names_map.get(e, e) for e in overlap_matrix.columns]

    return {
        "overlap_matrix": overlap_matrix,
        "multi_etf_securities": multi_df,
        "etf_names_map": etf_names_map,
    }


def render_overlap_matrix(overlap_data: dict):
    """Render the ETF overlap heatmap."""
    st.subheader("ETF Overlap Matrix")
    st.caption("Jaccard similarity: % of holdings shared between ETF pairs")

    matrix = overlap_data.get("overlap_matrix")
    if matrix is None or matrix.empty:
        st.info("No overlap data available")
        return

    # Create heatmap
    fig = go.Figure(
        data=go.Heatmap(
            z=matrix.values.astype(float),
            x=matrix.columns,
            y=matrix.index,
            colorscale="RdYlGn",
            text=[[f"{v:.0f}%" for v in row] for row in matrix.values.astype(float)],
            texttemplate="%{text}",
            textfont={"size": 10},
            hovertemplate="ETF 1: %{y}<br>ETF 2: %{x}<br>Overlap: %{z:.1f}%<extra></extra>",
        )
    )

    fig.update_layout(
        height=400,
        margin=dict(l=10, r=10, t=10, b=10),
        xaxis=dict(tickangle=45),
    )

    st.plotly_chart(fig, use_container_width=True)


def render_securities_list(overlap_data: dict):
    """Render the list of securities in multiple ETFs."""
    st.subheader("Securities in Multiple ETFs")
    st.caption(
        "These securities appear in more than one ETF, creating hidden concentration"
    )

    multi_df = overlap_data.get("multi_etf_securities")
    if multi_df is None or multi_df.empty:
        st.info("No securities found in multiple ETFs")
        return

    # Summary metrics
    col1, col2, col3 = st.columns(3)

    with col1:
        total_overlapping = len(multi_df)
        st.metric(
            "Overlapping Securities",
            total_overlapping,
            help="Number of individual securities that appear in more than one of your ETFs. Higher overlap means more hidden concentration.",
        )

    with col2:
        total_overlap_value = multi_df["total_value"].sum()
        st.metric(
            "Total Overlap Value",
            f"EUR {total_overlap_value:,.2f}",
            help="Combined value of all securities that appear in multiple ETFs. This represents your duplicated exposure.",
        )

    with col3:
        max_overlap = multi_df["etf_count"].max() if not multi_df.empty else 0
        st.metric(
            "Max ETF Overlap",
            f"{max_overlap} ETFs",
            help="The highest number of ETFs that share a single security. A stock appearing in many ETFs creates hidden concentration.",
        )

    # Bar chart of top overlapping securities
    top_n = 10
    chart_data = multi_df.head(top_n).copy()

    if not chart_data.empty:
        fig = px.bar(
            chart_data,
            x="total_value",
            y="name",
            orientation="h",
            color="etf_count",
            color_continuous_scale="Reds",
            labels={
                "total_value": "Total Value (EUR)",
                "name": "",
                "etf_count": "ETF Count",
            },
            text="etf_count",
        )
        fig.update_traces(texttemplate="%{text} ETFs", textposition="outside")
        fig.update_layout(
            height=350, margin=dict(l=10, r=10, t=10, b=10), showlegend=False
        )
        st.plotly_chart(fig, use_container_width=True)

    # Detailed table
    with st.expander("View All Overlapping Securities"):
        display_df = multi_df.copy()
        display_df["Total Value"] = display_df["total_value"].apply(
            lambda x: f"EUR {x:,.2f}"
        )
        display_df = display_df.rename(
            columns={"name": "Security", "etf_count": "In # ETFs", "etfs": "ETFs"}
        )
        st.dataframe(
            display_df[["Security", "In # ETFs", "Total Value", "ETFs"]],
            use_container_width=True,
            hide_index=True,
        )


def render_overlap_insights_section(overlap_data: dict, direct_df: pd.DataFrame):
    """Render educational insights about ETF overlap."""
    from src.dashboard.insights import generate_overlap_insights

    multi_df = overlap_data.get("multi_etf_securities")
    if multi_df is None or multi_df.empty:
        return

    # Calculate values for insights
    overlap_count = len(multi_df)
    overlap_value = multi_df["total_value"].sum()
    total_value = direct_df["market_value"].sum() if not direct_df.empty else 0
    max_etf_count = int(multi_df["etf_count"].max()) if not multi_df.empty else 0

    # Build top overlapping list
    top_overlapping = []
    for _, row in multi_df.head(3).iterrows():
        top_overlapping.append(
            (str(row["name"]), int(row["etf_count"]), float(row["total_value"]))
        )

    # Generate insights
    insights = generate_overlap_insights(
        overlap_count=overlap_count,
        overlap_value=overlap_value,
        total_value=total_value,
        max_etf_count=max_etf_count,
        top_overlapping=top_overlapping,
    )

    # Render insights
    if insights:
        with st.expander("ETF Overlap Insights", expanded=True):
            for obs in insights:
                if obs.level == "success":
                    st.success(obs.text)
                elif obs.level == "warning":
                    st.warning(obs.text)
                elif obs.level == "error":
                    st.error(obs.text)
                else:
                    st.info(obs.text)


def render_hidden_concentration(overlap_data: dict, breakdown_df: pd.DataFrame):
    """Render hidden concentration alerts."""
    st.subheader("Hidden Concentration Alerts")
    st.caption("Securities with significant indirect exposure via multiple ETFs")

    multi_df = overlap_data.get("multi_etf_securities")
    if multi_df is None or multi_df.empty:
        st.success("No hidden concentration risks detected")
        return

    # Alert for high-value overlapping securities
    high_value_threshold = 500  # EUR
    high_value = multi_df[multi_df["total_value"] > high_value_threshold]

    if not high_value.empty:
        for _, row in high_value.head(5).iterrows():
            st.warning(
                f"**{row['name']}** appears in {row['etf_count']} ETFs "
                f"with combined exposure of EUR {row['total_value']:,.2f}"
            )
    else:
        st.success("No significant hidden concentration detected (threshold: EUR 500)")


def render():
    """Main render function for ETF Overlap tab."""
    st.header("ETF Overlap Analysis")

    st.caption(
        "Discover hidden duplication across your ETFs. The same stock might appear in multiple funds, "
        "concentrating your risk without you realizing it. Overlap is measured using Jaccard similarity."
    )

    # Load data
    breakdown_df = load_holdings_breakdown()
    direct_df = load_direct_holdings()

    if breakdown_df.empty:
        st.warning("No ETF holdings data available. Please run the pipeline first.")
        st.code("bash run.sh")
        return

    # Filter to only ETF holdings
    if "source" in breakdown_df.columns:
        etf_breakdown = breakdown_df[breakdown_df["source"] == "ETF"]
    else:
        etf_breakdown = breakdown_df

    if etf_breakdown.empty:
        st.info("No ETF holdings found in portfolio.")
        return

    # Calculate overlap
    overlap_data = calculate_etf_overlap(etf_breakdown)

    if not overlap_data:
        st.error("Could not calculate overlap data.")
        return

    # Render overlap insights
    render_overlap_insights_section(overlap_data, direct_df)

    st.divider()

    # Render components
    render_hidden_concentration(overlap_data, etf_breakdown)

    st.divider()

    # Two column layout for matrix and list
    col1, col2 = st.columns([1, 1])

    with col1:
        render_overlap_matrix(overlap_data)

    with col2:
        render_securities_list(overlap_data)
