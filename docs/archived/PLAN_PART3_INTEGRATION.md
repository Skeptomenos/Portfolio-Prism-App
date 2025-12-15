# Analytics Pipeline — Part 3: UI & Integration

> **Phases:** 2.5, 3, 4 (8-11 hours)
> **Prerequisites:** Complete Phase 2 from [Part 2](./PLAN_PART2_SERVICES.md)

---

## Overview

This part covers:
- **Phase 2.5:** Harvesting, on-demand charts, automatic error reporting
- **Phase 3:** UI integration with progress and error display
- **Phase 4:** Validation and testing
- **Reference:** Architecture, React migration, decision log

---

## Phase 2.5: Harvesting & Charts & Error Reporting (3-4 hours)

| Task | File | Action |
|------|------|--------|
| **2.5.1** | `core/harvesting.py` | Create from `harvest_enrichment.py` with config paths |
| **2.5.2** | `core/harvesting.py` | Make callable independently (returns count) |
| **2.5.3** | `dashboard/utils/__init__.py` | Create utils package |
| **2.5.4** | `dashboard/utils/charts.py` | Create on-demand chart generation |
| **2.5.5** | `dashboard/utils/charts.py` | Add `matplotlib.use('Agg')` before pyplot |
| **2.5.6** | `dashboard/utils/charts.py` | Return `BytesIO` for Streamlit, not file paths |
| **2.5.7** | `prism_utils/error_reporter.py` | Add `report_to_github()` via Cloudflare proxy |
| **2.5.8** | `prism_utils/error_reporter.py` | Anonymize errors — keep ISINs, remove portfolio values |
| **2.5.9** | Test | Test module imports in bundled environment |

---

## Harvesting Module

```python
# core/harvesting.py
import json
import csv
import os
from typing import Set
from portfolio_src.config import ENRICHMENT_CACHE_PATH, ASSET_UNIVERSE_PATH


def load_universe_isins() -> Set[str]:
    """Load existing ISINs from asset_universe.csv."""
    existing_isins = set()
    if os.path.exists(ASSET_UNIVERSE_PATH):
        with open(ASSET_UNIVERSE_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                if row.get("ISIN"):
                    existing_isins.add(row["ISIN"])
    return existing_isins


def harvest_cache() -> int:
    """
    Harvest validated enrichment data and add to asset_universe.csv.
    
    Returns:
        Number of new securities added
    """
    if not os.path.exists(ENRICHMENT_CACHE_PATH):
        return 0

    with open(ENRICHMENT_CACHE_PATH, "r", encoding="utf-8") as f:
        cache_data = json.load(f)

    existing_isins = load_universe_isins()
    new_entries = []

    for key, data in cache_data.items():
        isin = data.get("isin")
        
        # Skip invalid entries
        if not isin or isin in ["N/A", "UNKNOWN"] or isin.startswith("UNKNOWN_"):
            continue
        if isin in existing_isins:
            continue

        new_entry = {
            "ISIN": isin,
            "TR_Ticker": data.get("raw_ticker") or data.get("ticker"),
            "Yahoo_Ticker": data.get("ticker"),
            "Name": data.get("name", "Unknown"),
            "Provider": "",
            "Asset_Class": "Stock",
        }
        new_entries.append(new_entry)
        existing_isins.add(isin)

    if not new_entries:
        return 0

    # Append to CSV
    fieldnames = ["ISIN", "TR_Ticker", "Yahoo_Ticker", "Name", "Provider", "Asset_Class"]
    file_exists = os.path.exists(ASSET_UNIVERSE_PATH)

    with open(ASSET_UNIVERSE_PATH, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        writer.writerows(new_entries)

    return len(new_entries)
```

---

## On-Demand Chart Generation

