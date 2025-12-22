# External Integration Strategy

> **Purpose:** Strategic decisions on external data sources, API integrations, and community data management for Portfolio Prism
> **Scope:** High-level integration strategy, not implementation specifications
> **Also read:** `keystone/strategy/language-stack.md` for language strategy
> **Also read:** `keystone/strategy/application-shell.md` for shell strategy
> **Also read:** `keystone/strategy/data-architecture.md` for data strategy

---

## Executive Summary

Portfolio Prism employs a **"Community-First, Multi-Tier"** external integration strategy that prioritizes data reliability, user feedback, and zero-cost operation. The architecture combines **Supabase Hive** for community data sharing, **Cloudflare Worker** for secure API proxying, and **GitHub Issues** for rapid feedback loops. This approach transforms fragile individual integrations into a resilient community-supported system while maintaining the privacy-first philosophy and enabling rapid iteration based on user feedback.

---

## Current Integration Assessment

### **External Integration Landscape**

**1. Broker Integration (Trade Republic)**
- **Purpose:** Primary data source - fetch user's portfolio positions and transactions
- **Current Tech:** `pytr` library via TR daemon subprocess
- **Status:** ✅ Working (login + portfolio sync)
- **Risk Level:** High - reverse-engineered library dependency

**2. ETF Provider Adapters (Holdings Data)**
- **Purpose:** Fetch ETF composition data for look-through analysis
- **Current Tech:** Individual scrapers (iShares, VanEck, Vanguard, Xtrackers, Amundi)
- **Status:** ✅ Functional but fragile - web scraping breaks when providers change HTML
- **Risk Level:** Medium - maintenance-heavy but not core functionality

**3. Market Data & Enrichment (Metadata/Prices)**
- **Purpose:** Enrich securities with metadata (sector, geography) and fetch current prices
- **Current Tech:** Finnhub (primary) + Yahoo Finance (fallback) + Wikidata (ISIN resolution)
- **Status:** ⚠️ Mixed - Finnhub limited by free tier, Yahoo Finance unstable
- **Risk Level:** Medium - multiple sources provide resilience

**4. Community Data (Hive)**
- **Purpose:** Share ISIN mappings and ETF compositions with community
- **Current Tech:** Supabase PostgreSQL with local JSON caching
- **Status:** ✅ Implemented for ISIN mappings only
- **Risk Level:** Low - expand scope rather than migrate technology

**5. Feedback & Telemetry**
- **Purpose:** User feedback, crash reporting, and adapter health monitoring
- **Current Tech:** Cloudflare Worker with GitHub API integration (partially implemented)
- **Status:** ⚠️ Worker exists but feedback flow not fully implemented
- **Risk Level:** Low - enhance existing system

---

## Strategic Integration Architecture

### **"Community-First, Multi-Tier" Design**

**Core Principle:** Prioritize community data sharing over individual scraping, with intelligent fallback mechanisms.

#### **Tier 1: Community Data (Supabase Hive)**
- **Primary Source:** Community-contributed ETF holdings and ISIN mappings
- **Reliability:** High - multiple contributors provide redundancy
- **Performance:** Excellent - cached JSON responses
- **Cost:** Minimal - Supabase free tier sufficient

#### **Tier 2: Local Adapters**
- **Secondary Source:** Individual ETF provider scrapers
- **Reliability:** Medium - web scraping is fragile
- **Performance:** Good - direct HTTP requests
- **Cost:** Free - no API fees

#### **Tier 3: Manual Upload**
- **Fallback Source:** User-provided CSV/JSON data
- **Reliability:** High - user-controlled data
- **Performance:** Excellent - local file access
- **Cost:** Free - no external dependencies

#### **Tier 4: Stale Cache**
- **Last Resort:** Cached data with timestamp warnings
- **Reliability:** Medium - depends on cache freshness
- **Performance:** Excellent - local access
- **Cost:** Free - no external dependencies

---

## Integration Domain Strategies

### **1. Broker Integration Strategy**

**Current State:** Trade Republic via `pytr` library
**Strategic Decision:** Focus on TR for now, prepare for future broker abstraction

**MVP Strategy:**
- Maintain current `pytr` implementation
- Add robust error handling and retry logic
- Implement health monitoring to detect when `pytr` breaks
- Add fallback to manual CSV import if `pytr` fails

