# Data Architecture Strategy

> **Purpose:** Strategic decisions on data storage, processing, and evolution for Portfolio Prism
> **Scope:** High-level data architecture, not implementation specifications
> **Also read:** `keystone/strategy/language-stack.md` for language strategy
> **Also read:** `keystone/strategy/application-shell.md` for shell strategy

---

## Executive Summary

Portfolio Prism employs a **"Local-First, Hybrid Storage"** architecture combining **SQLite** for transactional data, **Parquet** for analytics data, and **Supabase** for community data. This approach provides data integrity, performance scalability, and future SaaS compatibility while maintaining the privacy-first philosophy. The architecture evolves from simple CSV files to a robust multi-database system that can handle complex financial data requirements.

---

## Current Tech Stack Assessment

### **Current Architecture: "CSV-Relational" Hybrid**

**Storage Strategy (Updated 2025-12-26):**
- **Portfolio State**: SQLite database (migrated from CSV)
- **Engine**: Pandas for data operations, SQLite for persistence
- **Cloud**: Supabase "Hive" for community ISIN resolution with local SQLite cache
- **Integrity**: Pydantic validation + SQLite constraints

**Current State:**
- ✅ **Transparent**: Human-readable files, easy debugging
- ✅ **Simple**: No database server management
- ✅ **Local-First**: 100% offline functionality
- ⚠️ **Scalability**: CSV performance degrades with data size
- ⚠️ **Integrity**: No ACID transactions, potential race conditions
- ⚠️ **Type Safety**: CSVs lose type information, requiring validation on every load

---

## Data Use Cases & Technology Mapping

### **Use Case Analysis**

| Data Domain | Current Tech | Requirements | Recommended Tech | Rationale |
|-------------|--------------|---------------|-------------------|-----------|
| **User Settings** | `config.py` | ACID compliance, structured config | **SQLite** | Transactional safety for settings |
| **Portfolio State** | CSV files | Relational integrity, primary keys | **SQLite** | Prevent duplicates, enforce relationships |
| **Transaction History** | Not implemented | Strict ACID, audit trail | **SQLite** | Financial transaction accuracy |
| **Market Data Cache** | CSV files | Fast reads, compression, type safety | **Parquet** | Columnar storage for repetitive data |
| **Analytics Processing** | Pandas in-memory | Vectorized operations, large datasets | **DuckDB + Parquet** | OLAP optimization for complex analytics |
| **Historical Archives** | Not implemented | Cost-effective storage, immutability | **Parquet + S3** | Cloud-native data lake approach |
| **Community Data** | Supabase | Collaboration, authentication | **Supabase** | Proven, already implemented |
| **Multi-Device Sync** | Not implemented | Encrypted synchronization | **SQLite ↔ Cloud Postgres** | Hybrid local-first SaaS approach |

### **Technology Decision Matrix**

| Technology | Strengths | Weaknesses | Best Use Cases |
|-------------|------------|------------|----------------|
| **SQLite** | ACID transactions, typed, standard SQL, zero-config | Row-oriented (slower for analytics), rigid schema | App state, User settings, Transactional data |
| **DuckDB** | OLAP optimized, fast vector ops, SQL support, Parquet native | Newer, larger binary, overkill for simple data | Heavy analytics, Complex aggregations, Time-series analysis |
| **Parquet** | Compressed, typed, columnar, cloud-native | Binary format, append-only focus | Archival, Historical data, Cache files, Market data |
| **Supabase** | Postgres backend, Auth included, simple REST | Vendor lock-in, relational structure | Community data, User authentication, Collaboration |
| **Pandas** | Rich ecosystem, rapid prototyping | Memory limitations, single-threaded | Data processing, ETL, Exploratory analysis |

---

## Strategic Storage Architecture

### **"Right Tool for the Job" Design**

**Core Principle:** Use the optimal storage technology for each data domain rather than forcing everything into a single database.

#### **1. Transactional Layer (SQLite)**
**Purpose:** User data that requires ACID compliance and relational integrity
- **User Settings**: Configuration, preferences, UI state
- **Portfolio State**: Current holdings, asset universe, portfolio definitions
- **Transaction Ledger**: Buy/sell/dividend history with audit trails
- **User Enrichment**: Notes, tags, alert rules, multi-portfolio relationships

