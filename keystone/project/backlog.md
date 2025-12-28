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

- [ ] **BUG-FIXES: Active Bug Fixes** — see `keystone/project/workstreams/bug-fixes.md` for details. — added: 2025-12

- [ ] **TASK-612: Async I/O for Adapters** — deferred because: High risk refactoring during release-prep phase. Converting `requests` to `httpx` async requires changes to cache decorator, adapter registry, and decomposer. Marginal performance gain (parallel ETF fetches) doesn't justify risk to MVP stability. **Priority:** Get MVP running with smooth UX and automatic issue reporting for rapid iteration. Revisit post-MVP when we have more users and can measure actual bottlenecks. — added: 2024-12

- [ ] **CSS Refactor: Inline Styles → CSS Classes** — The codebase uses extensive inline styles (e.g., `style={{ display: 'flex', ... }}`). This makes components hard to maintain and prevents style reuse. **Prerequisites before implementation:** (1) Comprehensive audit of all inline styles across components, (2) Define target CSS architecture (CSS modules, Tailwind utility classes, or CSS-in-JS), (3) Create migration strategy with incremental approach, (4) Document desired end state with examples. **Note:** Do not start refactoring without completing the analysis phase. — added: 2025-12

- [ ] **Identity Resolution Phase 6D: Manual Resolution Upload** — Allow users to manually resolve unresolved holdings by uploading a CSV mapping (ticker → ISIN). **Scope:** (1) CSV upload UI in HoldingsView or NeedsAttentionSection, (2) Backend endpoint to parse and validate CSV, (3) Store manual mappings with `source: 'manual'` and `confidence: 0.85`, (4) Re-run resolution for affected holdings after upload, (5) Option to export current unresolved holdings as CSV template. **Priority:** High — users need a way to fix resolution failures without waiting for API improvements. — added: 2025-12

## Someday/Maybe

- [ ] AI-powered portfolio insights ("Your tech exposure increased 15% this month")
- [ ] Comparison with benchmark indices (S&P 500, MSCI World)
- [ ] Social features (anonymous portfolio comparison with community)
- [ ] Integration with tax software for German investors
- [ ] Watchlist for securities not yet owned