**v1 Migration Strategy:**
- Create `BrokerAdapter` interface that `TradeRepublicAdapter` implements
- Prepare for future brokers (CSV import, other brokers)
- Add broker configuration management
- **Why:** `pytr` dependency is high-risk - if it breaks, users lose core functionality

### **2. ETF Provider Strategy**

**Current State:** Individual scrapers with 3-tier caching
**Strategic Decision:** Expand Supabase Hive for ETF holdings, reduce scraping burden

**MVP Strategy:**
- Enhance current adapter system with comprehensive error handling
- Implement adapter health monitoring via Cloudflare Worker telemetry
- Strengthen 3-tier caching (local → community → live)
- Add graceful degradation when adapters fail

**v1 Strategy:**
- Migrate to Supabase Hive for holdings
- Create `etf_compositions` table in Supabase
- Implement community upload workflow
- Prioritize Hive data over live scraping
- **Why:** Reduces maintenance burden and improves reliability - only one successful scrape needed per ETF per month

### **3. Market Data Strategy**

**Current State:** Finnhub + Yahoo Finance + Wikidata
**Strategic Decision:** Strengthen multi-source approach with intelligent fallback

**MVP Strategy:**
- Implement provider race condition in Cloudflare Worker
- Add better caching and rate limiting
- Improve error handling for failed API calls
- Add fallback to cached data when all APIs fail

**v1 Strategy:**
- Add Alpha Vantage as additional fallback source
- Implement intelligent source selection based on data type
- Add market status detection (trading hours vs closed)
- **Why:** Market data is critical - multiple sources ensure app remains functional

### **4. Community Data (Hive) Strategy**

**Current State:** ISIN mappings only
**Strategic Decision:** Expand to full ETF holdings with confidence scoring

**MVP Strategy:**
- Keep current ISIN mapping system
- Optimize caching and sync performance
- Add better error handling for Supabase connectivity
- Implement contribution workflow for users

**v1 Strategy:**
- Add `etf_compositions` table to Supabase
- Implement community upload workflow
- Add confidence scoring system
- Add data validation and conflict resolution
- **Why:** Reduces scraping burden and improves community resilience

### **5. Feedback & Telemetry Strategy**

**Current State:** Partially implemented Cloudflare Worker
**Strategic Decision:** Complete GitHub integration for rapid feedback loop

**MVP Strategy:**
- Complete GitHub issue creation via Cloudflare Worker
- Add structured feedback types and categorization
- Implement adapter health reporting
- Add user-initiated feedback buttons in UI

**v1 Strategy:**
- Enhance telemetry and monitoring
- Add structured logging and metrics
- Implement adapter performance monitoring
- Add user analytics (opt-in only)
- **Why:** Critical for rapid feedback loop vision - need to know when things break

---

## Technical Implementation Strategies

### **API Rate Limiting Strategy**

**Tiered Rate Limiting by API Type:**
```javascript
const RATE_LIMITS = {
  // Market Data APIs (Finnhub, Alpha Vantage)
  MARKET_DATA: {
    maxRequests: 60,
    windowMs: 60 * 1000,
    perUser: true
  },
  
  // ETF Provider Adapters
  ETF_ADAPTERS: {
    maxRequests: 30,
    windowMs: 60 * 1000,
    perUser: true
  },
  
  // Community Data (Supabase)
  COMMUNITY_DATA: {
    maxRequests: 200,
    windowMs: 60 * 1000,
    perUser: false
  },
  
  // Feedback/Telemetry
  FEEDBACK: {
    maxRequests: 10,
    windowMs: 60 * 1000,
    perUser: true
  }
};
```

**Implementation Features:**
- **Per-User Limits:** Track by user hash for authenticated requests
- **Global Limits:** Protect against abuse for anonymous requests
- **Adaptive Limits:** Reduce limits during high-traffic periods
- **Priority Queuing:** Critical requests (portfolio sync) get priority

### **Error Recovery & Fallback Mechanisms**

**Fallback Hierarchy:**
- **ETF Holdings:** Hive → Local Adapter → Manual Upload → Stale Cache
- **Market Data:** Finnhub → Alpha Vantage → Yahoo Finance → Cached Data
- **Broker Sync:** TR API → Manual CSV Import → Cached Data

