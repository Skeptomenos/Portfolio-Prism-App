import streamlit as st
import pandas as pd
from portfolio_src.dashboard.utils import (
    load_direct_holdings,
    load_holdings_breakdown,
    get_isin_name_mapping,
)


def render_etf_explorer(direct_df: pd.DataFrame, breakdown_df: pd.DataFrame):
    """Render the 'What's inside this ETF?' view."""
    st.subheader("📦 ETF Explorer")

    # Filter for ETFs only
    etf_options = direct_df[direct_df["asset_type"] == "ETF"].sort_values("name")

    if etf_options.empty:
        st.warning("No ETFs found in direct holdings.")
        return

    # Select ETF
    selected_name = st.selectbox(
        "Select ETF to Inspect", etf_options["name"].tolist(), index=0
    )

    # Get ISIN for selected ETF
    etf_isin = etf_options[etf_options["name"] == selected_name]["isin"].iloc[0]

    # Filter breakdown for this parent
    holdings = breakdown_df[breakdown_df["parent_isin"] == etf_isin].copy()

    if holdings.empty:
        st.info(f"No holdings found for {selected_name} ({etf_isin}).")
        return

    # Summary Stats
    col1, col2, col3 = st.columns(3)
    col1.metric(
        "Holdings Count",
        len(holdings),
        help="Number of individual securities held within this ETF.",
    )
    col2.metric(
        "Total Value in Portfolio",
        f"€{holdings['value_eur'].sum():,.2f}",
        help="Your proportional share of this ETF's underlying holdings based on your investment amount.",
    )

    # Safe mode extraction
    sector_mode = holdings["sector"].mode()
    top_sector = sector_mode[0] if len(sector_mode) > 0 else "N/A"
    col3.metric(
        "Top Sector",
        top_sector,
        help="The most common sector among this ETF's holdings. This indicates the ETF's primary focus.",
    )

    # Table
    st.dataframe(
        holdings[
            [
                "child_name",
                "child_isin",
                "weight_percent",
                "value_eur",
                "sector",
                "geography",
            ]
        ]
        .sort_values("value_eur", ascending=False)
        .rename(
            columns={
                "child_name": "Name",
                "child_isin": "ISIN",
                "weight_percent": "Weight (%)",
                "value_eur": "Value (€)",
                "sector": "Sector",
                "geography": "Region",
            }
        ),
        column_config={
            "Weight (%)": st.column_config.NumberColumn(format="%.4f%%"),
            "Value (€)": st.column_config.NumberColumn(format="€%.2f"),
        },
        use_container_width=True,
        hide_index=True,
    )


def calculate_exposure(
    isin: str, direct_df: pd.DataFrame, breakdown_df: pd.DataFrame
) -> tuple:
    """
    Calculate direct and indirect exposure for a given ISIN.

    Args:
        isin: The ISIN to calculate exposure for
        direct_df: Direct holdings DataFrame
        breakdown_df: Holdings breakdown DataFrame

    Returns:
        tuple: (direct_value, indirect_value, indirect_matches_df)
    """
    # Direct exposure
    direct_match = direct_df[direct_df["isin"] == isin]
    direct_val = direct_match["market_value"].sum() if not direct_match.empty else 0.0

    # Indirect exposure (via ETFs)
    indirect_match = breakdown_df[
        (breakdown_df["child_isin"] == isin) & (breakdown_df["parent_isin"] != "DIRECT")
    ]
    indirect_val = indirect_match["value_eur"].sum()

    return direct_val, indirect_val, indirect_match


def render_security_card(
    result: dict,
    direct_df: pd.DataFrame,
    breakdown_df: pd.DataFrame,
    expanded: bool = True,
):
    """
    Render an expandable card for a single security.

    Args:
        result: Dict with isin, name, direct, indirect, total, direct_pct
        direct_df: Direct holdings DataFrame
        breakdown_df: Holdings breakdown DataFrame
        expanded: Whether the card should be expanded by default
    """
    isin = result["isin"]
    name = result["name"]
    direct_val = result["direct"]
    indirect_val = result["indirect"]
    total_val = result["total"]

    # Get indirect matches for the sources table
    indirect_match = breakdown_df[
        (breakdown_df["child_isin"] == isin) & (breakdown_df["parent_isin"] != "DIRECT")
    ]

    # Count sources
    num_sources = (1 if direct_val > 0 else 0) + len(indirect_match)

    # Build header
    header = f"{name} ({isin}) - Total: €{total_val:,.2f}"

    with st.expander(header, expanded=expanded):
        # Summary metrics row
        c1, c2, c3 = st.columns(3)
        c1.metric(
            "Total Exposure",
            f"€{total_val:,.2f}",
            help="Your combined exposure to this security from all sources (direct holdings + ETF holdings).",
        )
        c2.metric(
            "Direct",
            f"€{direct_val:,.2f}",
            delta=f"{direct_val / total_val:.0%}" if total_val > 0 else "0%",
            help="Value of this security held directly in your portfolio (not through ETFs).",
        )
        c3.metric(
            "Via ETFs",
            f"€{indirect_val:,.2f}",
            delta=f"{indirect_val / total_val:.0%}" if total_val > 0 else "0%",
            help="Value of this security held indirectly through your ETFs. This is your 'hidden' exposure.",
        )

        # Sources table
        if total_val > 0:
            sources = []

            # Add Direct if exists
            if direct_val > 0:
                sources.append(
                    {
                        "Source": "Direct Portfolio",
                        "Type": "Direct",
                        "Weight": "100%",
                        "Value (€)": direct_val,
                    }
                )

            # Add ETFs
            for _, row in indirect_match.iterrows():
                sources.append(
                    {
                        "Source": row["parent_name"],
                        "Type": "ETF",
                        "Weight": f"{row['weight_percent']:.2f}%",
                        "Value (€)": row["value_eur"],
                    }
                )

            source_df = pd.DataFrame(sources)

            st.dataframe(
                source_df,
                column_config={
                    "Value (€)": st.column_config.NumberColumn(format="€%.2f")
                },
                use_container_width=True,
                hide_index=True,
            )


