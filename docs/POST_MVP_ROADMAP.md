# Post-MVP Roadmap

> **Purpose:** High-level roadmap for features beyond the functional MVP.
> **Prerequisite:** MVP complete (see `MVP_IMPLEMENTATION_PLAN.md`)
> **Last Updated:** 2024-12-15

---

## Current State

The MVP is **functional**. Users can authenticate with Trade Republic, sync their portfolio, and view holdings with real-time metrics.

---

## Next Milestones

### 1. Enhanced Visualizations (Near-term)

| Feature | Description | Priority |
|---------|-------------|----------|
| Dashboard Charts | Portfolio allocation pie chart, performance line chart | High |
| Metric Cards | Enhanced cards with sparklines and trends | Medium |
| Holdings Enhancements | Better filtering, grouping by sector/region | Medium |

### 2. Infrastructure (Near-term)

| Feature | Description | Priority | Dependency |
|---------|-------------|----------|------------|
| UV Dependency Migration | Convert to `pyproject.toml` + `uv.lock` for deterministic builds | **Critical** | Prerequisite for CI/CD |
| GitHub Actions CI/CD | Automated builds on push, `.dmg` artifacts | High | UV Migration |
| Code Signing | Apple Developer signing for Gatekeeper | Medium | CI/CD |
| Telemetry (opt-in) | Crash reporting via Cloudflare Worker | Low | CI/CD |

### 3. Data Enrichment (Medium-term)

| Feature | Description | Priority |
|---------|-------------|----------|
| Ticker Lookup | Enrich ISIN with ticker symbols (OpenFIGI/Yahoo) | Medium |
| Price Updates | Real-time or daily price refresh | Medium |
| Historical Performance | Track portfolio value over time | Medium |

### 4. Advanced Analytics (Future)

| Feature | Description | Priority |
|---------|-------------|----------|
| ETF X-Ray | Decompose ETF holdings to see underlying stocks | Low |
| Overlap Detection | Find duplicate holdings across ETFs | Low |
| Tax Lot Tracking | FIFO/LIFO cost basis calculations | Low |

### 5. Community Features (Future)

| Feature | Description | Priority |
|---------|-------------|----------|
| The Hive | Anonymous ISIN contribution to community database | Low |
| Shared Watchlists | Export/import portfolio templates | Low |

---

## Immediate Next Steps

1. **UV Migration:** Modernize Python dependency management (prerequisite for CI/CD)
2. **TASK-401:** Add dashboard metric cards with charts
3. **TASK-502:** Set up GitHub Actions for CI/CD (requires UV migration)
4. **Alpha Release:** Build and distribute `.dmg` to testers

---

## Backlog Items

See `keystone/specs/tasks.md` for detailed task tracking.

| Task | Status | Notes | Dependency |
|------|--------|-------|------------|
| **UV Migration** | Open | Critical prerequisite for CI/CD | None |
| TASK-401 | Open | Dashboard metric cards | None |
| TASK-402 | Backlog | Portfolio charts | TASK-401 |
| TASK-403 | Backlog | Enhanced holdings table | TASK-401 |
| TASK-501 | Backlog | PII scrubber verification | CI/CD |
| TASK-502 | Open | GitHub Actions CI/CD | UV Migration |
