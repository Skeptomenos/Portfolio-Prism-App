# Backlog

> **Purpose:** Long-term ideas, deferred work, and future considerations.
> **Read this:** When planning next initiatives, not every session.

---

## Ideas

- [ ] iOS companion app using Tauri v2 mobile support
- [ ] Support additional brokers (Interactive Brokers, Degiro, Scalable Capital)
- [ ] Historical portfolio tracking (snapshots over time)

## Deferred

- [ ] **Windows/Linux support** — deferred because: macOS-only for MVP, cross-platform testing requires additional resources — added: 2024-12

- [ ] **Multi-broker aggregation** — deferred because: Trade Republic only for MVP, expanding broker support post-validation — added: 2024-12

- [ ] **Manual portfolio entry** — deferred because: focus on automated import first, manual entry is fallback — added: 2024-12

## Technical Debt

- [ ] **TASK-612: Async I/O for Adapters** — deferred because: High risk refactoring during release-prep phase. Converting `requests` to `httpx` async requires changes to cache decorator, adapter registry, and decomposer. Marginal performance gain (parallel ETF fetches) doesn't justify risk to MVP stability. **Priority:** Get MVP running with smooth UX and automatic issue reporting for rapid iteration. Revisit post-MVP when we have more users and can measure actual bottlenecks. — added: 2024-12

## Someday/Maybe

- [ ] AI-powered portfolio insights ("Your tech exposure increased 15% this month")
- [ ] Comparison with benchmark indices (S&P 500, MSCI World)
- [ ] Social features (anonymous portfolio comparison with community)
- [ ] Integration with tax software for German investors
- [ ] Watchlist for securities not yet owned
