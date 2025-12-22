# Backlog

> **Purpose:** Long-term ideas, deferred work, and future considerations.
> **Read this:** When planning next initiatives, not every session.

---

## Ideas

- [ ] iOS companion app using Tauri v2 mobile support
- [ ] Support additional brokers (Interactive Brokers, Degiro, Scalable Capital)
- [ ] Historical portfolio tracking (snapshots over time)
- [ ] Tax lot tracking and optimization hints (consult legal first)
- [ ] Dark mode / theme customization
- [ ] Export reports as PDF

## Deferred

- [ ] **React Frontend v2** — Replace Streamlit with React/TypeScript UI for better UX. Existing React components in `src/` (Dashboard, XRay, Overlap, Holdings views). Deferred to post-MVP. — added: 2024-12-06

- [ ] **Windows/Linux support** — deferred because: macOS-only for MVP, cross-platform testing requires additional resources — added: 2024-12

- [ ] **Real-time price streaming** — deferred because: free APIs don't support it, daily close is sufficient for analysis — added: 2024-12

- [ ] **Multi-broker aggregation** — deferred because: Trade Republic only for MVP, expanding broker support post-validation — added: 2024-12

- [ ] **Manual portfolio entry** — deferred because: focus on automated import first, manual entry is fallback — added: 2024-12

- [ ] **Hive Opt-in UI** — Add preference setting for contribution consent. Currently silent for alpha testers. Required before public release. — added: 2024-12-06

## Technical Debt

- [ ] **Dead Man's Switch** — Python sidecar should monitor stdin for EOF and self-terminate when Tauri dies. Not yet implemented in `prism_boot.py`. Priority: High before release. — added: 2024-12-06

- [ ] **CSP Configuration** — `tauri.conf.json` has `"csp": null` which is insecure. Lock down before public release. — added: 2024-12-06

- [ ] **Lock File Implementation** — Prevent multiple app instances (`~/.portfolio-prism.lock`). — added: 2024-12-06

## Someday/Maybe

- [ ] AI-powered portfolio insights ("Your tech exposure increased 15% this month")
- [ ] Comparison with benchmark indices (S&P 500, MSCI World)
- [ ] Social features (anonymous portfolio comparison with community)
- [ ] Integration with tax software for German investors
- [ ] Watchlist for securities not yet owned
