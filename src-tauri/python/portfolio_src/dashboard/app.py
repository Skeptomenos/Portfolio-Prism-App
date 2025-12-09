import streamlit as st
from pathlib import Path
from portfolio_src.config import DIRECT_HOLDINGS_REPORT

# Import tabs - using absolute imports for bundle compatibility
try:
    from portfolio_src.dashboard.tabs import (
        pipeline_health,
        holdings_analysis,
        data_manager,
        portfolio_xray,
        performance,
        etf_overlap,
        missing_data,
        trade_republic,
    )
except ImportError as e:
    st.error(f"Failed to import dashboard modules: {e}")
    st.stop()

st.set_page_config(
    page_title="Portfolio Analysis System",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="collapsed",
)

st.title("📊 Portfolio Analysis System")

# Determine startup state: Only show TR Login first if we have no data
has_data = DIRECT_HOLDINGS_REPORT.exists()

# Define tab structure based on data availability
if has_data:
    # Data exists: Prioritize Analysis view, move Sync to end
    tabs_structure = [
        ("📈 Performance", performance),
        ("🔍 Portfolio X-Ray", portfolio_xray),
        ("🔄 ETF Overlap", etf_overlap),
        ("📦 Holdings Analysis", holdings_analysis),
        ("🔐 TR Sync", trade_republic),
        ("🛠️ Data Manager", data_manager),
        ("🏥 Pipeline Health", pipeline_health),
        ("❓ Missing Data", missing_data),
    ]
else:
    # No data: Prioritize Login/Sync to get data
    tabs_structure = [
        ("🔐 TR Login", trade_republic),
        ("📈 Performance", performance),
        ("🔍 Portfolio X-Ray", portfolio_xray),
        ("🔄 ETF Overlap", etf_overlap),
        ("📦 Holdings Analysis", holdings_analysis),
        ("🛠️ Data Manager", data_manager),
        ("🏥 Pipeline Health", pipeline_health),
        ("❓ Missing Data", missing_data),
    ]

# Render tabs
tab_titles = [t[0] for t in tabs_structure]
tabs = st.tabs(tab_titles)

for tab_container, (title, module) in zip(tabs, tabs_structure):
    with tab_container:
        if module:
            module.render()
        else:
            st.error(f"{title} unavailable")
