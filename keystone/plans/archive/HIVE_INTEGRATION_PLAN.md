# Supabase Hive Integration Implementation Plan

**Status:** Implementation In Progress
**Date:** 2025-12-20
**Objective:** Connect the analytics pipeline to Supabase Hive for community-powered asset enrichment while maintaining fallback resilience.

---

## 🎯 Executive Summary

The current pipeline operates in **local-only mode** despite having Supabase infrastructure in place. This integration will transform it into a **community-first, multi-tier enrichment system** that provides:

1. **Primary Source**: Supabase Hive community data
2. **Intelligent Fallbacks**: Local cache → API providers → Stale data
3. **Confidence Scoring**: Trust metrics for data quality assessment
4. **Bidirectional Contribution**: Users can upload holdings to improve community data

---

## 📊 Current State Analysis

### ✅ **What's Already Available**
- **Supabase Infrastructure**: Tables created (`assets`, `listings`, `etf_holdings`)
- **HiveClient**: Batch operations (`batch_lookup`, `batch_contribute`) implemented and type-safe
- **Schema Foundation**: `SchemaNormalizer` ready for consistent data handling
- **Pipeline Architecture**: Service-oriented with clear integration points
- **Type Stability**: Phase 0 (Type/Import fixes) completed successfully

### ⚠️ **What's Missing**
- **Enrichment Integration**: Enricher uses only API calls, not Hive
- **Asset Universe Sync**: Static CSV instead of dynamic Supabase sync
- **ETF Holdings Integration**: Direct scraping without community fallback
- **Confidence System**: No scoring or data quality metrics
- **Manual Upload**: No interface for users to contribute holdings

---

## 🚀 Implementation Strategy

### Phase 0: Type Error Resolution (Priority 0) ✅ COMPLETED
**Objective**: Resolve all blocking type and import errors.
- Fixed `hive_client.py` syntax and indentation.
- Resolved `supabase` client type issues with safe fallback pattern.
- Verified `utils.py` and `enricher.py` imports.

### Phase 1: Hive Client Enhancement (Priority 1) ✅ COMPLETED
**Objective**: Extend HiveClient with batch operations and caching
- [x] Implement `batch_lookup` with proper error handling
- [x] Implement `batch_contribute` for community updates
- [x] Implement Asset Universe Sync logic
- [x] Implement ETF Holdings Query logic

### Phase 2: Enrichment Service Overhaul (Priority 1) ✅ COMPLETED
**Objective**: Replace API-first enrichment with Hive-first architecture
- [x] Create `HiveEnrichmentService`
- [x] Update `Enricher` to use Hive as primary source
- [x] Implement ETF Holdings retrieval in Decomposer
- [ ] Implement confidence scoring logic

### Phase 3: Manual Upload System ✅ COMPLETED
**Objective**: Create React component and backend for users to contribute ETF holdings
- [x] Implement `DataCleaner` utility with heuristic cleanup.
- [x] Implement `upload_holdings` IPC command.
- [x] Create `HoldingsUpload` React component.
- [x] Integrate upload flow into `HealthView`.

### Phase 4: Performance Optimization (Priority 2) PENDING
**Objective**: Implement vectorization and async I/O operations

### Phase 5: Monitoring & Quality (Priority 3) PENDING
**Objective**: Add comprehensive metrics and data quality monitoring

---

## 🔧 Implementation Tasks

