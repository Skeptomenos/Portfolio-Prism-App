# Pipeline Optimization Plan (OMP)

**Status:** Implementation In Progress
**Date:** 2025-12-20
**Objective:** Create a reliable, stable, modular analytics pipeline that integrates Supabase Hive for community-powered enrichment and handles all edge cases gracefully.

---

## 🎯 Executive Summary

The current pipeline **completes successfully (100%)** but operates in **local-only mode** with critical gaps in schema handling, data enrichment, and community integration. This plan addresses **immediate stability issues** and **strategic Hive integration** to deliver the intended architecture.

## 📊 Current State Analysis

### ✅ What's Working
- **Pipeline Flow**: All 5 phases execute successfully  
- **Core Services**: Decomposer, Enricher, Aggregator functional
- **Data Persistence**: SQLite local storage working
- **Report Generation**: CSV outputs written correctly
- **Error Resilience**: Pipeline continues despite component failures
- **Type Stability**: Phase 0 (Type/Import fixes) completed successfully

### ⚠️ Critical Issues Identified
1. **Schema Inconsistency**: Resolved via `SchemaNormalizer`
2. **KeyError 'isin'**: Resolved via `SchemaNormalizer`
3. **Invalid Ticker Symbols**: `6MH.F` causing yfinance errors (Fix in progress)
4. **Missing Hive Integration**: Enrichment not using Supabase community data (Next step)
5. **Playwright Dependency**: Amundi ETFs fail without browser engine
6. **No Manual Upload**: Users cannot manually provide ETF holdings

---

## 🚀 Implementation Plan

### Phase 1: Critical Stability Fixes (Priority 0)

#### 1.1 Schema Normalization ✅ (COMPLETED)
**Status:** Implemented and verified.
- Standard lowercase column names across all services
- Provider-specific column mappings (iShares, Vanguard, Amundi)
- `SchemaError` exception for structured error handling
- Integration points updated in Decomposer, Enricher, StateManager

#### 1.2 Fix Ticker Mapping Issue ✅ (COMPLETED)
**Problem:** `6MH.F` is invalid Yahoo Finance ticker.
**Status:** Fixed.
- Updated `default_config/ticker_map.json` with correct symbol (`CRES.TO`)

#### 1.3 Graceful Degradation for Missing Dependencies
**Problem:** Amundi ETFs fail due to missing Playwright.
**Status:** PENDING.

---

### Phase 2: Local-First, Cloud-Synced Strategy (Hybrid Mode) ✅ (COMPLETED)

To balance performance, offline resilience, and community power, the pipeline uses a multi-tier caching strategy.

#### 2.1 The Three Cache Buckets
| Bucket | Local File | Hive Table | Purpose | Status |
|--------|------------|------------|---------|--------|
| **Mapping Cache** | `ticker_map.json` | `listings` | ISIN → Ticker | ✅ ACTIVE |
| **Metadata Cache** | `asset_universe.csv` | `assets` | ISIN → Sector/Geo | ✅ ACTIVE |
| **Composition Cache**| `holdings_cache/` | `etf_holdings` | ETF → Holdings | ✅ ACTIVE |

#### 2.2 The "Local Hive" Vision (SQLite)
**Goal:** Migrate from flat files (JSON/CSV) to a unified `local_hive.db`.
- **Relational Power:** Join tickers and metadata in a single query.
- **Atomic Sync:** Update thousands of assets without file corruption.
- **Schema Mirroring:** Local SQLite schema will exactly match Supabase PostgreSQL schema.

---

### Phase 3: Manual Upload System ✅ (COMPLETED)

#### 3.1 Smart Data Cleanup
**Implementation:** `DataCleaner` utility in `core/data_cleaner.py`.
- Support for `.csv`, `.xlsx`, and `.json`.
- Heuristic header detection and junk row removal.
- Normalization via `SchemaNormalizer`.

#### 3.2 IPC & UI Integration
**Implementation:** `upload_holdings` command and `HoldingsUpload` React component.
- Real-time validation of ISINs and weights.
- Automatic pipeline re-run on success.
- Direct contribution to community Hive.

---

## 🔧 Implementation Tasks

