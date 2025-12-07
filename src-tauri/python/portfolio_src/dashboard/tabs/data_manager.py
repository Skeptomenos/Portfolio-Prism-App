import streamlit as st
import pandas as pd
import shutil
from datetime import datetime
from pathlib import Path
from dashboard.utils import load_asset_universe
from data.holdings_cache import get_holdings_cache, MANUAL_UPLOAD_DIR
from data.community_sync import get_community_sync
from data.holdings_normalizer import normalize_holdings

# Constants
PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
UNIVERSE_PATH = CONFIG_DIR / "asset_universe.csv"


def save_universe(df: pd.DataFrame) -> bool:
    """Save the asset universe with backup and validation."""

    # Backup first
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = CONFIG_DIR / f"asset_universe.csv.bak.{timestamp}"

    try:
        if UNIVERSE_PATH.exists():
            shutil.copy(UNIVERSE_PATH, backup_path)
            st.success(f"✅ Backup created: {backup_path.name}")

        # Validation
        errors = []

        # Check for duplicate ISINs
        dupes = df[df["ISIN"].duplicated(keep=False)]
        if not dupes.empty:
            errors.append(f"⚠️ Duplicate ISINs found: {dupes['ISIN'].unique().tolist()}")

        # Check for empty ISINs
        empty_isins = df[df["ISIN"].isna() | (df["ISIN"] == "")]
        if not empty_isins.empty:
            errors.append(f"⚠️ {len(empty_isins)} rows have empty ISINs")

        # Display warnings but don't block
        if errors:
            for error in errors:
                st.warning(error)

        # Save
        df.to_csv(UNIVERSE_PATH, index=False)
        st.success("✅ Saved successfully!")

        # Clear cache to reload fresh data
        st.cache_data.clear()

        return True

    except Exception as e:
        st.error(f"❌ Failed to save: {e}")
        return False