#### **2. Analytics Layer (Parquet + DuckDB)**
**Purpose:** Large-scale data processing and historical analysis
- **Market Data**: Price history, benchmark data, economic indicators
- **Historical Snapshots**: Daily portfolio values, performance metrics
- **Cache Files**: ETF holdings, enrichment data, adapter results
- **Analytics Results**: Exposure reports, risk calculations, backtest results

#### **3. Collaboration Layer (Supabase)**
**Purpose:** Community data and optional cloud features
- **Community Hive**: ISIN resolution, asset metadata sharing
- **User Authentication**: Optional cloud sync authentication
- **Cloud Sync**: Encrypted multi-device synchronization (future)

---

## Long-Term Strategy & Migration Path

### **Strategic Evolution Goals**

**1. Data Integrity & Safety**
- Move from fragile CSV parsing to robust database constraints
- Implement ACID transactions for all user data modifications
- Add comprehensive backup and recovery mechanisms

**2. Performance Scalability**
- Optimize for large datasets (10+ years of history, 1000+ assets)
- Enable sub-second analytics queries on complex portfolios
- Support real-time data processing and updates

**3. Future SaaS Compatibility**
- Design schemas that migrate easily to cloud databases
- Enable multi-tenant architecture without complete rewrite
- Support hybrid local-first SaaS model

### **Migration Strategy**

#### **Phase 1: Foundation (MVP Focus)**
**Objective:** Establish data integrity and safety
- **SQLite Migration**: Convert CSV files to relational SQLite tables
  - `asset_universe.csv` → `assets` table with primary keys
  - `calculated_holdings.csv` → `holdings` table with foreign keys
  - `config.py` → `settings` table with structured schema
- **Schema Design**: Implement proper relationships and constraints
- **Data Validation**: Pydantic models for all database operations
- **Backup System**: Automated local backup and recovery

#### **Phase 2: Performance (v1 Public Release)**
**Objective:** Optimize for large-scale analytics
- **Parquet Migration**: Convert analytics data to columnar format
  - Historical portfolio snapshots
  - Market data and price history
  - Cache files and intermediate results
- **DuckDB Integration**: Vectorized query processing for analytics
- **Performance Optimization**: Indexing, query optimization, caching strategies
- **Encryption**: Optional SQLCipher for sensitive data protection

#### **Phase 3: Platform (v2 Feature Expansion)**
**Objective:** Advanced features and SaaS readiness
- **Transaction Ledger**: Complete buy/sell/dividend tracking
- **Multi-Portfolio Support**: Relational portfolio management
- **User Enrichment**: Notes, tags, alerts, and custom metadata
- **Cloud Sync**: Optional encrypted synchronization with cloud backend

---

## SaaS Evolution Strategy

### **Multi-Tenancy Considerations**

**Current (Desktop) Architecture:**
- One user = One SQLite file
- Physical isolation via local disk storage
- Simple backup and restore operations

**Future (SaaS) Requirements:**
- One database = Multiple users
- Logical isolation via user_id filtering
- Centralized compute and storage infrastructure
- Enhanced security and compliance requirements

### **Architecture Compatibility Assessment**

**Why Current Strategy is SaaS-Ready:**

**1. SQLite Schema Compatibility**
- SQL schemas migrate easily to PostgreSQL
- Relational design patterns translate directly
- Data types and constraints are standard

**2. Parquet Cloud-Native Design**
- S3 + Parquet is industry standard for data lakes
- Immutable append-only pattern scales perfectly
- Query engines (DuckDB, Athena) designed for cloud storage

**3. DuckDB Portability**
- Runs locally reading local files
- Runs in cloud workers reading S3 files
- Same analytics logic works in both environments

**4. Python Logic Transferability**
- Data processing code moves to backend workers
- Analytics algorithms remain unchanged
- ETL pipelines are environment-agnostic

### **Hybrid SaaS Recommendation**

