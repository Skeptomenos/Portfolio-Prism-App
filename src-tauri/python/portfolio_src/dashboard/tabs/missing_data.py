"""
Missing Data Tab

Displays enrichment gaps and allows users to manually provide ISINs
for holdings that couldn't be resolved automatically.
"""

import pandas as pd
import streamlit as st

from src.core.enrichment_gaps import load_enrichment_gaps
from src.data.manual_enrichments import (
    load_manual_enrichments,
    save_manual_enrichments_bulk,
    load_suggested_isins,
)
from src.utils.isin_validator import is_valid_isin


def render():
    """Render the Missing Data tab."""
    st.header("Missing Data")

    # Load gaps
    gaps_data = load_enrichment_gaps()
    summary = gaps_data.get("summary", {})
    gaps = gaps_data.get("gaps", [])
    generated_at = gaps_data.get("generated_at")

    # Summary metrics
    col1, col2, col3, col4 = st.columns(4)

    coverage = summary.get("portfolio_coverage", 100)
    total_gaps = summary.get("total_gaps", 0)
    weight_affected = summary.get("total_weight_affected", 0)
    high_priority = summary.get("high_priority_count", 0)

    col1.metric("Coverage", f"{coverage:.1f}%")
    col2.metric("Gaps", total_gaps)
    col3.metric("Weight Affected", f"{weight_affected:.2f}%")
    col4.metric("High Priority", high_priority)

    if total_gaps == 0:
        st.success("All holdings resolved! No manual enrichment needed.")
        if generated_at:
            st.caption(f"Last pipeline run: {generated_at}")
        return

    # Explanation
    st.info(f"""
    **What this means:** {total_gaps} holdings couldn't be matched to their ISIN 
    (International Securities Identification Number). These represent 
    {weight_affected:.2f}% of your portfolio.

    Without ISINs, these holdings appear as "Unknown" in reports and can't be 
    deduplicated across ETFs. You can manually provide ISINs below.
    """)

    if generated_at:
        st.caption(f"Data from pipeline run: {generated_at}")

    # Load suggestions and existing manual enrichments
    suggestions = load_suggested_isins()
    manual = load_manual_enrichments()

    # Priority filter
    priority_filter = st.selectbox(
        "Filter by priority",
        ["All", "High", "Medium", "Low"],
        index=0,
    )

    # Filter gaps
    if priority_filter != "All":
        gaps = [
            g for g in gaps if g.get("priority", "").lower() == priority_filter.lower()
        ]

    if not gaps:
        st.warning(f"No {priority_filter.lower()} priority gaps found.")
        return

    # Build editable dataframe
    rows = []
    for gap in gaps:
        ticker = gap.get("ticker", "")
        name = gap.get("name", "")
        source_etf = gap.get("source_etf_name", "")
        weight = gap.get("weight_in_portfolio", 0)
        priority = gap.get("priority", "low")
        reason = gap.get("failure_reason", "")

        # Check for suggestion
        suggestion = suggestions.get(ticker.upper(), {})
        suggested_isin = suggestion.get("isin", "")

        # Check if already manually enriched
        existing_isin = manual.get(ticker.upper(), "")

        rows.append(
            {
                "ticker": ticker,
                "name": name[:40] + "..." if len(name) > 40 else name,
                "source_etf": source_etf[:30] + "..."
                if len(source_etf) > 30
                else source_etf,
                "weight": f"{weight:.3f}%",
                "priority": priority.capitalize(),
                "suggested_isin": suggested_isin,
                "existing_isin": existing_isin,
                "isin_input": existing_isin
                or suggested_isin,  # Pre-fill with existing or suggestion
            }
        )

    df = pd.DataFrame(rows)

    # Display as editable table
    st.subheader("Manual Enrichment")

    st.markdown("""
    Enter ISINs for the holdings below. You can:
    - Accept suggestions (pre-filled) by leaving as-is
    - Enter a new ISIN (12 characters, e.g., US7591EP1005)
    - Leave blank to skip
    """)

    edited_df = st.data_editor(
        df,
        column_config={
            "ticker": st.column_config.TextColumn(
                "Ticker", disabled=True, width="small"
            ),
            "name": st.column_config.TextColumn("Name", disabled=True, width="medium"),
            "source_etf": st.column_config.TextColumn(
                "Source ETF", disabled=True, width="medium"
            ),
            "weight": st.column_config.TextColumn(
                "Weight", disabled=True, width="small"
            ),
            "priority": st.column_config.TextColumn(
                "Priority", disabled=True, width="small"
            ),
            "suggested_isin": st.column_config.TextColumn(
                "Suggested", disabled=True, width="medium"
            ),
            "existing_isin": None,  # Hide this column
            "isin_input": st.column_config.TextColumn(
                "Enter ISIN",
                help="12-character ISIN (e.g., US7591EP1005)",
                width="medium",
            ),
        },
        hide_index=True,
        use_container_width=True,
        disabled=[
            "ticker",
            "name",
            "source_etf",
            "weight",
            "priority",
            "suggested_isin",
        ],
    )

    # Save button
    col1, col2 = st.columns([1, 4])
    with col1:
        if st.button("Save Enrichments", type="primary"):
            # Extract filled ISINs
            to_save = {}
            errors = []

            for _, row in edited_df.iterrows():
                ticker = row["ticker"]
                isin_input = row.get("isin_input", "")

                if not isin_input or not isinstance(isin_input, str):
                    continue

                isin_input = isin_input.strip().upper()
                if not isin_input:
                    continue

                if not is_valid_isin(isin_input):
                    errors.append(f"Invalid ISIN for {ticker}: {isin_input}")
                    continue

                to_save[ticker] = isin_input

            if to_save:
                success_count, save_errors = save_manual_enrichments_bulk(to_save)
                errors.extend(save_errors)

                if success_count > 0:
                    st.success(
                        f"Saved {success_count} enrichment(s)! Re-run pipeline to apply."
                    )

            if errors:
                for error in errors:
                    st.error(error)

            if not to_save and not errors:
                st.info("No changes to save.")

    with col2:
        st.caption(
            "After saving, re-run the pipeline to apply the enrichments. "
            "Manual enrichments are saved to `config/manual_enrichments.json`."
        )

    # Show existing manual enrichments
    with st.expander("View existing manual enrichments"):
        if manual:
            manual_df = pd.DataFrame(
                [{"Ticker": k, "ISIN": v} for k, v in sorted(manual.items())]
            )
            st.dataframe(manual_df, use_container_width=True, hide_index=True)
        else:
            st.info("No manual enrichments saved yet.")