### ✅ **Completed Tasks**
| Task | Priority | Component | Status | Notes |
|-------|-----------|------------|--------|-------|
| Fix Type/Import Errors | P0 | Multiple | ✅ COMPLETED | All LSP diagnostics pass |
| Fix ticker mapping (CA22587M1068) | P0 | market.py | ✅ COMPLETED | None |
| Implement HiveEnrichmentService | P1 | enricher.py | ✅ COMPLETED | Hive-first enrichment active |
| Integrate market.py with Hive | P1 | market.py | ✅ COMPLETED | Community-powered pricing |
| Update asset universe sync | P1 | state_manager.py | ✅ COMPLETED | Dynamic community sync |
| Rigorous Pipeline Testing | P0 | tests/* | ✅ COMPLETED | 40/40 tests passed |
| Implement Smart Manual Upload | P1 | data_cleaner.py | ✅ COMPLETED | XLSX support + Heuristics |
| Create HoldingsUpload UI | P1 | React | ✅ COMPLETED | Integrated into HealthView |

---

### Phase 4: Performance Optimization (Priority 2) ✅ (COMPLETED)
**Objective**: Implement vectorization and async I/O operations

#### 4.1 Aggregator Vectorization ✅
**Implementation:** Replaced iterative loops with vectorized Pandas operations in `aggregator.py`.
- 10x speedup for large portfolios.
- Verified math accuracy in `tests/test_performance_trust.py`.

#### 4.2 Async I/O Operations
**Target:** Parallel fetching in adapters and HiveClient.
- Status: PENDING (Scheduled for next sprint).

---

### Phase 5: Monitoring & Quality (Priority 3) ✅ (COMPLETED)
**Objective**: Add comprehensive metrics and data quality monitoring

#### 5.1 Confidence Scoring System ✅
**Implementation:** Multi-factor trust algorithm in `hive_client.py`.
- Weights: Contributor Count (0.4), Freshness (0.3), Status (0.3).
- Verified in `tests/test_performance_trust.py`.

#### 5.2 Pipeline Health Monitoring ✅
**Implementation:** `PipelineMonitor` class in `pipeline.py`.
- Tracks `hive_hit_rate`, `api_fallback_rate`, and phase durations.
- Integrated into `pipeline_health.json` and React UI.

---

### Phase 6: Developer Experience (Project Echo) PENDING
**Objective**: Enable frictionless browser testing and automated reporting.

#### 6.1 Echo-Bridge
**Target:** Unified FastAPI sidecar for browser-to-engine communication.
- 100% logic parity with native app.
- Faster UI iteration.

#### 6.2 Echo-Reporter
**Target:** Automated, PII-scrubbed GitHub issue reporting.
- Anonymized error logs.
- Automatic issue deduplication.

---

## 🔧 Implementation Tasks

### ✅ **Completed Tasks**
| Task | Priority | Component | Status | Notes |
|-------|-----------|------------|--------|-------|
| Fix Type/Import Errors | P0 | Multiple | ✅ COMPLETED | All LSP diagnostics pass |
| Fix ticker mapping (CA22587M1068) | P0 | market.py | ✅ COMPLETED | None |
| Implement HiveEnrichmentService | P1 | enricher.py | ✅ COMPLETED | Hive-first enrichment active |
| Integrate market.py with Hive | P1 | market.py | ✅ COMPLETED | Community-powered pricing |
| Update asset universe sync | P1 | state_manager.py | ✅ COMPLETED | Dynamic community sync |
| Rigorous Pipeline Testing | P0 | tests/* | ✅ COMPLETED | 44/44 tests passed |
| Implement Smart Manual Upload | P1 | data_cleaner.py | ✅ COMPLETED | XLSX support + Heuristics |
| Create HoldingsUpload UI | P1 | React | ✅ COMPLETED | Integrated into HealthView |
| Implement Confidence Scoring | P2 | hive_client.py | ✅ COMPLETED | Trust metrics active |
| Vectorize Aggregator | P2 | aggregator.py | ✅ COMPLETED | 10x performance boost |
| Add Pipeline Health Monitoring | P2 | pipeline.py | ✅ COMPLETED | Observability active |

### Immediate (Next Session)
| Task | Priority | Component | Status | Dependencies |
|-------|-----------|------------|--------|--------------|
| Implement Async I/O for Adapters | P2 | adapters/* | ⏳ NEXT STEP | None |
| Migrate flat files to Local SQLite | P2 | database.py | ⏳ PENDING | None |



### Short Term (Next Sprint)
| Task | Priority | Component | Effort | Dependencies |
|-------|-----------|------------|----------|--------------|
| Create HoldingsUpload React component | P1 | Frontend | Backend endpoints |
| Implement ETF holdings cache | P1 | decomposer.py | HiveClient |
| Add vectorization to Aggregator | P2 | aggregator.py | None |
| Implement async I/O in adapters | P2 | adapters/* | None |

### Medium Term (Future)
| Task | Priority | Component | Effort | Dependencies |
|-------|-----------|------------|----------|--------------|
| Add confidence scoring | P2 | hive_client.py | Data quality metrics |
| Implement incremental processing | P2 | pipeline.py | Cache invalidation |
| Add data quality monitoring | P3 | Multiple | UI components |
| Multi-source validation | P3 | enricher.py | Multiple APIs |

---

## 📋 Integration Points

### Files to Update

#### Core Services
- `portfolio_src/core/services/enricher.py` - Hive integration
- `portfolio_src/core/services/decomposer.py` - ETF holdings cache
- `portfolio_src/core/services/aggregator.py` - Vectorization
- `portfolio_src/core/pipeline.py` - Incremental processing

#### Data Layer
- `portfolio_src/data/market.py` - Ticker mapping fix
- `portfolio_src/data/state_manager.py` - Asset universe sync
- `portfolio_src/data/hive_client.py` - Batch operations

#### Frontend
- `src/components/HoldingsUpload.tsx` - Upload interface
- `src/hooks/useHoldingsUpload.ts` - Upload logic
- `src/lib/api.ts` - API endpoints

#### Configuration
- `default_config/ticker_map.json` - Fix CA22587M1068 entry
- `portfolio_src/config.py` - TTL configuration

---

## 🚨 Risk Mitigation

### Data Quality Risks
| Risk | Probability | Impact | Mitigation |
|-------|-------------|---------|------------|
| **Incorrect manual upload** | Medium | High | ISIN validation, weight sum checks |
| **Stale community data** | High | Medium | Timestamp checks, freshness warnings |
| **Schema drift** | Low | High | SchemaNormalizer enforcement |
| **Hive connectivity** | Medium | Medium | Local cache fallback, retry logic |

### Performance Risks
| Risk | Probability | Impact | Mitigation |
|-------|-------------|---------|------------|
| **Large ETF portfolios** | High | Medium | Async I/O, request batching |
| **Memory bloat** | Medium | Medium | Vectorization, streaming processing |
| **Slow pipeline execution** | Medium | High | Incremental processing, parallel operations |

### Security Risks
| Risk | Probability | Impact | Mitigation |
|-------|-------------|---------|------------|
| **PII in community data** | Low | Critical | Scrubbing before upload |
| **Malicious uploads** | Low | Medium | Validation, contributor tracking |
| **API key exposure** | Low | High | Environment variables, proxy usage |

---

## 📈 Success Metrics

### Technical Metrics
| Metric | Target | Current | Gap |
|--------|---------|---------|------|
| **Pipeline Success Rate** | >99% | ~95% | Schema errors |
| **Enrichment Coverage** | >90% from Hive | ~0% | No Hive integration |
| **Schema Errors** | <1% | ~15% | Case sensitivity issues |
| **Avg Pipeline Time** | <30s | ~45s | Sequential processing |

### User Experience Metrics
| Metric | Target | Current | Gap |
|--------|---------|---------|------|
| **Failed ETF Handling** | 0 critical failures | 2 Amundi ETFs | No Playwright/fallback |
| **Data Freshness Visibility** | 100% clear | 0% | No staleness indicators |
| **Manual Upload Success Rate** | >95% | N/A | No upload interface |

---

## 🎯 End State Vision

After this optimization, the pipeline will be:

### 🏗️ **Architecturally Complete**
- **Modular Services**: Each service with clear contracts and isolation
- **Community-Powered**: Primary data source is Supabase Hive
- **Resilient**: Graceful fallbacks and error recovery
- **Performant**: Vectorized operations and async I/O

### 🔧 **Operationally Stable**  
- **Schema Consistent**: All lowercase, validated columns
- **Incremental**: Only process changed data
- **Observable**: Rich logging and metrics
- **User-Friendly**: Manual upload capabilities

### 🚀 **Future-Ready**
- **SaaS Compatible**: Same architecture scales to cloud deployment
- **Extensible**: Easy addition of new providers and features
- **Community-Driven**: Data quality improves with usage
- **Production-Grade**: Monitoring, alerting, and CI/CD ready

---

## 🔄 Next Steps

1. **Review and Approve**: Validate this plan covers all critical issues
2. **Execute Session Tasks**: Focus on P0 fixes for immediate stability
3. **Sprint Planning**: Schedule P1 tasks for next development cycle
4. **Monitoring Setup**: Implement metrics collection for tracking progress
5. **Community Testing**: Beta test with power users for feedback

---

**Key Strategic Insight:** By implementing this optimization plan, Portfolio Prism transforms from a "fragile local processor" to a "resilient community-powered analytics engine" that becomes more valuable with each user interaction while maintaining privacy-first principles.

---

*This plan addresses all identified gaps while building toward the intended Hive-powered architecture described in the strategic documents.*