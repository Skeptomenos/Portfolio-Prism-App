# Project Board

> **Auto-generated from `anamnesis/specs/tasks.md`** > **Last Updated:** 2025-12-17
> **Active Workstream:** infrastructure

---

## Overview

| Total | Backlog | Open | In Progress | Blocked | Done |
| ----- | ------- | ---- | ----------- | ------- | ---- |
| 31    | 16      | 4    | 0           | 0       | 11   |

**Progress:** [███████████░░░░░░░░░░░░░░░░░░░] 35% (11/31 tasks)

---

## Open

<!-- Dependencies met, ready to start -->

- [ ] **TASK-451:** Finalize Hive Schema & Generate SQL

  - _Dependencies:_ TASK-102
  - _Workstream:_ data-engine, infrastructure

- [ ] **TASK-452:** Implement Hive Client (Read/Write)

  - _Dependencies:_ TASK-451
  - _Workstream:_ data-engine

- [ ] **TASK-453:** Create Hive Migration Script

  - _Dependencies:_ TASK-452
  - _Workstream:_ data-engine

- [ ] **TASK-454:** Deploy Hive Schema & Seed Data
  - _Dependencies:_ TASK-451, TASK-453
  - _Workstream:_ infrastructure

---

## Backlog

<!-- Not yet prioritized or dependencies not met -->

- [ ] **TASK-103:** Data Migration Script (Waiting for TASK-102)
- [ ] **TASK-104:** Refactor Decomposer to Read SQLite (Waiting for TASK-103)
- [ ] **TASK-204:** Implement Throttled Asyncio Decomposer (Waiting for TASK-203)
- [ ] **TASK-205:** Implement Async Auth State Machine (Python) (Waiting for TASK-203)
- [ ] **TASK-401:** Dashboard Metric Cards (Waiting for TASK-303)
- [ ] **TASK-402:** Portfolio Chart (Waiting for TASK-401)
- [ ] **TASK-403:** Holdings Data Table (Waiting for TASK-401)
- [ ] **TASK-501:** Verify PII Scrubber (Waiting for TASK-202)
- [ ] **TASK-502:** GitHub Actions CI/CD (Waiting for TASK-003, TASK-503)

---

## Done

<!-- Recently completed -->

- [x] **TASK-001:** Archive Legacy Dashboard Code
- [x] **TASK-002:** Migrate In-Flight Infrastructure Tasks
- [x] **TASK-003:** Scaffold React Environment
- [x] **TASK-101:** Implement SQLite Schema
- [x] **TASK-102:** Create Pydantic Data Contracts
- [x] **TASK-201:** Headless Entry Point
- [x] **TASK-202:** Rust Sidecar Spawning
- [x] **TASK-203:** Implement IPC Command Handler (Python)
- [x] **TASK-503:** Migrate to UV Dependency Management
- [x] **TASK-505:** Config Auto-Installation (Frozen Mode)
- [x] **TASK-507:** Debug Binary Startup Hang (Critical)
