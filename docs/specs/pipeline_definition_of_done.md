# Pipeline Definition of Done

> **Purpose:** Define what a complete, successful pipeline run looks like.
> **Status:** Active
> **Last Updated:** 2026-03-08
> **Related:**
> - `docs/architecture/analytics_pipeline.md` (pipeline architecture)
> - `docs/architecture/identity_resolution.md` (ISIN resolution architecture)
> - `docs/specs/identity_resolution_details.md` (resolution cascade, confidence scores)
> - `docs/specs/supabase_hive.md` (Hive community database)
> - `docs/plans/2026-03-08-pipeline-stabilization-plan.md` (active stabilization work)

---

## Primary Objective

**100% ISIN enrichment for all tier1 holdings.** Every holding extracted from every ETF
that is above the tier1 weight threshold MUST have a resolved ISIN. This is the single
most important pipeline metric. Without ISINs, there is no True Holding Exposure, no
cross-ETF overlap detection, and no meaningful Hive contributions.

---

## 1. Decomposition

### Cascade order: local cache → Hive → adapter → manual

| Priority | Source | Speed | Freshness | Notes |
|----------|--------|-------|-----------|-------|
| 1 | **Local cache** | Instant | User's last run | If user already decomposed this ETF, reuse immediately |
| 2 | **Hive** | Fast (network) | Contributed by community | Check `contributed_at` date for staleness |
| 3 | **Adapter** | Slow (scrape) | Authoritative, current | Download from provider website (iShares CSV, etc.) |
| 4 | **Manual** | User action | User-provided | Flag for manual upload with actionable download URL |

### Freshness and staleness

ETF providers publish holding compositions with varying frequency:
- **iShares (BlackRock):** Daily updates on ishares.com.
- **Vanguard:** Daily holdings updates. Underlying indices rebalance quarterly.
- **Amundi:** Monthly update cycle for public-facing data.

In practice, ETF compositions don't change dramatically day-to-day. The holdings
list stays the same — only the weights shift as stock prices move. Major compositional
changes happen at **index rebalancing** (quarterly: March, June, September, December).
Between rebalances, the only changes are corporate actions (mergers, IPOs, delistings).

For ISIN resolution, stale weights don't matter — we need to know **which companies**
are in the ETF, not their exact weight to the decimal. A 2-week-old holdings list
has the same companies as today's.

**Staleness threshold: 30 days** (initial setting). This is conservative — safe for all
providers including Amundi's monthly cycle. Can be reduced when we have active users
and more Hive contribution data to work with. When Hive data is stale, prefer the
adapter (fresh from provider). After adapter success, contribute fresh data back to
the Hive to update the community's copy.

**Hive contribution metadata:** Every ETF decomposition contributed to the Hive MUST include:
- `contributed_at` timestamp (when the data was contributed)
- `source_date` timestamp (when the provider published the data, if known)
- `contributor_hash` (anonymous contributor ID)

### Requirements

- Every ETF in the portfolio is decomposed into its underlying holdings
- Each ETF reports its decomposition source (`cached`, `hive`, `adapter`, `manual`) — never `unknown`
- Amundi ETFs that require manual upload surface actionable download URLs in the Action Queue
- Each holding includes: ticker, name, and weight (percentage of ETF total, e.g., "Apple is 5.33% of MSCI World")
- As soon as decomposition succeeds from any source, contribute to Hive for the next user
- Weight is **per holding within the ETF**, NOT portfolio-level exposure

---

## 2. ISIN Resolution

### Cascade order: local cache → Hive → provider → Wikidata → Finnhub → yFinance → manual

| Priority | Source | Confidence | Cost | Notes |
|----------|--------|------------|------|-------|
| 1 | **Local cache** (SQLite) | 0.95 | Free | User already resolved this ticker before |
| 2 | **Hive** (Supabase listings) | 0.90 | Free | Another user contributed this resolution |
| 3 | **Provider data** | 1.00 | Free | ISIN already in adapter output (e.g., Amundi includes ISINs) |
| 4 | **Wikidata** SPARQL | 0.80 | Free | High quality, community maintained |
| 5 | **Finnhub** (via proxy) | 0.75 | Rate-limited | Good for metadata enrichment |
| 6 | **yFinance** | 0.70 | Unreliable | Last resort automated source |
| 7 | **Manual entry** | 0.85 | User action | Flag for user to provide ISIN manually |

**Note:** Provider data at position 3 means: if the ETF adapter already included an ISIN in
the holdings output (e.g., Amundi XLSX includes ISINs), use it. This is not an API call —
it's data already present from the decomposition step.

