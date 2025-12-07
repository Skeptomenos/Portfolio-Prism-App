import streamlit as st
from pathlib import Path

# Import tabs - prism_boot.py adds portfolio_src to sys.path
# so we import relative to that
from dashboard.tabs import (
    pipeline_health,
    holdings_analysis,
    data_manager,
    portfolio_xray,
    performance,
    etf_overlap,
    missing_data,
)
from dashboard.pages import tr_login

st.set_page_config(
    page_title="Portfolio Analysis System",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.title("📊 Portfolio Analysis System")

# Tabs - Performance first as it's the primary user interest
tab1, tab2, tab3, tab4, tab5, tab6, tab7, tab8 = st.tabs(
    [
        "📈 Performance",
        "🔍 Portfolio X-Ray",
        "🔄 ETF Overlap",
        "📦 Holdings Analysis",
        "🛠️ Data Manager",
        "🏥 Pipeline Health",
        "❓ Missing Data",
        "🔐 TR Login",
    ]
)

with tab1:
    performance.render()

with tab2:
    portfolio_xray.render()

with tab3:
    etf_overlap.render()

with tab4:
    holdings_analysis.render()

with tab5:
    data_manager.render()

with tab6:
    pipeline_health.render()

with tab7:
    missing_data.render()

with tab8:
    tr_login.render_login_ui()