```python
# dashboard/utils/charts.py
import matplotlib
matplotlib.use('Agg')  # Must be before pyplot import

import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
from io import BytesIO
from typing import Optional


def generate_sector_chart(exposure_df: pd.DataFrame) -> Optional[BytesIO]:
    """Generate sector pie chart, return as bytes for Streamlit."""
    if exposure_df.empty or 'sector' not in exposure_df.columns:
        return None

    sector_data = exposure_df.groupby('sector')['total_exposure'].sum()
    sector_data = sector_data.sort_values(ascending=False)

    # Group small slices into "Other"
    if len(sector_data) > 10:
        top_10 = sector_data.head(10)
        other = pd.Series({'Other': sector_data.iloc[10:].sum()})
        sector_data = pd.concat([top_10, other])

    fig, ax = plt.subplots(figsize=(10, 7))
    colors = plt.cm.Paired(np.linspace(0, 1, len(sector_data)))

    wedges, texts, autotexts = ax.pie(
        sector_data.values,
        labels=sector_data.index,
        autopct='%1.1f%%',
        colors=colors,
        startangle=90,
        pctdistance=0.85,
    )

    # Donut style
    centre_circle = plt.Circle((0, 0), 0.70, fc='white')
    ax.add_artist(centre_circle)
    ax.set_title("Sector Allocation", pad=20)

    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    plt.close(fig)

    return buf


def generate_geography_chart(exposure_df: pd.DataFrame) -> Optional[BytesIO]:
    """Generate geography pie chart."""
    if exposure_df.empty or 'geography' not in exposure_df.columns:
        return None

    geo_data = exposure_df.groupby('geography')['total_exposure'].sum()
    geo_data = geo_data.sort_values(ascending=False)

    if len(geo_data) > 10:
        top_10 = geo_data.head(10)
        other = pd.Series({'Other': geo_data.iloc[10:].sum()})
        geo_data = pd.concat([top_10, other])

    fig, ax = plt.subplots(figsize=(10, 7))
    colors = plt.cm.Set3(np.linspace(0, 1, len(geo_data)))

    ax.pie(
        geo_data.values,
        labels=geo_data.index,
        autopct='%1.1f%%',
        colors=colors,
        startangle=90,
    )
    ax.set_title("Geographic Exposure", pad=20)

    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    plt.close(fig)

    return buf


def generate_top_holdings_chart(
    exposure_df: pd.DataFrame, top_n: int = 15
) -> Optional[BytesIO]:
    """Generate horizontal bar chart of top holdings."""
    if exposure_df.empty or 'total_exposure' not in exposure_df.columns:
        return None

    top_holdings = exposure_df.nlargest(top_n, 'total_exposure')
    top_holdings = top_holdings.sort_values('total_exposure', ascending=True)

    fig, ax = plt.subplots(figsize=(12, 8))
    bars = ax.barh(top_holdings['name'], top_holdings['total_exposure'], color='#3498db')

    for bar in bars:
        width = bar.get_width()
        ax.text(
            width, bar.get_y() + bar.get_height() / 2,
            f' EUR {width:,.0f}',
            ha='left', va='center', fontsize=10
        )

    ax.set_title(f"Top {top_n} Holdings", pad=20)
    ax.set_xlabel("Exposure (EUR)")

    buf = BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight')
    buf.seek(0)
    plt.close(fig)

    return buf
```

---

## Automatic Error Reporting

```python
# prism_utils/error_reporter.py
import json
import requests
from typing import List, Optional
from portfolio_src.config import PROXY_URL, PROXY_API_KEY

APP_VERSION = "1.0.0"  # TODO: read from package


def report_to_github(
    errors: List[dict],
    pipeline_version: Optional[str] = None
) -> bool:
    """
    Report anonymized errors to GitHub via Cloudflare proxy.

    Args:
        errors: List of anonymized error dicts (no portfolio values)
        pipeline_version: App version string

    Returns:
        True if report was submitted successfully
    """
    if not PROXY_URL or not PROXY_API_KEY:
        return False

    if not errors:
        return False

    version = pipeline_version or APP_VERSION

    try:
        payload = {
            "action": "create_issue",
            "title": f"[Auto] Pipeline errors ({len(errors)} failures)",
            "body": _format_issue_body(errors, version),
            "labels": ["bug", "auto-reported"],
        }

        response = requests.post(
            f"{PROXY_URL}/github/issues",
            json=payload,
            headers={"X-API-Key": PROXY_API_KEY},
            timeout=10,
        )
        return response.status_code == 201

    except Exception:
        return False


def _format_issue_body(errors: List[dict], version: str) -> str:
    """Format errors as GitHub issue markdown."""
    lines = [
        "## Automatic Error Report",
        "",
        f"**Version:** {version}",
        f"**Error Count:** {len(errors)}",
        "",
        "### Failures",
        "",
        "| Phase | Type | ISIN | Message | Fix Hint |",
        "|-------|------|------|---------|----------|",
    ]

    for e in errors[:20]:  # Limit to 20
        phase = e.get('phase', 'UNKNOWN')
        error_type = e.get('error_type', 'UNKNOWN')
        item = e.get('item', 'N/A')
        message = e.get('message', '')[:50]
        fix_hint = e.get('fix_hint', '')[:30] if e.get('fix_hint') else ''
        
        lines.append(f"| {phase} | {error_type} | `{item}` | {message} | {fix_hint} |")

    if len(errors) > 20:
        lines.append(f"\n*...and {len(errors) - 20} more errors*")

    lines.extend([
        "",
        "---",
        "*This issue was automatically created by Portfolio Prism error reporting.*",
    ])

    return "\n".join(lines)
```