**"Local-First SaaS" Model:**
- **Architecture**: Desktop app with optional cloud sync
- **Data Storage**: Remains local (SQLite + Parquet)
- **SaaS Features**: Encrypted backup, synchronization, collaboration
- **Benefits**: Recurring revenue without massive compute costs
- **User Control**: Data remains on user device by default

---

## Data Governance & Lifecycle

### **Privacy & Security Framework**

**PII Protection Strategy:**
- **Telemetry**: Anonymous reports with comprehensive PII scrubbing
- **Local Encryption**: SQLCipher option for sensitive holding data
- **Network Security**: All cloud communications via HTTPS with certificate pinning
- **Data Minimization**: Only essential data leaves device with explicit consent

**Privacy-First Implementation:**
- **Local-First Default**: Core data never leaves device without user action
- **Opt-In Telemetry**: Users control all data sharing and analytics
- **Community Anonymization**: All Hive contributions stripped of identifiers
- **Transparent Policies**: Clear data usage and retention policies

### **Schema Migration Strategy**

**Migration Framework Requirements:**
- **Version Control**: Database schema versioning with upgrade paths
- **Backward Compatibility**: Never break user data during updates
- **Rollback Support**: Ability to revert problematic migrations
- **Testing Framework**: Automated testing for all migration scenarios

**Migration Process:**
```python
# Example migration pattern
def upgrade_v1_to_v2():
    """Upgrade database from v1 to v2 schema"""
    # Create new tables with proper constraints
    # Migrate data from old format to new format
    # Validate data integrity and consistency
    # Update schema version marker
    # Commit transaction atomically
```

### **Concurrency & Locking Strategy**

**Multi-Process Architecture:**
- **Rust Shell**: Process management and user interface
- **Python Sidecar**: Data processing and analytics computation
- **Background Workers**: Optional asynchronous task processing

**Locking Implementation:**
- **SQLite WAL Mode**: Enable concurrent reads and writes safely
- **Single Writer Pattern**: Enforce single writer for Parquet analytics data
- **Atomic Operations**: Critical updates use database transactions
- **File Locking**: Proper file-based locking for external data files

### **Backup & Recovery Strategy**

**User Safety Requirements:**
- **Manual Export**: User-controlled data export functionality
- **Automated Backups**: Periodic local backup creation with verification
- **Cloud Sync**: Optional encrypted cloud backup and synchronization
- **Disaster Recovery**: Complete data restoration workflow

**Backup Implementation:**
- **Incremental Backups**: Only backup changed data to reduce storage requirements
- **Compression**: Compress backups to minimize disk usage
- **Verification**: Regular backup integrity testing and validation
- **Recovery Testing**: Automated recovery process testing

---

## Performance Optimization Strategy

### **Current Performance Bottlenecks**

**CSV Format Limitations:**
- **I/O Performance**: Linear read/write operations scale poorly with data size
- **Memory Usage**: Entire files loaded into memory during processing
- **Type Conversion**: String parsing required on every data load
- **Parsing Fragility**: CSV format inconsistencies cause data corruption

**Pandas Memory Constraints:**
- **Single-Threaded**: Limited CPU utilization for large datasets
- **Memory Overhead**: Significant memory overhead for data structures
- **Garbage Collection**: Performance impact from frequent memory allocation

### **Optimization Roadmap**

#### **Phase 1: Foundation Optimization**
- **SQLite Migration**: 10x improvement in state operations
- **Index Strategy**: Proper primary keys and foreign key indexes
- **Query Optimization**: Prepared statements and query plan analysis
- **Connection Pooling**: Efficient database connection management

#### **Phase 2: Analytics Optimization**
- **Parquet Migration**: 10x improvement in analytics I/O performance
- **DuckDB Integration**: Vectorized query processing for complex analytics
- **Memory Management**: Streaming processing for large datasets
- **Caching Strategy**: Intelligent cache invalidation and warming

#### **Phase 3: Advanced Optimization**
- **Parallel Processing**: Multi-core CPU utilization for analytics
- **Compression Optimization**: Balance between compression ratio and read speed
- **Query Optimization**: Advanced query planning and execution optimization
- **Resource Management**: Dynamic resource allocation based on workload