def render():
    st.header("🛠️ Data Manager")

    st.caption(
        "Manage your asset universe database. Add missing securities, fix ticker mappings, "
        "or resolve data issues flagged by the pipeline."
    )

    # Check for pending fix from Health tab
    if "pending_fix" in st.session_state and st.session_state.pending_fix:
        fix = st.session_state.pending_fix
        st.info(
            f"💡 **Fix Request:** Add ISIN for `{fix.get('ticker')}` — {fix.get('fix_hint')}"
        )

        if st.button("Clear Fix Request"):
            st.session_state.pending_fix = None
            st.rerun()

    st.divider()

    # Load current universe
    universe_df = load_asset_universe()

    if universe_df.empty:
        st.error("Asset universe file not found or empty.")
        return

    # Statistics
    st.subheader("📊 Universe Statistics")
    col1, col2, col3 = st.columns(3)
    col1.metric(
        "Total Assets",
        len(universe_df),
        help="Total number of securities in your asset universe database. This includes all stocks and ETFs the system knows about.",
    )

    if "Asset_Class" in universe_df.columns:
        asset_counts = universe_df["Asset_Class"].value_counts()
        col2.metric(
            "Asset Types",
            len(asset_counts),
            help="Number of different asset categories (e.g., Stock, ETF, Bond).",
        )
        col3.metric(
            "Most Common",
            asset_counts.index[0] if not asset_counts.empty else "N/A",
            help="The asset type that appears most frequently in your universe.",
        )

    st.divider()

    # Filters
    st.subheader("🔍 Filters")

    filter_col1, filter_col2, filter_col3 = st.columns(3)

    with filter_col1:
        search_term = st.text_input(
            "Search by Name or ISIN",
            placeholder="e.g., Apple or US0378331005",
            help="Case-insensitive search",
        )

    with filter_col2:
        asset_types = (
            ["All"] + sorted(universe_df["Asset_Class"].dropna().unique().tolist())
            if "Asset_Class" in universe_df.columns
            else ["All"]
        )
        selected_type = st.selectbox("Asset Type", asset_types)

    with filter_col3:
        provider_options = (
            ["All"] + sorted(universe_df["Provider"].dropna().unique().tolist())
            if "Provider" in universe_df.columns
            else ["All"]
        )
        selected_provider = st.selectbox("Provider", provider_options)

    # Apply filters
    filtered_df = universe_df.copy()

    if search_term:
        mask = filtered_df["Name"].str.contains(
            search_term, case=False, na=False
        ) | filtered_df["ISIN"].str.contains(search_term, case=False, na=False)
        filtered_df = filtered_df[mask]

    if selected_type != "All":
        filtered_df = filtered_df[filtered_df["Asset_Class"] == selected_type]

    if selected_provider != "All":
        filtered_df = filtered_df[filtered_df["Provider"] == selected_provider]

    # Show filter results
    if len(filtered_df) < len(universe_df):
        st.caption(f"Showing {len(filtered_df)} of {len(universe_df)} assets")

    st.divider()

    st.subheader("Asset Universe Editor")
    st.caption(f"Editing: `{UNIVERSE_PATH}`")

    # Display editor with filtered data
    edited_df = st.data_editor(
        filtered_df,
        num_rows="dynamic",
        column_config={
            "ISIN": st.column_config.TextColumn("ISIN", required=True, width="medium"),
            "Name": st.column_config.TextColumn("Name", width="large"),
            "Yahoo_Ticker": st.column_config.TextColumn("Ticker", width="medium"),
            "Asset_Class": st.column_config.SelectboxColumn(
                "Type", options=["Stock", "ETF", "Bond", "Commodity"], width="small"
            ),
            "Provider": st.column_config.TextColumn("Provider", width="medium"),
        },
        use_container_width=True,
        hide_index=True,
        key="universe_editor",
    )

    st.divider()

    # Save button
    col1, col2, col3 = st.columns([1, 2, 2])
    with col1:
        if st.button("💾 Save Changes", type="primary"):
            # Merge edited filtered data back into full dataset
            if len(filtered_df) < len(universe_df):
                # User edited a filtered view, need to merge back
                # Update only the rows that were visible
                for idx in edited_df.index:
                    universe_df.loc[idx] = edited_df.loc[idx]
                final_df = universe_df
            else:
                # User edited full dataset
                final_df = edited_df

            if save_universe(final_df):
                # Clear pending fix after successful save
                if "pending_fix" in st.session_state:
                    st.session_state.pending_fix = None

    with col2:
        st.caption("Changes will be backed up automatically before saving.")

    with col3:
        if st.button("🔄 Reset Filters"):
            st.rerun()

    # =========================================================================
    # Holdings Cache Management Section
    # =========================================================================
    st.divider()
    st.subheader("📦 Holdings Cache Management")
    st.caption(
        "Manage ETF holdings data. The cache provides offline access to ETF compositions "
        "for look-through analysis."
    )

    # Initialize cache and sync
    holdings_cache = get_holdings_cache()
    community_sync = get_community_sync()

    # Cache Statistics
    cache_stats = holdings_cache.get_cache_stats()
    sync_stats = community_sync.get_sync_stats()

    stat_col1, stat_col2, stat_col3, stat_col4 = st.columns(4)
    stat_col1.metric(
        "Local Cache",
        cache_stats["local_count"],
        help="ETFs cached locally for fast offline access",
    )
    stat_col2.metric(
        "Community Data",
        cache_stats["community_count"],
        help="ETFs available from community contributions",
    )
    stat_col3.metric(
        "Fresh / Stale",
        f"{cache_stats['local_fresh']} / {cache_stats['local_stale']}",
        help="Fresh entries are less than 7 days old",
    )
    stat_col4.metric(
        "Last Sync",
        _format_last_sync(sync_stats.get("last_sync")),
        help="When community data was last synchronized",
    )

    # Action buttons row
    st.write("")  # Spacer
    action_col1, action_col2, action_col3 = st.columns(3)

    with action_col1:
        if st.button("🔄 Sync Community Data", type="secondary"):
            with st.spinner("Syncing with GitHub..."):
                try:
                    results = community_sync.pull_community_data()
                    if results["downloaded"]:
                        st.success(
                            f"Downloaded {len(results['downloaded'])} ETFs: "
                            f"{', '.join(results['downloaded'][:5])}"
                            f"{'...' if len(results['downloaded']) > 5 else ''}"
                        )
                    if results["skipped"]:
                        st.info(
                            f"Skipped {len(results['skipped'])} (already up-to-date)"
                        )
                    if results["failed"]:
                        st.warning(f"Failed: {', '.join(results['failed'])}")
                    if not results["downloaded"] and not results["failed"]:
                        st.info("Already up-to-date!")
                    st.rerun()
                except Exception as e:
                    st.error(f"Sync failed: {e}")

    with action_col2:
        if st.button("🗑️ Clear Local Cache", type="secondary"):
            holdings_cache.clear_local_cache()
            st.success("Local cache cleared!")
            st.rerun()

    with action_col3:
        available_isins = holdings_cache.list_available_isins()
        st.caption(f"{len(available_isins)} ETFs available for look-through")

    # Manual Upload Section
    st.divider()
    st.subheader("📤 Manual Holdings Upload")
    st.caption(
        "Upload ETF holdings files manually. Useful for ETFs that require login "
        "or aren't available via automated fetching."
    )

    upload_col1, upload_col2 = st.columns([2, 1])

    with upload_col1:
        uploaded_file = st.file_uploader(
            "Upload Holdings File",
            type=["csv", "xlsx", "xls"],
            help="Upload a CSV or Excel file with ETF holdings. Must contain ISIN and weight columns.",
        )

    with upload_col2:
        manual_isin = st.text_input(
            "ETF ISIN",
            placeholder="e.g., IE00B4L5Y983",
            help="The ISIN of the ETF these holdings belong to",
        )

    if uploaded_file and manual_isin:
        # Preview and process
        st.write("**Preview:**")
        try:
            # Read the file
            if uploaded_file.name.endswith(".csv"):
                raw_df = pd.read_csv(uploaded_file)
            else:
                raw_df = pd.read_excel(uploaded_file)

            # Show raw preview
            st.dataframe(raw_df.head(10), use_container_width=True)
            st.caption(f"Rows: {len(raw_df)}, Columns: {list(raw_df.columns)}")

            # Try to normalize
            normalized_df = normalize_holdings(raw_df)
            issues = []  # normalize_holdings logs issues internally

            if issues:
                for issue in issues:
                    st.warning(f"⚠️ {issue}")

            if not normalized_df.empty:
                st.success(
                    f"Normalized to {len(normalized_df)} holdings "
                    f"(total weight: {normalized_df['weight_percentage'].sum():.1f}%)"
                )

                if st.button("💾 Save to Cache", type="primary"):
                    # Save the normalized file
                    holdings_cache._save_to_local_cache(
                        isin=manual_isin.strip().upper(),
                        holdings=normalized_df,
                        source="manual_upload",
                    )
                    st.success(f"Saved {manual_isin} to cache!")
                    st.rerun()
            else:
                st.error(
                    "Could not normalize file. Please ensure it has ISIN/Name and Weight columns."
                )

        except Exception as e:
            st.error(f"Failed to read file: {e}")

    # Available ETFs browser
    with st.expander("Browse Available ETFs", expanded=False):
        available_isins = holdings_cache.list_available_isins()
        if available_isins:
            # Create a simple table
            etf_data = []
            for isin in available_isins[:50]:  # Limit to 50 for performance
                meta = holdings_cache._local_metadata.get(
                    isin, holdings_cache._community_metadata.get(isin, {})
                )
                etf_data.append(
                    {
                        "ISIN": isin,
                        "Name": meta.get("name", isin),
                        "Holdings": meta.get("holdings_count", "?"),
                        "Source": meta.get("source", "community"),
                    }
                )
            st.dataframe(
                pd.DataFrame(etf_data), use_container_width=True, hide_index=True
            )
            if len(available_isins) > 50:
                st.caption(f"Showing 50 of {len(available_isins)} ETFs")
        else:
            st.info("No ETFs in cache. Sync community data or upload manually.")


def _format_last_sync(last_sync) -> str:
    """Format last sync timestamp for display."""
    if not last_sync:
        return "Never"
    try:
        sync_time = datetime.fromisoformat(last_sync)
        age = datetime.now() - sync_time
        if age.days > 0:
            return f"{age.days}d ago"
        elif age.seconds > 3600:
            return f"{age.seconds // 3600}h ago"
        else:
            return f"{age.seconds // 60}m ago"
    except Exception:
        return "Unknown"