### ✅ **Completed Tasks**
| Task | Priority | Component | Status | Notes |
|-------|-----------|------------|--------|-------|
| Fix Type/Import Errors | P0 | Multiple | ✅ COMPLETED | All LSP diagnostics pass |
| Enhance HiveClient batch operations | P1 | hive_client.py | ✅ COMPLETED | `batch_lookup` and `batch_contribute` ready |
| Implement HiveEnrichmentService | P1 | enricher.py | ✅ COMPLETED | Multi-tier strategy active |
| Add asset universe sync | P1 | state_manager.py | ✅ COMPLETED | Syncs Hive to local CSV |
| Rigorous Integration Testing | P0 | tests/* | ✅ COMPLETED | 40/40 tests passed |
| Implement ETF Holdings Query | P1 | decomposer.py | ✅ COMPLETED | Community-first decomposition active |
| Implement Smart Manual Upload | P1 | data_cleaner.py | ✅ COMPLETED | XLSX support + Heuristics |
| Create HoldingsUpload UI | P1 | React | ✅ COMPLETED | Integrated into HealthView |

### Immediate (Next Session)
| Task | Priority | Component | Est. Effort | Status |
|-------|-----------|------------|-------------|--------|
| **Implement Confidence Scoring** | P2 | hive_client.py | 6 hours | **NEXT STEP** |
| Vectorize Aggregator | P2 | aggregator.py | 6 hours | Pending |
| Add Pipeline Health Monitoring | P2 | pipeline.py | 4 hours | Pending |


### Short Term (Next Sprint)
| Task | Priority | Component | Est. Effort |
|-------|-----------|------------|-------------|
| Vectorize Aggregator | P2 | aggregator.py | 6 hours |
| Implement async ETF adapters | P2 | adapters/* | 8 hours |
| Add confidence scoring system | P2 | hive_client.py | 6 hours |
| Implement pipeline monitoring | P2 | pipeline.py | 4 hours |

### Long Term (Future)
| Task | Priority | Component | Est. Effort |
|-------|-----------|------------|-------------|
| Data quality dashboard | P3 | Frontend | 16 hours |
| Advanced conflict resolution | P3 | Multiple | 12 hours |
| Multi-user Hive contributions | P3 | Backend | 20 hours |

---

## 🚀 Success Metrics

### Target Metrics
| Metric | Target | Current | Measurement |
|--------|---------|---------|-----------|
| Hive Enrichment Coverage | >80% | ~0% | % of assets enriched from Hive |
| API Fallback Rate | <20% | ~100% | % requiring API fallbacks |
| Manual Upload Success Rate | >95% | N/A | % of successful user uploads |
| Average Enrichment Time | <2s | ~5s | Time per asset enrichment |
| Community Contribution Rate | >10% | 0% | % of users contributing data |

### Quality Indicators
- **Confidence Score Distribution**: >70% of assets with confidence >0.6
- **Data Freshness**: >90% of ETF holdings less than 30 days old
- **Error Attribution**: 100% of pipeline errors properly categorized and tracked
- **User Satisfaction**: Manual upload success rate and feedback collection

---

## 🔗 Integration Points

### Files to Update

#### Core Services
- `portfolio_src/core/services/enricher.py` - Complete Hive integration
- `portfolio_src/core/services/decomposer.py` - Add ETF holdings cache
- `portfolio_src/core/services/aggregator.py` - Vectorization improvements
- `portfolio_src/core/pipeline.py` - Health monitoring integration

#### Data Layer
- `portfolio_src/data/hive_client.py` - Batch operations and caching
- `portfolio_src/data/state_manager.py` - Asset universe synchronization
- `portfolio_src/data/cache_manager.py` - ETF holdings cache management

#### Frontend
- `src/components/HoldingsUpload.tsx` - Manual upload interface
- `src/hooks/useHoldingsUpload.ts` - Upload state management
- `src/lib/api.ts` - Upload API endpoints

#### Configuration
- `portfolio_src/config.py` - TTL and Hive configuration

---

## 🔧 Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|-------|-------------|---------|-----------|
| **Stale Community Data** | Medium | Medium | Freshness warnings, confidence scoring display |
| **Low Confidence Uploads** | Medium | High | Validation, contributor tracking, manual review |
| **Hive Connectivity Loss** | Low | High | Local cache fallback, retry logic, error handling |
| **Performance Degradation** | Medium | Medium | Vectorization, async I/O, performance monitoring |
| **Upload Failures** | High | Medium | Comprehensive validation, error handling, retry mechanisms |

---

## 🎯 End Vision

After implementation, Portfolio Prism will have:

### 🏗️ **Hive-Powered Analytics**
- **Community First**: Supabase Hive as primary enrichment source
- **Intelligent Fallbacks**: Multi-tier resilience strategy
- **Bidirectional Contribution**: Users can both consume and contribute data
- **Data Quality Monitoring**: Confidence scoring and freshness tracking

### 🔧 **Production-Grade Pipeline**
- **Performant**: Vectorized operations and async I/O
- **Reliable**: Structured error handling and graceful degradation
- **Observable**: Comprehensive metrics and health monitoring
- **User-Friendly**: Manual upload capabilities and clear error messages

### 🚀 **Future-Ready Architecture**
- **Scalable**: Designed for SaaS deployment
- **Extensible**: Easy addition of new providers and features
- **Community-Driven**: Data quality improves with usage

---

## 🔧 **Option A Implementation Plan: Fix Type Issues First**

**Status:** Recommended Next Step
**Rationale:** Type/import errors are blocking all meaningful progress. Must resolve foundation before building features.

### Phase 0: Type Error Resolution (Priority 0 - BLOCKING)

#### 0.1 **Comprehensive Type Audit**
**Objective**: Identify ALL type/import issues across the codebase

**Tasks:**
1. **Run LSP Diagnostics** on all Python files to get complete error list
2. **Categorize Issues**:
   - Missing imports (`SchemaError`, `Client` types)
   - Type annotation mismatches (`DataFrame | Series | Unknown`)
   - Supabase client type issues
   - Pandas type inference problems
3. **Create Error Inventory** with file-by-file breakdown

**Expected Outcome**: Complete list of all type errors requiring fixes

#### 0.2 **Import Resolution**
**Objective**: Fix all missing import statements

**Files to Fix:**
- `portfolio_src/core/utils.py` - `SchemaError` import
- `portfolio_src/core/services/enricher.py` - Type imports
- `portfolio_src/data/hive_client.py` - Supabase `Client` types
- `portfolio_src/data/state_manager.py` - Pandas type annotations
- `portfolio_src/adapters/ishares.py` - Missing constants and type issues

**Strategy:**
- Add missing imports from existing modules
- Fix supabase client type annotations
- Ensure all `from` statements reference correct symbols

#### 0.3 **Type Annotation Cleanup**
**Objective**: Resolve type inference and annotation issues

**Common Issues:**
- `DataFrame | Series | Unknown` → Use proper `pd.DataFrame` typing
- `None` attribute access → Add proper null checks
- Generic `Client` → Use specific supabase client types

**Implementation:**
- Add explicit type hints where missing
- Use `Optional[]` for nullable types
- Add type guards for pandas operations

#### 0.4 **Validation & Testing**
**Objective**: Ensure all fixes work correctly

**Steps:**
1. Run LSP diagnostics again - should show 0 errors
2. Test basic imports in each fixed file
3. Run basic functionality tests
4. Verify no regressions in working code

**Success Criteria:**
- ✅ All LSP diagnostics pass (0 errors)
- ✅ All Python files import without errors
- ✅ Basic functionality tests pass
- ✅ No regressions in existing working code

### Phase 1: Hive Integration Implementation (After Type Fixes)

#### 1.1 **Enhanced HiveClient Batch Operations**
**Objective**: Complete the batch lookup and contribution functionality

**Implementation:**
```python
def batch_lookup(self, isins: List[str]) -> Dict[str, AssetEntry]:
    """Complete batch lookup with proper error handling"""
    # Check cache first
    uncached_isins = [isin for isin in isins if isin not in self._universe_cache]

    if not uncached_isins:
        return {isin: self._universe_cache[isin] for isin in isins}

    # Batch fetch from Supabase with error handling
    try:
        client = self._get_client()
        if not client:
            return {isin: AssetEntry(isin=isin, name="Unknown") for isin in uncached_isins}

        response = client.from_("assets").select("*").in_("isin", uncached_isins).execute()

        # Process results and update cache
        for row in response.data:
            isin = row["isin"]
            asset_entry = AssetEntry(
                isin=isin,
                name=row.get("name", ""),
                asset_class=row.get("asset_class", "Unknown"),
                base_currency=row.get("base_currency", "Unknown"),
                enrichment_status=row.get("enrichment_status", "stub")
            )
            self._universe_cache[isin] = asset_entry

        return {isin: self._universe_cache.get(isin, AssetEntry(isin=isin, name="Unknown")) for isin in isins}

    except Exception as e:
        logger.error(f"Hive batch lookup failed: {e}")
        return {isin: AssetEntry(isin=isin, name="Unknown") for isin in uncached_isins}
```

#### 1.2 **HiveEnrichmentService Implementation**
**Objective**: Create the Hive-first enrichment service

**Implementation:**
```python
@dataclass
class EnrichmentResult:
    hive_data: Dict[str, AssetMetadata]
    fallback_data: Dict[str, AssetMetadata]
    sources: Dict[str, str]  # ISIN -> source attribution

class HiveEnrichmentService:
    def __init__(self):
        self.hive_client = get_hive_client()
        self.fallback_apis = [
            FallbackAPI('finnhub', self._fetch_from_finnhub),
            FallbackAPI('yfinance', self._fetch_from_yfinance),
            FallbackAPI('wikidata', self._fetch_from_wikidata)
        ]

    def get_metadata_batch(self, isins: List[str]) -> EnrichmentResult:
        # 1. Try Hive first (primary source)
        hive_metadata = self.hive_client.batch_lookup(isins)

        # 2. Identify gaps
        missing_isins = [isin for isin in isins if isin not in hive_metadata]

        # 3. Fill gaps with fallback APIs (parallel)
        fallback_metadata = self._fetch_fallbacks_parallel(missing_isins)

        # 4. Update Hive with new discoveries
        if fallback_metadata:
            self.hive_client.batch_contribute(list(fallback_metadata.values()))

        # 5. Return combined results with source attribution
        sources = {}
        for isin in isins:
            if isin in hive_metadata:
                sources[isin] = "hive"
            elif isin in fallback_metadata:
                sources[isin] = fallback_metadata[isin].get("source", "fallback")
            else:
                sources[isin] = "unknown"

        return EnrichmentResult(
            hive_data=hive_metadata,
            fallback_data=fallback_metadata,
            sources=sources
        )
```

#### 1.3 **Enricher Service Integration**
**Objective**: Update the main Enricher to use HiveEnrichmentService

**Implementation:**
```python
class Enricher:
    def __init__(self, enrichment_service=None):
        # Use HiveEnrichmentService by default
        if enrichment_service is None:
            enrichment_service = HiveEnrichmentService()
        self.enrichment_service = enrichment_service

    def enrich(self, holdings_map: Dict[str, pd.DataFrame]) -> Tuple[Dict[str, pd.DataFrame], List[PipelineError]]:
        # ... existing validation ...

        for etf_isin, holdings in holdings_map.items():
            try:
                enriched = self._enrich_holdings(holdings)
                enriched_map[etf_isin] = enriched
                logger.debug(f"Enriched {etf_isin}: {len(enriched)} holdings")
            except Exception as e:
                errors.append(PipelineError(
                    phase=ErrorPhase.ENRICHMENT,
                    error_type=ErrorType.API_FAILURE,
                    item=etf_isin,
                    message=str(e),
                    fix_hint="Check enrichment service connectivity or provide manual data"
                ))
                enriched_map[etf_isin] = holdings

        logger.info(f"Enrichment complete: {len(enriched_map)} ETFs, {len(errors)} errors")
        return enriched_map, errors
```

### Phase 2: Manual Upload System (After Hive Integration)

#### 2.1 **React HoldingsUpload Component**
**Objective**: Create the user interface for ETF holdings uploads

**Implementation:** (See detailed code in Phase 3.1 of original plan)

#### 2.2 **Backend Upload Endpoints**
**Objective**: Implement server-side validation and storage

**Implementation:** (See detailed code in Phase 3.2 of original plan)

### Success Criteria for Option A

#### Phase 0 Success:
- ✅ **0 LSP diagnostic errors** across all Python files
- ✅ **All imports resolve correctly**
- ✅ **Type annotations are consistent**
- ✅ **Basic functionality tests pass**

#### Phase 1 Success:
- ✅ **HiveClient batch operations work**
- ✅ **HiveEnrichmentService integrates properly**
- ✅ **Enricher uses Hive as primary source**
- ✅ **Fallback APIs work when Hive fails**

#### Phase 2 Success:
- ✅ **Manual upload interface works**
- ✅ **Backend validation and storage functional**
- ✅ **End-to-end upload flow complete**

### Risk Mitigation for Option A

| Risk | Mitigation |
|------|------------|
| **Type fixes introduce regressions** | Comprehensive testing after each fix |
| **Import resolution takes too long** | Focus on critical files first (hive_client.py, enricher.py) |
| **Type system becomes too complex** | Use `Any` strategically for external APIs, proper typing for core logic |
| **Testing becomes difficult** | Implement basic smoke tests for each fixed module |

### Timeline for Option A

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 0: Type Fixes** | 2-3 hours | Clean codebase with 0 type errors |
| **Phase 1: Hive Integration** | 4-6 hours | Working Hive enrichment system |
| **Phase 2: Manual Upload** | 6-8 hours | Complete upload functionality |
| **Testing & Validation** | 2 hours | End-to-end functionality verification |

---

**Key Strategic Insight**: This Hive integration transforms Portfolio Prism from a "fragile local processor" into a "resilient community-powered analytics engine" that becomes more valuable with each user interaction while maintaining privacy-first principles.

**Implementation Recommendation**: Start with Option A (fix type issues first) to establish a solid foundation, then proceed with the Hive integration implementation as outlined above.