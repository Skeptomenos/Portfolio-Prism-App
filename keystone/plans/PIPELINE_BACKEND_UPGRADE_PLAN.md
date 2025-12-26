# Pipeline Backend Upgrade Plan: Data Provenance & Hive Logic

## 1. Objective

Enhance the Python analytics pipeline (`core/pipeline.py`, `core/services/`) to capture detailed metadata about **where data comes from** (Source) and **what data is shared** (Contributions). This data is critical for the new "Glass Box" UI.

**Outputs Required:**

- `pipeline_health.json` must now include:
  - Lists of which items were resolved by `hive`, `adapter`, or `cache`.
  - List of items that were _newly contributed_ to the Hive.
  - Detailed breakdown of ETF resolution sources.

---

## 2. Code Changes

### A. `src-tauri/python/portfolio_src/core/pipeline.py`

#### 1. Update `PipelineMonitor` Class

Modify the monitor to track sets of ISINs instead of just counters.

```python
class PipelineMonitor:
    def __init__(self):
        # ... existing ...
        self.hive_hits = set()    # Changed from int
        self.hive_misses = set()  # Changed from int
        self.api_calls = set()    # Changed from int
        self.contributions = set() # NEW: Track what we sent to Hive

    def record_enrichment(self, isin: str, source: str):
        # Update logic to add to sets
        if source == "hive":
            self.hive_hits.add(isin)
        else:
            self.hive_misses.add(isin)
            if source != "unknown":
                self.api_calls.add(isin)

    def record_contribution(self, isin: str):
        self.contributions.add(isin)

    def get_metrics(self) -> Dict[str, Any]:
        # Update to return lengths
        return {
            # ...
            "hive_hit_rate": calculate_rate(len(self.hive_hits), total),
            "hive_hits_count": len(self.hive_hits),
            "contributions_count": len(self.contributions),
             # ...
        }
```

#### 2. Update `_build_summary`

Ensure the new monitor sets are serialized into the JSON output.

### B. `src-tauri/python/portfolio_src/core/services/decomposer.py`

#### 1. Capture Resolution details

The `decomposer.py` already captures `by_source` stats in `_resolution_stats`. We need to ensure this is granular enough.

- Currently, `_get_holdings` saves to cache with `source="adapter"` or `source="hive"`.
- We need to ensure `decompose()` returns or exposes _which_ ETFs were resolved by which method.

**Task:**

- Modify `_get_holdings` to return the `source` string along with `holdings`.
- In `decompose`, collect this `source` for each ETF.
- Pass this map (`{isin: source}`) back to the pipeline to include in `pipeline_health.json` (under `decomposition_summary`).

### C. `src-tauri/python/portfolio_src/core/services/enricher.py`

#### 1. Track Hive Contributions

Currently `HiveEnrichmentService.get_metadata_batch` identifies `new_contributions`.

- **Change:** It needs to _return_ this list of contributed ISINs so the caller (`Enricher`) can report it.
- Update `Enricher.enrich` to collect these contributions and pass them to the `PipelineMonitor`.

---

## 3. Data Contract Updates (`pipeline_health.json`)

**New Structure:**

```json
{
  "decomposition": {
    "per_etf": [
      {
        "isin": "DE000...",
        "status": "success",
        "source": "amundi_adapter", // NEW field
        "holdings_count": 500
      }
    ]
  },
  "enrichment": {
    "stats": {
      "hive_hits": 450,
      "api_calls": 5,
      "new_contributions": 12
    },
    "hive_log": {
      // NEW Section
      "contributions": ["US0378331005", "US5949181045"],
      "hits": ["DE000...", "IE000..."]
    }
  }
}
```

---

## 4. Verification Steps

1.  **Unit Test (`tests/test_pipeline_provenance.py`):**
    - Mock `Decomposition` to return specific sources.
    - Run pipeline.
    - Assert `pipeline_health.json` contains the `source` fields.
2.  **Manual Test:**
    - Run the pipeline on the existing portfolio.
    - Open `data/outputs/pipeline_health.json`.
    - Verify `hive_log` exists and contains ISINs.
    - Verify `decomposition.per_etf` entries have a `source`.
