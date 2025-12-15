# Project Board

> **Auto-generated from `anamnesis/specs/tasks.md`**
> **Last Updated:** 2024-12-15 (MVP Complete)
> **Active Workstream:** frontend / infrastructure
> **Status:** MVP FUNCTIONAL - Trade Republic integration complete

---

## Overview

| Total | Backlog | Open | In Progress | Blocked | Done |
|-------|---------|------|-------------|---------|------|
| 23    | 5       | 2    | 0           | 0       | 16   |

**Progress:** [████████████████░░░░] 70% (16/23 tasks)

---

## Milestone: MVP Complete

The MVP is **fully functional**:
- React UI with Glassmorphic design
- Trade Republic authentication (login + 2FA)
- Real portfolio data sync (30+ positions)
- Dashboard with live metrics
- Portfolio table with inline editing
- Auto-sync after login

---

## Open (Ready to Start)

<!-- Dependencies met, ready to start -->

- [ ] **TASK-401:** Dashboard Metric Cards
    - *Dependencies:* TASK-303 (Done)
    - *Workstream:* frontend
    - *Note:* Dashboard already shows data; this enhances visualizations

- [ ] **TASK-502:** GitHub Actions CI/CD
    - *Dependencies:* TASK-003 (Done)
    - *Workstream:* infrastructure
    - *Note:* Ready for automated builds

---

## Backlog

<!-- Not yet prioritized or dependencies not met -->

### Data Engine
- [ ] **TASK-103:** Data Migration Script (Deferred - using TR API)
- [ ] **TASK-104:** Refactor Decomposer to Read SQLite (Waiting for TASK-103)
- [ ] **TASK-204:** Throttled Asyncio Decomposer (Deferred)

### Frontend
- [ ] **TASK-402:** Portfolio Chart (Waiting for TASK-401)
- [ ] **TASK-403:** Holdings Data Table (Waiting for TASK-401)

### Infrastructure
- [ ] **TASK-501:** Verify PII Scrubber (Waiting for TASK-202)

---

## Done

<!-- Completed tasks -->

### Phase 0: Infrastructure & Migration
- [x] **TASK-001:** Archive Legacy Dashboard Code - `865a91d`
- [x] **TASK-002:** Migrate In-Flight Infrastructure Tasks - `06370b2`
- [x] **TASK-003:** Scaffold React Environment - `8fde700`

### Phase 1: Data Layer
- [x] **TASK-101:** Implement SQLite Schema - `61b14fa`
- [x] **TASK-102:** Create Pydantic Data Contracts - `e1056ac`

### Phase 2: Headless Engine
- [x] **TASK-201:** Headless Entry Point - `0763656`
- [x] **TASK-202:** Rust Sidecar Spawning - `d826489`
- [x] **TASK-203:** IPC Command Handler - `0763656`

### Phase 3: Frontend Foundation
- [x] **TASK-301:** Frontend State Setup - `f80f9e9`
- [x] **TASK-302:** IPC Bridge - `9af1d4a`
- [x] **TASK-303:** System Status Component - `acc5465`

### Phase 4: Feature Parity (MVP)
- [x] **TASK-404:** Trade Republic Integration - `917d32a`
    - Login flow with glassmorphic UI
    - 2FA modal
    - Session persistence and restore
    - Portfolio sync with real data
    - Auto-sync after login
    - Dashboard with real metrics
    - Portfolio table with TanStack Table

---

## Archive

### Legacy Tasks (Streamlit Era)
- [x] **TASK-401:** Create Trade Republic login UI in Streamlit
- [x] **TASK-402:** Implement keyring storage for TR credentials
- [x] **TASK-403:** Set up Cloudflare Worker proxy
- [x] **TASK-404:** Implement Hive sync client (Legacy)
- [x] **TASK-405:** Implement silent ISIN contribution