**Automatic Retry Logic:**
```javascript
const RETRY_STRATEGY = {
  maxRetries: 3,
  backoffMs: 1000,
  exponentialBackoff: true,
  retryableErrors: ['timeout', 'rate_limit', 'temporary_failure']
};
```

### **Data Synchronization Strategy**

**Conflict Resolution Framework:**
- **Timestamp Priority:** Most recent submission wins
- **Consensus Validation:** Require 2+ matching submissions for "validated" status
- **Version Control:** Keep historical versions with effective dates
- **Manual Override:** Users can manually select preferred version

**Database Schema:**
```sql
CREATE TABLE etf_compositions (
    id SERIAL PRIMARY KEY,
    etf_isin VARCHAR(12) NOT NULL,
    version INTEGER NOT NULL,
    effective_date DATE,
    holdings_json JSONB NOT NULL,
    confidence_score DECIMAL(3,2),
    contributor_hash VARCHAR(64),
    validation_status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(etf_isin, version)
);
```

### **Security & Privacy Framework**

**Request Authentication:**
```javascript
const signRequest = (payload, secretKey) => {
  const timestamp = Date.now();
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${timestamp}${JSON.stringify(payload)}`)
    .digest('hex');
    
  return { timestamp, signature, payload };
};
```

**Privacy Protection:**
- **PII Scrubbing:** Automatic removal of personal identifiers from telemetry
- **Data Minimization:** Only collect essential data for functionality
- **Local Encryption:** Optional local encryption for sensitive data
- **Anonymized Analytics:** Use anonymous hashes for user tracking

### **Performance Optimization Strategy**

**Request Batching:**
```javascript
// Batch market data requests
const batchMarketDataRequests = (symbols) => {
  const batchSize = 50;
  const batches = chunk(symbols, batchSize);
  
  return Promise.all(
    batches.map(batch => fetchMarketDataBatch(batch))
  );
};
```

**Caching Strategy:**
- **Multi-Level Caching:** Memory → Disk → External cache
- **Intelligent Invalidation:** Cache invalidation based on data freshness
- **Compression:** Compress large JSON payloads
- **Partial Updates:** Only fetch changed data when possible

---

## Community Data Strategy

### **Supabase Hive Expansion**

**Current State:** ISIN mappings only
**Expansion Goal:** Full ETF holdings with confidence scoring

**Database Schema:**
```sql
-- ETF Compositions Table
CREATE TABLE etf_compositions (
    id SERIAL PRIMARY KEY,
    etf_isin VARCHAR(12) NOT NULL,
    holdings_json JSONB NOT NULL,
    source_adapter VARCHAR(50),
    scraped_at TIMESTAMP,
    contributor_hash VARCHAR(64),
    confidence_score DECIMAL(3,2),
    validation_status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Contributor Reliability Tracking
CREATE TABLE contributor_reliability (
    contributor_hash VARCHAR(64) PRIMARY KEY,
    successful_submissions INTEGER DEFAULT 0,
    rejected_submissions INTEGER DEFAULT 0,
    reliability_score DECIMAL(3,2) DEFAULT 0.5,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### **Confidence Scoring System**

**Scoring Factors:**
- **Submission Count (40%):** 1 submit = 0.3, 2 submits = 0.6, 3+ submits = 0.8
- **Contributor Reliability (30%):** Based on submission success rate
- **Data Freshness (20%):** <7 days = 1.0, 7-14 days = 0.8, 14-30 days = 0.6
- **Consensus Agreement (10%):** Based on similarity between submissions

**Confidence Formula:**
```javascript
function calculateConfidenceScore(etfData) {
  const submissionScore = Math.min(0.3 + (etfData.submissionCount * 0.15), 0.9);
  const reliabilityScore = etfData.contributorReliability;
  const freshnessScore = calculateFreshness(etfData.lastUpdated);
  const consensusScore = calculateConsensus(etfData.submissions);
  
  return (
    submissionScore * 0.4 +
    reliabilityScore * 0.3 +
    freshnessScore * 0.2 +
    consensusScore * 0.1
  );
}
```

### **Data Validation Strategy**

**Multi-Source Validation:**
- **Tolerance Levels:** ±1% weight tolerance, 90% holdings match threshold
- **First Submit Trust:** Accept first valid submission as "provisional"
- **Consensus Building:** Require 2+ matching submissions for "validated" status
- **Conflict Resolution:** Timestamp priority with manual override option

---

## Feedback & Telemetry Strategy

### **GitHub Integration Workflow**

**Feedback Taxonomy:**
```javascript
const FEEDBACK_TYPES = {
  CRITICAL: {
    'app_crash': 'Application crashes or freezes',
    'data_corruption': 'Data loss or incorrect calculations',
    'security_issue': 'Security vulnerabilities or concerns'
  },
  FUNCTIONAL: {
    'adapter_failure': 'ETF provider adapter not working',
    'broker_sync_failure': 'Trade Republic sync issues',
    'pipeline_error': 'Analytics pipeline failures',
    'data_quality': 'Incorrect or missing data'
  },
  UI_UX: {
    'ui_bug': 'Interface display problems',
    'usability_issue': 'Difficult to use or confusing',
    'performance_issue': 'Slow loading or response',
    'accessibility': 'Accessibility problems'
  },
  FEATURE: {
    'feature_request': 'New feature suggestions',
    'improvement_suggestion': 'Enhancement ideas',
    'workflow_feedback': 'Comments on user experience',
    'general_comment': 'Other feedback or praise'
  }
};
```

**Cloudflare Worker Implementation:**
```javascript
// Enhanced feedback endpoint
case '/feedback':
    data = await createGitHubIssue({
        type: body.type,
        message: body.message,
        metadata: {
            version: body.version,
            adapter: body.adapter,
            error: body.error,
            userAgent: request.headers.get('User-Agent')
        }
    }, env);
    break;

// Adapter health reporting
case '/health/adapter':
    data = await reportAdapterHealth(body.adapter, body.status, body.error, env);
    break;
```

### **Health Monitoring Strategy**

**Per-ETF Monitoring:**
- **Success Rate:** Track success/failure rates per ETF
- **Response Time:** Monitor API response times
- **Error Patterns:** Identify common error types and patterns
- **Threshold Alerts:** Create GitHub issues at 10% failure rate

**Health Metrics:**
```javascript
const ETF_HEALTH = {
  'IE00B4L5Y982': {
    adapter: 'ishares',
    successRate: 0.95,
    lastSuccess: '2024-12-11T10:00:00Z',
    failureCount: 3,
    status: 'healthy'
  }
};
```

---

## Risk Assessment & Mitigation

### **Risk Analysis Matrix**

| Risk Category | Probability | Impact | Mitigation Strategy |
|---------------|-------------|--------|-------------------|
| **API Rate Limits** | Medium | High | Tiered rate limiting, adaptive limits |
| **Data Quality** | Medium | High | Multi-source validation, confidence scoring |
| **Provider Changes** | High | Medium | Community data, fallback mechanisms |
| **Security Breaches** | Low | Critical | Request signing, encryption, monitoring |
| **Legal Compliance** | Medium | Medium | Terms monitoring, user consent framework |

### **Mitigation Implementation**

**Data Loss Prevention:**
- Comprehensive backup and recovery procedures
- Transaction safety for all critical operations
- Regular integrity testing and validation

**Security Compliance:**
- Regular security assessments and updates
- Industry-standard encryption for sensitive data
- Comprehensive audit logging and monitoring

**Performance Risk Management:**
- Real-time performance monitoring and alerting
- Load testing with realistic data volumes
- Scalability planning and capacity management

---

## Success Metrics & KPIs

### **Integration Reliability Metrics**
- **API Success Rate:** >95% for all external integrations
- **Fallback Success Rate:** >90% when primary sources fail
- **Data Freshness:** <7 days for 90% of ETF holdings
- **Confidence Score Distribution:** >80% of ETFs with confidence >0.6

### **User Experience Metrics**
- **Load Time:** <5 seconds for portfolio data display
- **Error Rate:** <5% of user actions resulting in errors
- **Feedback Response Time:** <24 hours for critical issues
- **Community Participation:** >20% of users contribute data

### **Performance Metrics**
- **API Response Time:** <2 seconds for market data
- **Cache Hit Rate:** >80% for frequently accessed data
- **Concurrent Users:** Support 100+ concurrent users
- **Data Processing:** <30 seconds for portfolio analysis

---

## Scalability Planning

### **Growth Trajectory**

**Current Scale (MVP):**
- **Users:** 10-100 concurrent users
- **API Calls:** 1,000-10,000 calls/day
- **Data Volume:** 100-1,000 ETFs in database
- **Storage:** 1-10 GB total data

**Target Scale (v1):**
- **Users:** 100-1,000 concurrent users
- **API Calls:** 10,000-100,000 calls/day
- **Data Volume:** 1,000-10,000 ETFs in database
- **Storage:** 10-100 GB total data

**Long-term Scale (v2+):**
- **Users:** 1,000+ concurrent users
- **API Calls:** 100,000+ calls/day
- **Data Volume:** 10,000+ ETFs in database
- **Storage:** 100+ GB total data

### **Scalability Strategy**

**Database Scaling:**
- **Read Replicas:** Multiple read replicas for Supabase
- **Connection Pooling:** Efficient database connection management
- **Index Optimization:** Strategic indexing for query performance
- **Partitioning:** Time-based partitioning for historical data

**API Scaling:**
- **Load Balancing:** Multiple Cloudflare Worker instances
- **CDN Caching:** Cache static responses at edge locations
- **Rate Limiting:** Intelligent rate limiting based on user tier
- **Queue System:** Background job processing for heavy operations

---

## Legal & Compliance Framework

### **Risk Assessment**

**ETF Data Redistribution Risks:**
- **Terms of Service Violations:** Most ETF providers prohibit commercial redistribution
- **Copyright Issues:** ETF composition data may be copyrighted
- **Liability Exposure:** Potential liability for inaccurate financial data

**Mitigation Strategies:**
- **Transformative Use:** Store derived analysis rather than raw data
- **User-Generated Content:** Position as user-contributed data sharing
- **Attribution Requirements:** Provide source attribution for all data
- **Geographic Restrictions:** Implement geographic limitations if needed

### **Compliance Implementation**

**Terms of Service Monitoring:**
```javascript
const checkProviderTerms = (provider, dataType) => {
  const terms = PROVIDER_TERMS[provider];
  
  if (terms.restrictions.includes(dataType)) {
    return {
      allowed: false,
      reason: 'Terms of service restriction',
      alternative: 'Use manual upload or different provider'
    };
  }
  
  return { allowed: true };
};
```

**Data Usage Policies:**
- **Clear User Agreement:** Explicit terms for data usage and sharing
- **Opt-In Consent:** Users must opt-in to data sharing
- **Right to Deletion:** Users can request data deletion
- **Transparency Reports:** Regular reports on data usage and sharing

---

## Conclusion

The **"Community-First, Multi-Tier"** external integration strategy provides the optimal foundation for Portfolio Prism's data needs. By prioritizing community data sharing through the Supabase Hive, implementing robust fallback mechanisms, and enabling rapid feedback loops through GitHub integration, this architecture delivers the perfect balance of data reliability, user privacy, and development velocity.

The strategic evolution from fragile individual integrations to a resilient community-supported system positions Portfolio Prism for sustainable growth while maintaining the privacy-first philosophy and zero-cost operation requirements. The phased implementation approach ensures each improvement builds upon proven technology while preparing for future scalability and multi-device synchronization.

**The key strategic insight:** Transforming external integrations from individual maintenance burdens into community-supported assets creates a self-healing system that improves with user participation rather than requiring constant developer intervention.

---

## Phase Summary

### **Phase 0: POC (Completed)**
- Individual ETF provider scrapers
- Basic Trade Republic integration
- Simple market data fetching
- No community data sharing

### **Phase 1: MVP (Current Focus)**
- Supabase Hive expansion for ETF holdings
- GitHub feedback loop implementation
- Adapter health monitoring system
- Confidence scoring for data quality
- Enhanced error recovery and fallback mechanisms

### **Phase 2: v1 (Public Release)**
- Multi-source market data resilience
- Advanced community validation system
- Performance optimization and caching
- Comprehensive monitoring and observability
- Enhanced security and privacy framework

### **Phase 3: v2 (Feature Expansion)**
- Broker abstraction layer
- Advanced analytics and historical data
- Multi-device synchronization
- Scalability improvements
- Enhanced legal compliance framework