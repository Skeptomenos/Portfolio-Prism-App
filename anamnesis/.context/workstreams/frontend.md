# Frontend Workstream

> **Focus:** React UI, State Management, and User Experience.
> **See Plan:** `docs/MVP_IMPLEMENTATION_PLAN.md` - Phase 3 & 4.

---

## Active Tasks

### 1. State Management
- [ ] Initialize Zustand Store for application state (User, Portfolio ID).
- [ ] Setup TanStack Query for async data fetching (Engine Commands).

### 2. IPC Bridge
- [ ] Create `lib/ipc.ts` to wrap Tauri `invoke` commands.
- [ ] Implement `useEngineEvent` hook for listening to Rust events.

### 3. Feature Components
- [ ] **System Status:** Component showing Engine health (RAM/Latency).
- [ ] **Dashboard:** Metric cards and Recharts integration.
- [ ] **Holdings:** ShadCN Data Table with sorting/filtering.

## Decisions Log
- **2024-12-12:** Frontend is the *only* UI. No hybrid views.
