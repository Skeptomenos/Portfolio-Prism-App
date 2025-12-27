# Phase 5b: Format Optimization (Backlog)

> **Workstream:** identity-resolution
> **Status:** Backlog - Pending Data from Phase 5
> **Prerequisite:** Phase 5 (Format Logging) must be complete with 2-4 weeks of data
> **Created:** 2025-12-27

---

## 1. Executive Summary

Phase 5b adds **adaptive variant reordering** based on historical success rates collected in Phase 5. The system will prioritize ticker formats that have historically succeeded for each API.

**Goal:** Reduce API calls by 10-20% by trying the most likely format first.

**Prerequisite:** Analyze Phase 5 logs to confirm meaningful patterns exist before implementing.

---

## 2. Decision Gate

Before implementing Phase 5b, analyze Phase 5 logs to answer:

### 2.1 Questions to Answer

| Question | Threshold for Proceeding |
|----------|-------------------------|
| Do formats have different success rates? | >15% difference between best and worst |
| Is there variation by ETF provider? | >10% difference between providers |
| How many API calls could be saved? | >100 calls/week potential savings |

### 2.2 Analysis Query

```sql
-- Run against format_logs table after 2-4 weeks
SELECT 
    api_source,
    format_type,
    SUM(success) as successes,
    COUNT(*) as total,
    ROUND(100.0 * SUM(success) / COUNT(*), 1) as success_rate
FROM format_logs
GROUP BY api_source, format_type
ORDER BY api_source, success_rate DESC;
```

**If patterns are weak or non-existent, do not proceed with Phase 5b.**

---

## 3. Implementation (If Approved)

### 3.1 New SQLite Table: `format_learnings`

Aggregate table for fast lookups (derived from `format_logs`):

```sql
CREATE TABLE IF NOT EXISTS format_learnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_source TEXT NOT NULL,
    format_type TEXT NOT NULL,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(api_source, format_type)
);
```

**Note:** We intentionally do NOT track by `etf_provider` unless Phase 5 data shows provider-specific patterns. This avoids the ISIN prefix heuristic problem.

### 3.2 LocalCache Methods

```python
def get_format_success_rates(self, api_source: str) -> Dict[str, float]:
    """Get success rates for each format type for an API."""
    conn = self._get_connection()
    cursor = conn.execute(
        """
        SELECT format_type, success_count, failure_count
        FROM format_learnings
        WHERE api_source = ?
        """,
        (api_source,),
    )
    
    rates = {}
    for row in cursor.fetchall():
        total = row["success_count"] + row["failure_count"]
        if total > 0:
            rates[row["format_type"]] = row["success_count"] / total
    
    return rates

def refresh_format_learnings(self) -> None:
    """Rebuild format_learnings from format_logs (run periodically)."""
    conn = self._get_connection()
    conn.execute("DELETE FROM format_learnings")
    conn.execute(
        """
        INSERT INTO format_learnings (api_source, format_type, success_count, failure_count)
        SELECT 
            api_source,
            format_type,
            SUM(success) as success_count,
            COUNT(*) - SUM(success) as failure_count
        FROM format_logs
        WHERE created_at > datetime('now', '-30 days')
        GROUP BY api_source, format_type
        """
    )
    conn.commit()
```

### 3.3 Variant Reordering

```python
def _reorder_variants_by_success(
    self,
    variants: List[str],
    api_source: str,
) -> List[str]:
    """Reorder ticker variants based on historical success rates."""
    if not self._local_cache or not variants:
        return variants
    
    success_rates = self._local_cache.get_format_success_rates(api_source)
    
    if not success_rates:
        return variants  # No learnings yet
    
    def sort_key(variant: str) -> float:
        format_type = self._ticker_parser.detect_format(variant)
        # Higher success rate = lower sort key (comes first)
        # Unknown formats get 0.5 (neutral)
        return -success_rates.get(format_type, 0.5)
    
    return sorted(variants, key=sort_key)
```

### 3.4 Integration Points

1. **Finnhub:** Select `primary_ticker` from reordered list (not just `tickers[0]`)
2. **yFinance:** Use reordered list for the 2 variants tried
3. **Wikidata:** No change (batch query, order doesn't matter)

---

## 4. Task Breakdown (If Approved)

| Task | Description | Estimate |
|------|-------------|----------|
| IR-510 | Add `format_learnings` table | 30 min |
| IR-511 | Add `get_format_success_rates()` method | 30 min |
| IR-512 | Add `refresh_format_learnings()` method | 30 min |
| IR-513 | Add `_reorder_variants_by_success()` to resolver | 1 hour |
| IR-514 | Integrate reordering into Finnhub/yFinance calls | 1 hour |
| IR-515 | Add unit tests | 1 hour |

**Total estimate:** 4-5 hours

---

## 5. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Insufficient data | Wait for more logs before proceeding |
| No meaningful patterns | Abort Phase 5b, keep logging for future analysis |
| Stale learnings | `refresh_format_learnings()` uses 30-day window |
| Sample size bias | Require minimum 10 samples per format before using |

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| API calls reduced | 10-20% |
| Resolution latency | -5-10% |
| Finnhub rate limit hits | Reduced |

---

## 7. Why This is Deferred

1. **Premature optimization:** We don't know if format patterns exist
2. **Complexity cost:** Adds reordering logic, refresh jobs, more state
3. **Data-driven decision:** Phase 5 logs will tell us if this is worth it
4. **Low urgency:** Current resolution works fine, no rate limit issues

**Proceed only if Phase 5 data justifies the complexity.**
