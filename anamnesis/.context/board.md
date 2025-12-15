# Project Board

> **Auto-generated from `anamnesis/specs/tasks.md`**
> **Last Updated:** 2024-12-15 (Session 2)
> **Active Workstream:** frontend

---

## Overview

| Total | Backlog | Open | In Progress | Blocked | Done |
|-------|---------|------|-------------|---------|------|
| 23    | 9       | 3    | 0           | 0       | 11   |

**Progress:** [████░░░░░░░░░░░░░░░░] 48% (11/23 tasks)

---

## Open

<!-- Dependencies met, ready to start -->

- [ ] **TASK-101:** Implement SQLite Schema
    - *Dependencies:* TASK-003 (Done)
    - *Workstream:* data-engine

- [ ] **TASK-401:** Dashboard Metric Cards
    - *Dependencies:* TASK-303 (Done)
    - *Workstream:* frontend

- [ ] **TASK-502:** GitHub Actions CI/CD
    - *Dependencies:* TASK-003 (Done)
    - *Workstream:* infrastructure

---

## Backlog

<!-- Not yet prioritized or dependencies not met -->

### Data Engine (Phase 1-2)
- [ ] **TASK-101:** Implement SQLite Schema (Waiting for TASK-003 ✓)
- [ ] **TASK-102:** Create Pydantic Data Contracts (Waiting for TASK-101)
- [ ] **TASK-103:** Data Migration Script (Waiting for TASK-102)
- [ ] **TASK-104:** Refactor Decomposer to Read SQLite (Waiting for TASK-103)
- [ ] **TASK-201:** Headless Entry Point (Waiting for TASK-104)
- [ ] **TASK-202:** Rust Sidecar Spawning (Waiting for TASK-201)
- [ ] **TASK-203:** Implement IPC Command Handler (Python) (Waiting for TASK-201)
- [ ] **TASK-204:** Implement Throttled Asyncio Decomposer (Waiting for TASK-203)
- [ ] **TASK-205:** Implement Async Auth State Machine (Waiting for TASK-203)

### Frontend (Phase 4)
- [ ] **TASK-401:** Dashboard Metric Cards (Waiting for TASK-303)
- [ ] **TASK-402:** Portfolio Chart (Waiting for TASK-401)
- [ ] **TASK-403:** Holdings Data Table (Waiting for TASK-401)
- [ ] **TASK-404:** Implement Auth Challenge Modal (Waiting for TASK-205)

### Infrastructure (Phase 5)
- [ ] **TASK-501:** Verify PII Scrubber (Waiting for TASK-202)
- [ ] **TASK-502:** GitHub Actions CI/CD (Waiting for TASK-003 ✓)

---

## Done

<!-- Recently completed -->

### Phase 0: Infrastructure & Migration
- [x] **TASK-001:** Archive Legacy Dashboard Code — `865a91d`
- [x] **TASK-002:** Migrate In-Flight Infrastructure Tasks — `06370b2`
- [x] **TASK-003:** Scaffold React Environment — `8fde700`

### Phase 3: Frontend Foundation
- [x] **TASK-301:** Frontend State Setup — `f80f9e9`
- [x] **TASK-302:** IPC Bridge — `9af1d4a`
- [x] **TASK-303:** System Status Component — `acc5465`

---

## Archive

### Legacy Tasks (Streamlit Era)
- [x] **TASK-401:** Create Trade Republic login UI in Streamlit
- [x] **TASK-402:** Implement keyring storage for TR credentials
- [x] **TASK-403:** Set up Cloudflare Worker proxy
- [x] **TASK-404:** Implement Hive sync client
- [x] **TASK-405:** Implement silent ISIN contribution