---

## Phase 3: UI Integration (3-4 hours)

| Task | File | Action |
|------|------|--------|
| **3.1** | `dashboard/tabs/trade_republic.py` | Add "Run True Exposure Analysis" button |
| **3.2** | `dashboard/tabs/trade_republic.py` | Implement synchronous progress pattern |
| **3.3** | `dashboard/tabs/trade_republic.py` | Show structured errors from `PipelineResult.errors` |
| **3.4** | `dashboard/tabs/trade_republic.py` | Auto-report errors to GitHub on failure |
| **3.5** | `dashboard/tabs/trade_republic.py` | Cache result in `st.session_state.pipeline_result` |
| **3.6** | `dashboard/tabs/portfolio_xray.py` | Load CSV data from pipeline outputs |
| **3.7** | `dashboard/tabs/portfolio_xray.py` | Generate charts on-demand using `dashboard/utils/charts.py` |
| **3.8** | `dashboard/tabs/portfolio_xray.py` | Cache charts in `st.session_state` for fast re-renders |

---

## UI Integration Pattern

```python
# dashboard/tabs/trade_republic.py (analysis section)
import streamlit as st
from portfolio_src.core.pipeline import Pipeline
from portfolio_src.config import DATA_DIR
from portfolio_src.prism_utils.error_reporter import report_to_github


def run_pipeline_with_ui():
    """Run pipeline synchronously with progress and auto error reporting."""
    
    progress_bar = st.progress(0)
    status_text = st.empty()

    def on_progress(message: str, percentage: float):
        progress_bar.progress(percentage)
        status_text.text(message)

    with st.spinner("Running True Exposure analysis..."):
        pipeline = Pipeline(DATA_DIR)
        result = pipeline.run(progress_callback=on_progress)

    progress_bar.empty()
    status_text.empty()

    # Clear cached charts so they regenerate with new data
    if 'xray_charts' in st.session_state:
        del st.session_state.xray_charts

    if result.success:
        st.success(f"Analysis complete! Processed {result.etfs_processed} ETFs.")
        
        if result.harvested_count > 0:
            st.info(f"Learned {result.harvested_count} new securities.")

        st.session_state.pipeline_result = result

        # Show warnings if any
        if result.errors:
            with st.expander(f"Warning: {len(result.errors)} issues encountered"):
                for error in result.errors:
                    st.warning(f"**{error.item}**: {error.message}")
                    if error.fix_hint:
                        st.caption(f"Hint: {error.fix_hint}")

        st.rerun()
    else:
        st.error("Pipeline failed. See errors below.")

        # Display errors
        for error in result.errors:
            st.error(f"**{error.phase.value}** - {error.item}: {error.message}")
            if error.fix_hint:
                st.caption(f"Hint: {error.fix_hint}")

        # Auto-report to GitHub
        with st.spinner("Reporting issue..."):
            reported = report_to_github(result.get_anonymized_errors())

        if reported:
            st.info("Issue automatically reported to help improve the app.")
        else:
            st.caption("Could not auto-report. Check your connection.")
```

---

## X-Ray Tab with On-Demand Charts