---

## Risk Assessment & Mitigation

### **Risk Analysis Matrix**

| Risk Category | Probability | Impact | Mitigation Strategy |
|---------------|-------------|--------|-------------------|
| **Data Loss** | Low | Critical | Automated backups, transaction safety, recovery testing |
| **Performance Degradation** | Medium | High | Phased optimization, performance monitoring, scalability testing |
| **Migration Failure** | Low | High | Comprehensive testing, rollback procedures, incremental migration |
| **Security Breach** | Low | Critical | Encryption, secure communication, security audits |
| **SaaS Complexity** | Medium | Medium | Hybrid architecture, phased evolution, expert consultation |

### **Mitigation Implementation**

**Data Loss Prevention:**
- **Comprehensive Testing**: Automated testing for all data operations
- **Backup Verification**: Regular backup integrity checks and restoration testing
- **Transaction Safety**: ACID compliance for all critical data modifications
- **Recovery Procedures**: Documented and tested disaster recovery procedures

**Performance Risk Management:**
- **Monitoring Systems**: Real-time performance monitoring and alerting
- **Load Testing**: Regular performance testing with realistic data volumes
- **Scalability Planning**: Proactive scalability planning and capacity management
- **Optimization Pipeline**: Continuous performance optimization and improvement

**Security Compliance:**
- **Regular Audits**: Periodic security assessments and penetration testing
- **Encryption Standards**: Industry-standard encryption for sensitive data
- **Access Control**: Proper authentication and authorization mechanisms
- **Compliance Monitoring**: Ongoing compliance with financial data regulations

---

## Success Metrics & KPIs

### **Data Integrity Metrics**
- **Migration Success Rate**: 100% successful data migrations without data loss
- **Data Corruption Rate**: <0.1% data corruption incidents
- **Backup Reliability**: 99.9% successful backup operations
- **Recovery Time**: <5 minutes for complete data restoration

### **Performance Metrics**
- **Query Response Time**: <2 seconds for complex portfolio analytics queries
- **Data Loading Speed**: <5 seconds for large portfolio data imports
- **Memory Usage**: <500MB for typical portfolio sizes (<1000 assets)
- **Processing Throughput**: >10,000 records/second for analytics operations

### **User Experience Metrics**
- **Application Startup**: <5 seconds from launch to usable state
- **Data Export Speed**: <30 seconds for complete data export
- **Update Migration Time**: <30 seconds for database schema migrations
- **Sync Reliability**: >99% successful cloud synchronization operations

---

## Conclusion

The **"Local-First, Hybrid Storage"** architecture provides the optimal foundation for Portfolio Prism's data management needs. By combining **SQLite** for transactional integrity, **Parquet** for analytics performance, and **Supabase** for community collaboration, this architecture delivers the perfect balance of data safety, performance scalability, and user privacy.

The strategic evolution from CSV-based storage to a robust multi-database system positions Portfolio Prism for sustainable growth while maintaining its privacy-first philosophy. The phased migration approach ensures each improvement builds upon proven technology while preparing for future SaaS expansion.

**The key strategic insight:** Using the right storage technology for each data domain, rather than forcing everything into a single database, creates a flexible, scalable, and maintainable architecture that can evolve from a desktop application to a full-featured SaaS platform without requiring complete architectural rewrites.

---

## Phase Summary

### **Phase 0: POC (Completed)**
- CSV-based "CSV-Relational" hybrid architecture
- Pandas for all data operations
- Basic Pydantic validation
- Supabase "Hive" for community data

### **Phase 1: MVP (Current Focus)**
- SQLite migration for transactional data integrity
- Primary keys and foreign keys for data relationships
- WAL mode for concurrent access
- PII scrubbing for privacy protection

### **Phase 2: v1 (Public Release)**
- Parquet migration for analytics performance
- DuckDB integration for vectorized processing
- Optional SQLCipher encryption
- Performance optimization and monitoring

### **Phase 3: v2 (Feature Expansion)**
- Complete transaction ledger implementation
- Multi-portfolio support with relational management
- User enrichment features (notes, tags, alerts)
- Optional cloud synchronization for multi-device support

