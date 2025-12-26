# Proposal: PROJECT_LEARNINGS.md Restructure

> **Author:** AI Session (2025-12-26)
> **Status:** Draft
> **Target:** Keystone Framework (upstream)

---

## Problem Statement

The current `PROJECT_LEARNINGS.md` template in Keystone serves multiple purposes:

1. **Constraints** — Invariants that break the product if violated
2. **Patterns** — How things work (architecture)
3. **Anti-Patterns** — What to avoid
4. **Technical Notes** — Implementation details
5. **Session Learnings** — Historical context

This leads to:
- **Token bloat**: AI agents read the entire file every session
- **Duplication**: Content often duplicates specs, standards, or strategy docs
- **Unclear priority**: Constraints buried among historical notes

---

## Proposed Structure

Replace the current 5-section structure with a **constraints-focused** format (~40 lines):

```markdown
# Project Constraints

> Invariants. Violating these breaks the product.

## Bundle
- Target: <150MB total
- PyInstaller binary: <100MB

## Security
- API keys NEVER in client
- External APIs via Cloudflare Worker proxy only

## Architecture
- Local-first: SQLite in `~/Library/Application Support/[AppName]/`
- Sidecar: Python headless worker (stdin/stdout JSON IPC)
- UI: [Framework] only

## [Domain-Specific] (e.g., Hive/Supabase)
- All writes via RPC functions (SECURITY DEFINER)
- Batch network calls; skip tier2 holdings

## Anti-Patterns (Forbidden)
- Hardcoded ports -> Use stdin/stdout IPC
- Blocking I/O in UI -> Background processing only
- [Legacy format] as primary DB -> [Current format] is SSOT
- print() in backend -> logger only
```

---

## Rationale

| Current | Proposed | Benefit |
|---------|----------|---------|
| ~100+ lines | ~40 lines | 60% token reduction |
| 5 sections | 2 sections (Constraints + Anti-Patterns) | Clearer priority |
| Historical notes inline | Move to `DECISION_LOG.md` | Separation of concerns |
| Patterns duplicated | Reference `strategy/` docs | Single source of truth |
| Technical notes duplicated | Reference `specs/` docs | No duplication |

---

## Migration Path

1. **Constraints** (Section 1) → Keep, condense to bullet points
2. **Patterns** (Section 2) → Move to `strategy/architecture-overview.md`
3. **Anti-Patterns** (Section 3) → Keep, condense to one-liners
4. **Technical Notes** (Section 4) → Already migrated to `specs/`
5. **Session Learnings** (Section 5) → Move to `DECISION_LOG.md` or archive

---

## Template for Keystone

```markdown
# Project Constraints

> Invariants. Violating these breaks the product.
> For patterns and architecture, see `keystone/strategy/`.
> For historical decisions, see `keystone/DECISION_LOG.md`.

## [Category 1]
- Constraint 1
- Constraint 2

## [Category 2]
- Constraint 3

## Anti-Patterns (Forbidden)
- [Bad thing] -> [Good alternative]
- [Bad thing] -> [Good alternative]
```

---

## Request

If this proposal is accepted:
1. Update `keystone/templates/PROJECT_LEARNINGS.md` in the upstream Keystone repo
2. Add migration guidance for existing projects
3. Consider renaming to `CONSTRAINTS.md` for clarity

---

## Appendix: Token Analysis

| File | Current Lines | Proposed Lines | Savings |
|------|---------------|----------------|---------|
| PROJECT_LEARNINGS.md | 98 | ~40 | 59% |
| + strategy/architecture-overview.md | (patterns moved here) | +20 | Net neutral |
| + DECISION_LOG.md | (history moved here) | +10 | Net neutral |

**Net effect**: Same information, better organized, 59% smaller hot-path file.
