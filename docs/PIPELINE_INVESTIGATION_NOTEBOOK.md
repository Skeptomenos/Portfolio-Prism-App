# Pipeline Investigation Notebook - Handover Document

> **Created:** 2026-01-11  
> **Purpose:** Handover for next session to create an interactive Jupyter notebook for pipeline debugging  
> **Priority:** High - Pipeline reliability is critical for a finance app

---

## The Idea

Create a **Jupyter notebook** that walks through each pipeline phase step-by-step, allowing interactive investigation of data transformations. The goal is to:

1. **Understand** exactly how data flows through each phase
2. **Identify** where data quality issues originate
3. **Debug** specific ETFs or holdings that cause problems
4. **Harden** the pipeline by finding edge cases

---

## Why This Matters

The pipeline is "not yet really 100% reliable" (user's words). Despite completing 5 phases of hardening with 115+ unit tests, real-world data still causes issues. A notebook allows:

- **Visual inspection** of DataFrames at each step
- **Before/after comparisons** of transformations
- **Drilling into specific ISINs** that fail
- **Testing fixes** interactively before committing

---

## Pipeline Phases to Cover

Based on `docs/PIPELINE_STATE_MACHINE.md`, the notebook should have sections for:

### Phase 1: Data Loading
```
Database (SQLite) → positions DataFrame → split into direct/ETF
```
- Load from `~/Library/Application Support/com.skeptomenos.portfolioprism/prism.db`
- Show: raw positions, asset_class distribution, value calculations
- Check: NaN handling, currency distribution, ISIN validity

### Phase 2: ETF Decomposition
```
ETF positions → holdings_map {etf_isin: holdings_df}
```
- Multi-tier resolution: LocalCache → Hive → Adapters
- Show: which ETFs resolved from which tier
- Check: weight sums (should be ~100%), decimal vs percentage format
- Drill into: specific ETF holdings

### Phase 3: Enrichment
```
holdings_map → enriched_holdings_map (with sector, geography, asset_class)
```
- Multi-tier: LocalCache → Hive → APIs (Finnhub, yfinance)
- Show: enrichment coverage rates
- Check: "Unknown" values, missing metadata
- Drill into: specific ISINs that failed enrichment

### Phase 4: Aggregation
```
direct_positions + enriched_holdings → exposure_df
```
- Combine all exposures, group by ISIN
- Show: aggregation logic, confidence-based first-wins
- Check: total exposure vs expected portfolio value
- Drill into: duplicate ISINs, resolution conflicts

### Phase 5: Validation & Quality
```
Each phase output → DataQuality score
```
- Show: quality scores per phase
- List: all validation issues with severity
- Check: is_trustworthy flag

---

## Key Files to Import

```python
# Core pipeline
from portfolio_src.core.pipeline import Pipeline
from portfolio_src.core.services.decomposer import Decomposer
from portfolio_src.core.services.enricher import Enricher
from portfolio_src.core.services.aggregator import Aggregator

# Contracts & validation
from portfolio_src.core.contracts.schemas import *
from portfolio_src.core.contracts.validation import *
from portfolio_src.core.contracts.quality import DataQuality
from portfolio_src.core.contracts.gates import ValidationGates

# Data layer
from portfolio_src.data.database import PortfolioDatabase
from portfolio_src.data.holdings_cache import HoldingsCache
from portfolio_src.data.hive_client import HiveClient
from portfolio_src.data.resolution import ISINResolver

# Adapters
from portfolio_src.adapters.registry import AdapterRegistry
```

---

## Notebook Structure Suggestion

```
pipeline_investigation.ipynb
├── 0. Setup & Configuration
│   ├── Import dependencies
│   ├── Configure paths (DATA_DIR, DB_PATH)
│   └── Helper functions for display
│
├── 1. Data Loading Investigation
│   ├── 1.1 Load raw positions from SQLite
│   ├── 1.2 Inspect asset_class distribution
│   ├── 1.3 Split into direct/ETF positions
│   ├── 1.4 Validate load output
│   └── 1.5 Quality check: currencies, ISINs, values
│
├── 2. ETF Decomposition Investigation
│   ├── 2.1 Initialize Decomposer with dependencies
│   ├── 2.2 Process single ETF (interactive picker)
│   ├── 2.3 Show resolution tier (cache/hive/adapter)
│   ├── 2.4 Inspect holdings DataFrame
│   ├── 2.5 Validate weight sums
│   └── 2.6 Check ISIN resolution rates
│
├── 3. Enrichment Investigation
│   ├── 3.1 Collect unique ISINs
│   ├── 3.2 Batch enrichment lookup
│   ├── 3.3 Show enrichment sources
│   ├── 3.4 Inspect sector/geography coverage
│   └── 3.5 Identify enrichment gaps
│
├── 4. Aggregation Investigation
│   ├── 4.1 Calculate portfolio total value
│   ├── 4.2 Process direct positions
│   ├── 4.3 Process ETF positions
│   ├── 4.4 Combine and aggregate by ISIN
│   ├── 4.5 Validate totals match
│   └── 4.6 Inspect final exposure_df
│
├── 5. Quality Summary
│   ├── 5.1 Overall DataQuality score
│   ├── 5.2 Issues by severity
│   ├── 5.3 Issues by phase
│   └── 5.4 Actionable fix recommendations
│
└── 6. Deep Dive Tools
    ├── 6.1 Investigate specific ISIN
    ├── 6.2 Compare ETF holdings sources
    ├── 6.3 Trace value through pipeline
    └── 6.4 Export problematic data for debugging
```

---

## Technical Considerations

### Environment Setup
```bash
cd src-tauri/python
source venv-build/bin/activate  # or create new venv
pip install jupyter pandas matplotlib seaborn
jupyter notebook
```

### Database Path
```python
import os
DATA_DIR = os.path.expanduser(
    "~/Library/Application Support/com.skeptomenos.portfolioprism"
)
DB_PATH = os.path.join(DATA_DIR, "prism.db")
```

### Display Helpers
```python
def show_df(df, title="", max_rows=20):
    """Display DataFrame with title and row limit."""
    print(f"\n{'='*60}")
    print(f" {title}")
    print(f"{'='*60}")
    print(f"Shape: {df.shape}")
    display(df.head(max_rows))
    
def compare_before_after(before, after, title=""):
    """Side-by-side comparison of DataFrames."""
    # Show columns added/removed
    # Show row count changes
    # Highlight value changes
```

---

## Questions to Answer with the Notebook

1. **Where do weight sum issues originate?**
   - Which adapters return decimal vs percentage?
   - Which ETFs consistently have low weight sums?

2. **Why are some ISINs unresolved?**
   - What ticker formats fail resolution?
   - Which sources have the best resolution rates?

3. **Where does enrichment fail?**
   - Which ISINs lack sector data?
   - Is it a Hive gap or API failure?

4. **Does aggregation preserve value correctly?**
   - Does total exposure match portfolio value?
   - Are there rounding errors accumulating?

5. **What's the actual data quality?**
   - What percentage of holdings are fully enriched?
   - How many critical issues exist?

---

## Success Criteria

The notebook is successful when:

- [ ] Can load real portfolio data from SQLite
- [ ] Can step through each phase independently
- [ ] Can inspect any ETF's holdings in detail
- [ ] Can identify specific ISINs causing issues
- [ ] Can validate data quality at each step
- [ ] Can export problematic data for fixing

---

## Next Steps for New Session

1. **Create the notebook** in `src-tauri/python/notebooks/pipeline_investigation.ipynb`
2. **Start with Phase 1** (Data Loading) - get it working with real data
3. **Add interactive widgets** (ipywidgets) for ETF/ISIN selection
4. **Build incrementally** - each phase should work before moving to next
5. **Document findings** - capture any bugs discovered during investigation

---

## Related Files

| File | Purpose |
|------|---------|
| `docs/PIPELINE_STATE_MACHINE.md` | Visual diagram of pipeline flow |
| `docs/PIPELINE_STATE_MACHINE_MERMAID.md` | Mermaid version for GitHub |
| `docs/PIPELINE_HARDENING_PLAN.md` | Completed hardening phases |
| `src-tauri/python/portfolio_src/core/pipeline.py` | Main orchestrator |
| `src-tauri/python/portfolio_src/core/contracts/` | Validation schemas |
| `src-tauri/python/tests/test_phase5_bugfixes.py` | Regression tests |

---

## User Context

- This is a **finance app** - accuracy is critical
- User wants to **understand the pipeline deeply** before making more changes
- Previous session completed **5 phases of hardening** with 115+ tests
- Pipeline "works but is not 100% reliable" with real data
- User prefers **TDD approach** - understand first, then fix
