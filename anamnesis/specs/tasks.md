# Implementation Plan (The "When")

> **Development Location:** Project root (standard Tauri layout)
> **Last Updated:** 2024-12-15 (MVP Complete)
> **Strategy:** `anamnesis/strategy/architecture-overview.md` > **Status:** MVP COMPLETE - Phase 0-4 Done, Phase 5 In Progress

## Status Legend

| Status        | Meaning                                | Next Action        |
| ------------- | -------------------------------------- | ------------------ |
| `Backlog`     | Idea captured, not prioritized         | Prioritize or park |
| `Open`        | Ready to work, dependencies met        | Start work         |
| `In Progress` | Currently being worked on              | Complete or block  |
| `Blocked`     | Cannot proceed, waiting for dependency | Resolve blocker    |
| `Done`        | Verified and complete                  | Archive when ready |
| `Archive`     | Historical reference                   | None               |

---

## Workstreams

| Workstream       | Description                   | Status |
| ---------------- | ----------------------------- | ------ |
| `infrastructure` | CI/CD, Telemetry, Scaffolding | Active |
| `data-engine`    | Python Backend, SQLite, IPC   | Active |
| `frontend`       | React UI, State Management    | Active |

---

## Done

<!-- Recently completed -->

_(Tasks moved to Archive)_

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

### Phase 5: Polish & Release

- [x] **TASK-501:** Verify PII Scrubber
- [x] **TASK-502:** GitHub Actions CI/CD (Commit: `502-ci-cd`)
- [x] **TASK-503:** Migrate to UV Dependency Management
- [x] **TASK-505:** Config Auto-Installation
- [x] **TASK-507:** Debug Binary Startup Hang
