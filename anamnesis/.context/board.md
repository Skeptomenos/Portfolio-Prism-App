# Project Board

> **Auto-generated from `anamnesis/specs/tasks.md`**
> **Last Updated:** 2024-12-12
> **Active Workstream:** infrastructure

---

## Overview

| Total | Backlog | Open | In Progress | Blocked | Done |
|-------|---------|------|-------------|---------|------|
| 23    | 16      | 3    | 0           | 0       | 4    |

**Progress:** [█░░░░░░░░░░░░░░░░░░░] 17% (4/23 tasks)

---

## Open

<!-- Dependencies met, ready to start -->

- [ ] **TASK-001:** Archive Legacy Dashboard Code
    - *Dependencies:* None
    - *Workstream:* infrastructure

- [ ] **TASK-002:** Migrate In-Flight Infrastructure Tasks
    - *Dependencies:* None
    - *Workstream:* infrastructure

- [ ] **TASK-003:** Scaffold React Environment
    - *Dependencies:* TASK-001
    - *Workstream:* infrastructure

---

## Backlog

<!-- Not yet prioritized or dependencies not met -->

- [ ] **TASK-101:** Implement SQLite Schema (Waiting for TASK-003)
- [ ] **TASK-102:** Create Pydantic Data Contracts (Waiting for TASK-101)
- [ ] **TASK-103:** Data Migration Script (Waiting for TASK-102)
- [ ] **TASK-104:** Refactor Decomposer to Read SQLite (Waiting for TASK-103)
- [ ] **TASK-201:** Headless Entry Point (Waiting for TASK-104)
- [ ] **TASK-202:** Rust Sidecar Spawning (Waiting for TASK-201)
- [ ] **TASK-203:** Implement IPC Command Handler (Python) (Waiting for TASK-201)
- [ ] **TASK-204:** Implement Throttled Asyncio Decomposer (Waiting for TASK-203)
- [ ] **TASK-301:** Frontend State Setup (Waiting for TASK-003)
- [ ] **TASK-302:** IPC Bridge (Waiting for TASK-202)
- [ ] **TASK-303:** System Status Component (Waiting for TASK-302)
- [ ] **TASK-401:** Dashboard Metric Cards (Waiting for TASK-303)
- [ ] **TASK-402:** Portfolio Chart (Waiting for TASK-401)
- [ ] **TASK-403:** Holdings Data Table (Waiting for TASK-401)
- [ ] **TASK-404:** Trade Republic Auth Modal (Waiting for TASK-401)
- [ ] **TASK-501:** Verify PII Scrubber (Waiting for TASK-202)
- [ ] **TASK-502:** GitHub Actions CI/CD (Waiting for TASK-003)

---

## Done

<!-- Recently completed (Legacy) -->

- [x] **TASK-401:** Create Trade Republic login UI in Streamlit
- [x] **TASK-402:** Implement keyring storage for TR credentials
- [x] **TASK-403:** Set up Cloudflare Worker proxy
- [x] **TASK-404:** Implement Hive sync client
