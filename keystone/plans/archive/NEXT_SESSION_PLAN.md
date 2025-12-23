# Next Session Plan: Performance & Trust

**Status:** Ready for Execution
**Date:** 2025-12-20
**Objective:** Transform the analytics pipeline into a high-performance, trust-aware engine.

---

## 🎯 Key Objectives

### 1. Confidence Scoring (Trust)
*   **Goal**: Calculate a "Trust Score" (0.0 - 1.0) for every asset enriched via the Hive.
*   **Logic**: 
    *   `submission_count`: More contributors = higher trust.
    *   `freshness`: Newer data = higher trust.
    *   `consensus`: Agreement between contributors = higher trust.
*   **Implementation**: Update `HiveClient` and `AssetEntry` in `hive_client.py`.

### 2. Aggregator Vectorization (Performance)
*   **Goal**: 10x speedup for large portfolios.
*   **Logic**: Replace all `iterrows()` loops in `aggregator.py` with pure Pandas/NumPy vectorized operations.
*   **Implementation**: Refactor `Aggregator.aggregate` and helper methods.

### 3. Pipeline Health Monitoring (Observability)
*   **Goal**: Track the value of the community Hive.
*   **Metrics**:
    *   `hive_hit_rate`: % of assets served from community data.
    *   `api_fallback_rate`: % of assets requiring expensive API calls.
    *   `enrichment_time`: Average ms per asset.
*   **Implementation**: Add `PipelineMonitor` to `pipeline.py`.

---

## 🔧 Implementation Tasks

| Task | Priority | Component | Est. Effort |
| :--- | :--- | :--- | :--- |
| Implement Confidence Scoring Logic | High | `hive_client.py` | 4 hours |
| Vectorize Aggregator Math | High | `aggregator.py` | 6 hours |
| Add Metrics Collection to Pipeline | Medium | `pipeline.py` | 3 hours |
| Update HealthView with Trust Scores | Medium | React | 4 hours |

---

## ✅ Success Criteria

*   **Performance**: Pipeline execution time < 5s for 100+ positions.
*   **Trust**: Every exposure in the UI shows a confidence indicator.
*   **Observability**: `pipeline_health.json` includes Hive hit rate metrics.
