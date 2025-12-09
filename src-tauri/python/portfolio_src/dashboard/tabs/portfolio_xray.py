import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from pathlib import Path

from portfolio_src.dashboard.utils import (
    load_direct_holdings,
    load_exposure_report,
    get_project_root,
)


def calculate_hhi(weights: pd.Series) -> float:
    """
    Calculate Herfindahl-Hirschman Index (HHI) for concentration.

    HHI = Sum of squared weights
    - HHI < 0.01: Highly diversified
    - HHI 0.01-0.015: Moderate concentration
    - HHI 0.015-0.025: Concentrated
    - HHI > 0.025: Highly concentrated

    Returns value between 0 and 1.
    """
    # Normalize weights to sum to 1
    normalized = weights / weights.sum()
    return (normalized**2).sum()


def get_concentration_rating(hhi: float) -> tuple[str, str]:
    """Get human-readable rating for HHI."""
    if hhi < 0.01:
        return "Diversified", "normal"
    elif hhi < 0.015:
        return "Moderate", "normal"
    elif hhi < 0.025:
        return "Concentrated", "inverse"
    else:
        return "Highly Concentrated", "inverse"


def render():
    st.header("📊 Portfolio X-Ray")

    st.caption(
        "Understand your true exposure after looking through ETF wrappers. "
        "Monitor concentration risk and see how your investments are allocated across asset types."
    )

    # Load Data (Fix 21: Added Pipeline Runner)
    with st.expander("⚙️ Pipeline Control", expanded=False):
        st.write("If data looks missing or outdated, run the analysis pipeline.")
        if st.button("Run Analysis Pipeline", type="primary", key="xray_run_pipeline"):
            progress_bar = st.progress(0.0)
            status_text = st.empty()
            
            try:
                from portfolio_src.core.pipeline import Pipeline
                from portfolio_src.dashboard.utils import DATA_DIR
                
                def update_progress(msg: str, pct: float):
                    progress_bar.progress(pct)
                    status_text.text(msg)

                pipeline = Pipeline(data_dir=DATA_DIR)
                status_text.text("Starting pipeline...")
                result = pipeline.run(progress_callback=update_progress)
                
                if result.success:
                    st.success(f"Analysis complete! Processed {result.etfs_processed} ETFs.")
                    st.balloons()
                    st.rerun()
                else:
                    st.error("Pipeline failed. Check Pipeline Health tab for details.")
            except Exception as e:
                st.error(f"Pipeline crashed: {e}")
            finally:
                progress_bar.empty()

        # Fix 24: Added Community Sync next to pipeline control
        if st.button("🔄 Sync Community Data", key="xray_sync_community"):
            with st.spinner("Syncing latest ETF data from community..."):
                try:
                    from portfolio_src.data.community_sync import get_community_sync
                    syncer = get_community_sync()
                    results = syncer.pull_community_data()
                    
                    msg = f"Synced {len(results['downloaded'])} ETFs."
                    if results['failed']:
                         msg += f" (Failed: {len(results['failed'])})"
                    
                    st.success(msg)
                    # No rerun needed here, just info
                except Exception as e:
                    st.error(f"Sync failed: {e}")

    direct_df = load_direct_holdings()
    exposure_df = load_exposure_report()

    if direct_df.empty:
        st.error("Missing data. Please run the pipeline first.")
        return

    # KPIs Row
    st.subheader("Portfolio Overview")

    col1, col2, col3 = st.columns(3)

    total_value = direct_df["market_value"].sum()
    num_positions = len(direct_df)
    unique_assets = len(exposure_df) if not exposure_df.empty else num_positions

    col1.metric(
        "Total Portfolio Value",
        f"EUR {total_value:,.2f}",
        help="Current market value of all your direct holdings (stocks + ETFs) based on latest prices.",
    )
    col2.metric(
        "Direct Positions",
        num_positions,
        help="Number of individual securities you hold directly in your portfolio (each stock or ETF counts as one position).",
    )
    col3.metric(
        "Unique Underlying Assets",
        unique_assets,
        help="Total unique securities after looking through ETFs. This reveals how many different companies you're actually invested in.",
    )

    st.divider()

    # Concentration Risk Section
    st.subheader("Concentration Risk")

    # Calculate concentration metrics using exposure report (true exposure) or direct holdings
    if not exposure_df.empty and "total_exposure" in exposure_df.columns:
        exposure_values = exposure_df["total_exposure"]
        weights = exposure_values / exposure_values.sum()
    else:
        exposure_values = direct_df["market_value"]
        weights = exposure_values / exposure_values.sum()

    # HHI
    hhi = calculate_hhi(exposure_values)
    hhi_rating, hhi_color = get_concentration_rating(hhi)

    # Top N concentration
    sorted_weights = weights.sort_values(ascending=False)
    top_5_concentration = sorted_weights.head(5).sum() * 100
    top_10_concentration = sorted_weights.head(10).sum() * 100
    max_single = sorted_weights.max() * 100

    # Direct vs Indirect split
    if (
        not exposure_df.empty
        and "direct" in exposure_df.columns
        and "indirect" in exposure_df.columns
    ):
        total_direct = exposure_df["direct"].sum()
        total_indirect = exposure_df["indirect"].sum()
        total_exposure = total_direct + total_indirect
        direct_pct = (total_direct / total_exposure * 100) if total_exposure > 0 else 0
        indirect_pct = (
            (total_indirect / total_exposure * 100) if total_exposure > 0 else 0
        )
    else:
        direct_pct = 100
        indirect_pct = 0

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric(
            label="HHI Index",
            value=f"{hhi:.4f}",
            delta=hhi_rating,
            delta_color=hhi_color,
            help="Herfindahl-Hirschman Index measures portfolio concentration. <0.01 = highly diversified, 0.01-0.015 = diversified, 0.015-0.025 = moderate, >0.025 = concentrated.",
        )

    with col2:
        st.metric(
            label="Top 5 Concentration",
            value=f"{top_5_concentration:.1f}%",
            delta="of total exposure",
            help="Combined weight of your 5 largest positions. Above 50% means half your portfolio is in just 5 holdings.",
        )

    with col3:
        st.metric(
            label="Top 10 Concentration",
            value=f"{top_10_concentration:.1f}%",
            delta="of total exposure",
            help="Combined weight of your 10 largest positions. This shows how top-heavy your portfolio is.",
        )

    with col4:
        single_stock_warning = "Risk: High" if max_single > 15 else "OK"
        single_color = "inverse" if max_single > 15 else "normal"
        st.metric(
            label="Largest Position",
            value=f"{max_single:.1f}%",
            delta=single_stock_warning,
            delta_color=single_color,
            help="Weight of your single largest holding. Positions above 15% create significant single-stock risk - a large price drop would heavily impact your portfolio.",
        )

    # Color-coded concentration interpretation
    if hhi < 0.01:
        st.success(
            "**Well Diversified:** Your portfolio is spread across many positions, "
            "reducing the impact of any single holding on overall performance."
        )
    elif hhi < 0.015:
        st.success(
            "**Diversified:** Your portfolio has good diversification. "
            "Risk is reasonably distributed across your holdings."
        )
    elif hhi < 0.025:
        st.warning(
            "**Moderate Concentration:** A few positions dominate your portfolio. "
            "Consider whether this aligns with your risk tolerance."
        )
    else:
        st.error(
            "**High Concentration:** Your portfolio is heavily weighted in few positions. "
            "A significant drop in one holding would materially impact your portfolio value."
        )

    # Single stock risk alert
    if max_single > 20:
        st.error(
            f"**Single-Stock Alert:** One position represents {max_single:.1f}% of your portfolio. "
            "This level of concentration creates significant idiosyncratic risk."
        )
    elif max_single > 15:
        st.warning(
            f"**Note:** Your largest position ({max_single:.1f}%) exceeds the 15% threshold "
            "often used as a guideline for single-stock concentration."
        )

    # Direct vs Indirect pie chart
    col_left_risk, col_right_risk = st.columns(2)

    with col_left_risk:
        st.markdown("**Direct vs ETF Exposure**")
        fig_split = px.pie(
            values=[direct_pct, indirect_pct],
            names=["Direct Holdings", "Via ETFs (Indirect)"],
            color_discrete_sequence=["#636EFA", "#00CC96"],
            hole=0.4,
        )
        fig_split.update_traces(textposition="inside", textinfo="percent+label")
        fig_split.update_layout(
            height=250, margin=dict(l=0, r=0, t=0, b=0), showlegend=False
        )
        st.plotly_chart(fig_split, use_container_width=True)

    with col_right_risk:
        st.markdown("**Concentration Breakdown**")
        # Show breakdown of top holdings
        top_n = 5
        if not exposure_df.empty and "name" in exposure_df.columns:
            top_holdings = exposure_df.nlargest(top_n, "total_exposure")[
                ["name", "total_exposure"]
            ]
            top_holdings["pct"] = (
                top_holdings["total_exposure"] / exposure_values.sum() * 100
            )
            remaining_pct = 100 - top_holdings["pct"].sum()

            chart_data = pd.DataFrame(
                {
                    "name": list(top_holdings["name"]) + ["Others"],
                    "percentage": list(top_holdings["pct"]) + [remaining_pct],
                }
            )
        else:
            top_holdings = direct_df.nlargest(top_n, "market_value")[
                ["name", "market_value"]
            ]
            top_holdings["pct"] = top_holdings["market_value"] / total_value * 100
            remaining_pct = 100 - top_holdings["pct"].sum()

            chart_data = pd.DataFrame(
                {
                    "name": list(top_holdings["name"]) + ["Others"],
                    "percentage": list(top_holdings["pct"]) + [remaining_pct],
                }
            )

        fig_conc = px.pie(
            chart_data,
            values="percentage",
            names="name",
            color_discrete_sequence=px.colors.qualitative.Set2,
            hole=0.4,
        )
        fig_conc.update_traces(textposition="inside", textinfo="percent")
        fig_conc.update_layout(
            height=250,
            margin=dict(l=0, r=0, t=0, b=0),
            showlegend=True,
            legend=dict(orientation="h", yanchor="bottom", y=-0.3),
        )
        st.plotly_chart(fig_conc, use_container_width=True)

    st.divider()

    # Charts Section
    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("📈 Top 10 Holdings")

        # Use exposure report if available, otherwise direct holdings
        if not exposure_df.empty and "total_exposure" in exposure_df.columns:
            top_10 = exposure_df.nlargest(10, "total_exposure")
            value_col = "total_exposure"
        else:
            top_10 = direct_df.nlargest(10, "market_value")
            value_col = "market_value"

        # Create horizontal bar chart
        fig_top = px.bar(
            top_10.sort_values(value_col),
            x=value_col,
            y="name",
            orientation="h",
            labels={value_col: "Exposure (€)", "name": ""},
            color=value_col,
            color_continuous_scale="Blues",
        )
        fig_top.update_layout(
            showlegend=False, height=400, margin=dict(l=0, r=0, t=0, b=0)
        )
        st.plotly_chart(fig_top, use_container_width=True)

    with col_right:
        st.subheader("🎯 Asset Allocation")

        # Group by asset type
        if "asset_type" in direct_df.columns:
            allocation = (
                direct_df.groupby("asset_type")["market_value"].sum().reset_index()
            )
            allocation.columns = ["Asset Type", "Value"]

            # Create pie chart
            fig_pie = px.pie(
                allocation,
                values="Value",
                names="Asset Type",
                color_discrete_sequence=px.colors.qualitative.Set3,
            )
            fig_pie.update_traces(textposition="inside", textinfo="percent+label")
            fig_pie.update_layout(height=400, margin=dict(l=0, r=0, t=0, b=0))
            st.plotly_chart(fig_pie, use_container_width=True)
        else:
            st.info("Asset type information not available.")

    st.divider()

    # Detailed Holdings Table
    st.subheader("📋 All Holdings")

    display_df = direct_df[["name", "isin", "asset_type", "market_value"]].copy()
    display_df = display_df.sort_values("market_value", ascending=False)

    # Calculate percentage
    display_df["percentage"] = display_df["market_value"] / total_value * 100

    st.dataframe(
        display_df.rename(
            columns={
                "name": "Name",
                "isin": "ISIN",
                "asset_type": "Type",
                "market_value": "Value (€)",
                "percentage": "% of Portfolio",
            }
        ),
        column_config={
            "Value (€)": st.column_config.NumberColumn(format="€%.2f"),
            "% of Portfolio": st.column_config.NumberColumn(format="%.2f%%"),
        },
        use_container_width=True,
        hide_index=True,
    )