### Requirements

- Every tier1 holding (weight > threshold) has a resolved ISIN — target **100%**
- Overall resolution rate across all holdings > **95%**
- Every resolved ISIN is valid format (`^[A-Z]{2}[A-Z0-9]{9}[0-9]$`)
- Resolution source and confidence score recorded for every holding — no `nan` or `null` sources
- Every API-resolved ISIN is auto-contributed to the Hive immediately
- Negative cache prevents re-querying APIs for known-unresolvable tickers (24h TTL)
- Unresolved holdings are flagged for manual entry with ticker, name, weight, and ETF context

---

## 3. Hive Contribution

### Requirements

- Every API-resolved ISIN is contributed to the Hive immediately on success
- Every successful ETF decomposition is contributed to the Hive with `contributed_at` timestamp
- Harvest phase bulk-contributes newly-discovered securities after pipeline completes
- Hive hit rate should improve over time (each run contributes, next run benefits)
- Contribution failures are non-fatal — pipeline continues, failure is logged visibly
- Second pipeline run should have measurably higher Hive hit rate than first
- Hive contribution is enabled by default (`hive_contribution_enabled = "true"`), user can disable

---

## 4. Enrichment

### Requirements

- Every resolved ISIN is enriched with **sector** metadata
- Every resolved ISIN is enriched with **geography** metadata
- Enrichment sources tracked in health report (hive_hits, api_calls, contributions)
- Enrichment failure is graceful — pipeline continues without crashing
- Enrichment scales with resolved ISINs — if 852 ISINs resolved, ~852 should be enriched

---

## 5. Aggregation

### Requirements

- Holdings are aggregated **by ISIN** across all ETFs and direct positions
- **Weight scaling is correct:** `portfolio_exposure = etf_weight_in_portfolio × holding_weight_in_etf`
- Aggregated total matches portfolio total within **5% tolerance**
- Cross-ETF overlap is detected (e.g., NVIDIA appears in 3 ETFs + direct position)
- Overlapping holdings show combined exposure from all sources

---

## 6. True Exposure Storage

### Requirements

- True exposure data is stored in **SQLite** (`prism.db`), NOT CSV
- Each pipeline run creates a timestamped snapshot of true exposure
- Historical snapshots enable tracking changes over 3, 6, 12 months
- Schema includes: ISIN, name, sector, geography, total_exposure, resolution_confidence,
  resolution_source, portfolio_percentage, run_timestamp
- Legacy `true_exposure_report.csv` can be generated on-demand for export, but is not the
  primary storage mechanism

---

## 7. Pipeline Health Report

### Requirements

- `pipeline_health.json` is generated fresh each pipeline run (no historical tracking needed)
- Resolution rate accurately reflects actual ISIN resolution (not stale/wrong stats)
- `is_trustworthy` is `true` only when:
  - Resolution rate > 95%
  - Aggregated total matches portfolio total (within 5%)
  - Majority of ETFs decomposed successfully
- `success` is `false` when majority of ETFs fail decomposition
- Pipeline run status is never silently successful on bad data
- Quality score penalties are applied for real issues, not stale reporting artifacts

---

## 8. Observability

### Requirements

- X-Ray UI shows per-ETF resolution status, source, holdings count, weight sum
- Action Queue shows unresolved items with actionable fix suggestions
- Hive Log shows community hits and contributions with counts
- Health view shows **accurate** quality score and resolution rate
- No silent failures — every error visible in UI or engine logs
- 0 `IPCValidationError` on any route
- 0 blank-screen or navigation-dead-end failures

---

## 9. Performance (health metrics, not hard gates)

These are tracked as observability metrics in the health report, not gating requirements:

| Metric | Target | Notes |
|--------|--------|-------|
| Cache/Hive hit rate | > 80% after warm-up | Improves organically as Hive grows |
| Resolution latency | < 100ms avg for cache hits | API calls will be slower |
| Second-run improvement | Measurably faster than first | Hive contributions pay off |
| API dependency | Decreasing over time | Community contributions reduce API reliance |

---

## Pipeline Success Criteria (Summary)

A pipeline run is **successful** when ALL of these are true:

1. All decomposable ETFs are decomposed (Amundi manual-upload failures are acceptable)
2. 100% of tier1 holdings have resolved ISINs
3. Overall ISIN resolution rate > 95%
4. Aggregated total matches portfolio total within 5%
5. `is_trustworthy = true`
6. Resolved ISINs contributed to Hive
7. Health report accurately reflects pipeline state
8. No silent failures — all issues visible in UI or logs