def render_stock_lookup(direct_df: pd.DataFrame, breakdown_df: pd.DataFrame):
    """
    Render the 'Where is my exposure?' view with fuzzy search.

    Features:
    - Text input search with 3-character minimum
    - Shows all matching securities as expandable cards
    - User-selectable sort order (Name, Total Exposure, Direct %)
    - First 3 results expanded, rest collapsed
    - Maximum 20 results shown with "refine search" message
    """
    st.subheader("🔍 Stock Exposure Lookup")

    # Build ISIN -> canonical name mapping
    isin_to_name = get_isin_name_mapping(breakdown_df)

    if not isin_to_name:
        st.warning("No holdings data available.")
        return

    # Search input and sort selector in columns
    col1, col2 = st.columns([3, 1])
    with col1:
        search_term = st.text_input(
            "Search for a Stock",
            placeholder="Type at least 3 characters (e.g., alphabet, apple, nvidia)...",
            label_visibility="collapsed",
        )
    with col2:
        sort_by = st.selectbox(
            "Sort by",
            ["Name (A-Z)", "Total Exposure", "Direct %"],
            index=0,
            label_visibility="collapsed",
        )

    # Minimum 3 characters required
    if len(search_term) < 3:
        st.info("Type at least 3 characters to search.")
        return

    # Filter matches (case-insensitive name search)
    search_lower = search_term.lower()
    matches = {
        isin: name
        for isin, name in isin_to_name.items()
        if search_lower in name.lower()
    }

    if not matches:
        st.warning(f"No securities found matching '{search_term}'")
        return

    # Calculate exposure for each match
    results = []
    for isin, name in matches.items():
        direct_val, indirect_val, _ = calculate_exposure(isin, direct_df, breakdown_df)
        total_val = direct_val + indirect_val
        direct_pct = direct_val / total_val if total_val > 0 else 0.0

        results.append(
            {
                "isin": isin,
                "name": name,
                "direct": direct_val,
                "indirect": indirect_val,
                "total": total_val,
                "direct_pct": direct_pct,
            }
        )

    # Sort based on user selection
    if sort_by == "Name (A-Z)":
        results.sort(key=lambda x: x["name"].lower())
    elif sort_by == "Total Exposure":
        results.sort(key=lambda x: x["total"], reverse=True)
    else:  # Direct %
        results.sort(key=lambda x: x["direct_pct"], reverse=True)

    # Limit results
    MAX_RESULTS = 20
    total_matches = len(results)

    if total_matches > MAX_RESULTS:
        st.warning(
            f"Showing {MAX_RESULTS} of {total_matches} matches. "
            "Refine your search for more specific results."
        )
        results = results[:MAX_RESULTS]
    else:
        st.success(f"Found {total_matches} matching securities")

    # Render expandable cards (first 3 expanded, rest collapsed)
    for i, result in enumerate(results):
        expanded = i < 3  # First 3 expanded
        render_security_card(result, direct_df, breakdown_df, expanded)


def render():
    st.header("Holdings Analysis")

    st.caption(
        "Drill into individual ETFs to see their underlying holdings, or search for any stock "
        "to see your total exposure from all sources (direct + via ETFs)."
    )

    # Load Data
    direct_df = load_direct_holdings()
    breakdown_df = load_holdings_breakdown()

    if direct_df.empty or breakdown_df.empty:
        st.error("Missing data. Please run the pipeline first.")
        return

    # Mode Toggle
    mode = st.radio(
        "Analysis Mode",
        ["📦 Explore ETF", "🔍 Search Stock"],
        horizontal=True,
        label_visibility="collapsed",
    )

    st.divider()

    if mode == "📦 Explore ETF":
        render_etf_explorer(direct_df, breakdown_df)
    else:
        render_stock_lookup(direct_df, breakdown_df)