```python
# dashboard/tabs/portfolio_xray.py
import streamlit as st
import pandas as pd
from portfolio_src.config import TRUE_EXPOSURE_REPORT
from portfolio_src.dashboard.utils.charts import (
    generate_sector_chart,
    generate_geography_chart,
    generate_top_holdings_chart,
)


def render():
    st.header("Portfolio X-Ray")

    # Check if pipeline has run
    if not TRUE_EXPOSURE_REPORT.exists():
        st.warning("Run True Exposure Analysis first to see X-Ray data.")
        st.info("Go to the Trade Republic tab and click 'Run True Exposure Analysis'.")
        return

    # Load data
    exposure_df = pd.read_csv(TRUE_EXPOSURE_REPORT)

    if exposure_df.empty:
        st.warning("No exposure data available.")
        return

    # Generate charts on-demand, cache in session
    if 'xray_charts' not in st.session_state:
        with st.spinner("Generating charts..."):
            st.session_state.xray_charts = {
                'sector': generate_sector_chart(exposure_df),
                'geography': generate_geography_chart(exposure_df),
                'top_holdings': generate_top_holdings_chart(exposure_df),
            }

    charts = st.session_state.xray_charts

    # Summary metrics
    total_value = exposure_df['total_exposure'].sum()
    unique_holdings = len(exposure_df)
    
    col1, col2 = st.columns(2)
    col1.metric("Total Exposure", f"EUR {total_value:,.2f}")
    col2.metric("Unique Holdings", unique_holdings)

    st.divider()

    # Display charts
    col1, col2 = st.columns(2)
    
    with col1:
        if charts.get('sector'):
            st.image(charts['sector'], caption="Sector Allocation")
        else:
            st.info("No sector data available")

    with col2:
        if charts.get('geography'):
            st.image(charts['geography'], caption="Geographic Exposure")
        else:
            st.info("No geography data available")

    if charts.get('top_holdings'):
        st.image(charts['top_holdings'], caption="Top Holdings")

    # Data table
    with st.expander("View Raw Data"):
        st.dataframe(exposure_df)
```

---

## Phase 4: Validation (2-3 hours)

| Task | Action |
|------|--------|
| **4.1** | Run `tests/test_pipeline_smoke.py` on mock data |
| **4.2** | Test each service independently (Decomposer, Enricher, Aggregator) |
| **4.3** | Test Pipeline class with progress callbacks |
| **4.4** | Verify `pipeline_errors.json` is written correctly |
| **4.5** | Full pipeline run on mock portfolio in bundled app |
| **4.6** | Verify UI progress bar updates correctly |
| **4.7** | Verify X-Ray tab generates charts on-demand |
| **4.8** | Verify harvesting auto-runs and updates `asset_universe.csv` |
| **4.9** | Test error reporting — verify GitHub issue creation via proxy |
| **4.10** | Test error scenarios — missing adapter, API failure |

---

## Files Created/Modified

| File | Phase | Purpose |
|------|-------|---------|
| `core/harvesting.py` | 2.5 | Asset harvester |
| `dashboard/utils/__init__.py` | 2.5 | Utils package |
| `dashboard/utils/charts.py` | 2.5 | On-demand chart generation |
| `prism_utils/error_reporter.py` | 2.5 | GitHub error reporting |
| `dashboard/tabs/trade_republic.py` | 3 | Pipeline UI integration |
| `dashboard/tabs/portfolio_xray.py` | 3 | On-demand chart display |

---

## Architecture Reference

### React Migration Path

When migrating to React, these components stay:

| Component | Location | React Compatibility |
|-----------|----------|---------------------|
| `core/services/*` | Services | Pure Python, call via Tauri commands |
| `core/pipeline.py` | Orchestrator | No UI imports, fully reusable |
| `core/errors.py` | Error types | Serializable to JSON |
| `core/harvesting.py` | Harvester | Pure Python |
| `prism_utils/error_reporter.py` | Reporter | HTTP calls work anywhere |
| Output CSVs/JSONs | Data | React reads directly |

These components get replaced:

| Streamlit | React Equivalent |
|-----------|------------------|
| `st.progress()` | Tauri event listener + React state |
| `st.session_state` | React state / Zustand |
| `dashboard/utils/charts.py` | Recharts / Chart.js / Plotly |
| `st.dataframe()` | React Table / AG Grid |

### Deferred to Backlog

| Item | Description | Priority |
|------|-------------|----------|
| Community Asset Sync | Push harvested assets to Hive for other users | Post-MVP |
| Background Threading | True non-blocking execution | v2 |
| Cancellation | Stop pipeline mid-execution | v2 |

### Decision Log

| Decision | Rationale |
|----------|-----------|
| Service-oriented architecture | Enables React migration without rewriting business logic |
| On-demand visualization (hybrid) | Faster pipeline, charts cached in session |
| Structured `PipelineError` | Debuggable, serializable, GitHub-reportable |
| Automatic error reporting | Friends' issues automatically create GitHub issues |
| Auto-harvesting in pipeline | Community growth is critical, runs non-fatal |
| Community sync deferred | Infrastructure not ready, add to backlog |

---

## Rollback Points

- **Phase 2.5 Failure:** Skip auto-reporting, use manual issue creation
- **Phase 3 Failure:** Skip on-demand charts, use simple data tables
- **Phase 4 Failure:** Ship with known issues, fix iteratively
