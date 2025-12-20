# Implementation Plan (The "When")

> **Development Location:** Project root (standard Tauri layout)
> **Last Updated:** 2025-12-20 (Project Echo Complete)

---

## Done

- [x] **TASK-601:** Fix Pipeline Type & Import Errors
- [x] **TASK-602:** Implement HiveEnrichmentService (Multi-tier strategy)
- [x] **TASK-603:** Integrate market.py with Hive (Community Pricing)
- [x] **TASK-604:** Implement Asset Universe Sync (Hive -> Local CSV)
- [x] **TASK-605:** Rigorous Pipeline Testing (40/40 tests passed)
- [x] **TASK-606:** Implement ETF Holdings Query & Hive Contribution
- [x] **TASK-607:** Implement Smart Manual Upload (XLSX support + Heuristics)
- [x] **TASK-608:** Create HoldingsUpload UI & HealthView Integration
- [x] **TASK-701:** Implement Echo-Bridge (Unified FastAPI Sidecar)
- [x] **TASK-702:** Implement Redacted Reporter (PII Scrubbing + GitHub Relay)
- [x] **TASK-703:** Integrate Echo UI (Status Badge + Opt-out Toggle)


---

## Archive

### Legacy Tasks (Streamlit Era)

- [x] **TASK-401:** Create Trade Republic login UI in Streamlit
- [x] **TASK-402:** Implement keyring storage for TR credentials
- [x] **TASK-403:** Set up Cloudflare Worker proxy
- [x] **TASK-404:** Implement Hive sync client
- [x] **TASK-405:** Implement silent ISIN contribution
- [x] **TASK-406:** Add missing hidden imports to prism.spec
- [x] **TASK-407:** Integrate TR Login as Tab 8
- [x] **TASK-410:** Fix duplicate header/form bug

### Phase 0: Infrastructure & Migration

- [x] **TASK-001:** Archive Legacy Dashboard Code (Commit: `865a91d`)
- [x] **TASK-002:** Migrate In-Flight Infrastructure Tasks (Commit: `06370b2`)
- [x] **TASK-003:** Scaffold React Environment (Commit: `8fde700`)

### Phase 1: The Vault & Contracts

- [x] **TASK-101:** Implement SQLite Schema (Commit: `61b14fa`)
- [x] **TASK-102:** Create Pydantic Data Contracts (Commit: `e1056ac`)

### Phase 2: The Headless Engine

- [x] **TASK-201:** Headless Entry Point (Commit: `0763656`)
- [x] **TASK-202:** Rust Sidecar Spawning (Commit: `d826489`)
- [x] **TASK-203:** Implement IPC Command Handler (Commit: `0763656`)

### Phase 3: The Skeleton UI

- [x] **TASK-301:** Frontend State Setup (Commit: `f80f9e9`)
- [x] **TASK-302:** IPC Bridge (Commit: `9af1d4a`)
- [x] **TASK-303:** System Status Component (Commit: `acc5465`)

### Phase 4: Feature Parity

- [x] **TASK-401:** Dashboard Metric Cards (Commit: `401-metric-cards`)
- [x] **TASK-402:** Portfolio Chart (Commit: `402-portfolio-chart`)
- [x] **TASK-403:** Holdings Data Table (Commit: `917d32a`)
- [x] **TASK-404:** Implement Trade Republic Integration (Commit: `917d32a`)

### Phase 4.5: Hive Activation

- [x] **TASK-451:** Finalize Hive Schema & Generate SQL
- [x] **TASK-452:** Implement Hive Client
- [x] **TASK-453:** Create Hive Migration Script
- [x] **TASK-454:** Deploy Hive Schema & Seed Data

### Phase 5: Polish & Release ✅ (COMPLETED)

- [x] **TASK-501:** Verify PII Scrubber
- [x] **TASK-502:** GitHub Actions CI/CD (Commit: `502-ci-cd`)
- [x] **TASK-503:** Migrate to UV Dependency Management
- [x] **TASK-505:** Config Auto-Installation
- [x] **TASK-507:** Debug Binary Startup Hang

### Phase 6: Community & Performance (IN PROGRESS)

- [x] **TASK-601:** Fix Pipeline Type & Import Errors
- [x] **TASK-602:** Implement HiveEnrichmentService (Multi-tier strategy)
- [x] **TASK-603:** Integrate market.py with Hive (Community Pricing)
- [x] **TASK-604:** Implement Asset Universe Sync (Hive -> Local CSV)
- [x] **TASK-605:** Rigorous Pipeline Testing (40/40 tests passed)
- [x] **TASK-606:** Implement ETF Holdings Query & Hive Contribution
- [x] **TASK-607:** Implement Smart Manual Upload (XLSX support + Heuristics)
- [x] **TASK-608:** Create HoldingsUpload UI & HealthView Integration
- [ ] **TASK-609:** Implement Confidence Scoring Logic (Trust Metrics)
- [ ] **TASK-610:** Vectorize Aggregator Math (Performance)
- [ ] **TASK-611:** Add Pipeline Health Monitoring (Observability)
- [ ] **TASK-612:** Implement Async I/O for Adapters
- [ ] **TASK-615:** Implement Incremental Builds (Remove --clean)
- [ ] **TASK-616:** Parallelize Spec Builds in `build-python.sh`
- [ ] **TASK-617:** Implement Change Detection (Hash-based skip)

### Backlog (Future)

- [ ] **TASK-613:** Update HealthView with Trust Scores
- [ ] **TASK-614:** Migrate flat files to Local SQLite (Local Hive)
