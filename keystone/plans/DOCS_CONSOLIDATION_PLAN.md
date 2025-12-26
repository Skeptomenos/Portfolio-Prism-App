# Documentation Consolidation Plan

> **Status:** Draft
> **Created:** 2025-12-26
> **Goal:** Reduce token consumption by 60%, eliminate duplication, update stale content

---

## Executive Summary

The `keystone/architecture/` and `keystone/strategy/` directories contain ~4,500 lines across 20 files with ~40% duplication and ~15% stale content. This plan consolidates to ~2,000 lines across 10-12 files.

**Expected Outcomes:**
- 60% reduction in AI agent token consumption
- Single source of truth for each topic
- All content current with actual implementation
- Consistent naming conventions

---

## Phase 0: Pre-Work (Safety)

### 0.1 Create Archive Directory
```bash
mkdir -p keystone/strategy/archive
mkdir -p keystone/architecture/archive
```

### 0.2 Git Checkpoint
```bash
git add -A && git commit -m "checkpoint: before docs consolidation"
```

---

## Phase 1: Archive Completed/Obsolete Files

These files document completed work or are superseded by other files.

| File | Reason | Action |
|------|--------|--------|
| `strategy/HIVE_EXTENSION_STRATEGY.md` | Phase 5 complete, legacy CSV removed | Move to `plans/archive/` |
| `strategy/HIVE_SCHEMA_OPTIONS.md` | Decision made, options no longer relevant | Move to `strategy/archive/` |
| `strategy/architecture_strategy.md` | Superseded by `architecture-overview.md` + `external-integrations.md` | Merge relevant parts, archive |
| `strategy/technical-components.md` | Outdated (references Streamlit as current) | Move to `strategy/archive/` |

### Tasks:
- [ ] **TASK-C01:** Move `HIVE_EXTENSION_STRATEGY.md` to `plans/archive/`
- [ ] **TASK-C02:** Move `HIVE_SCHEMA_OPTIONS.md` to `strategy/archive/`
- [ ] **TASK-C03:** Extract "Gatekeeper Proxy" section from `architecture_strategy.md` → merge into `external-integrations.md`, then archive
- [ ] **TASK-C04:** Move `technical-components.md` to `strategy/archive/`

---

## Phase 2: Consolidate Hive Documentation

**Problem:** 5 files cover Hive with massive overlap.

**Current Files:**
1. `architecture/HIVE_DATABASE_SCHEMA.md` (46 lines) - Schema only
2. `strategy/HIVE_ARCHITECTURE_STRATEGY.md` (88 lines) - Strategy + Schema
3. `strategy/HIVE_EXTENSION_STRATEGY.md` (566 lines) - Implementation plan (DONE)
4. `strategy/HIVE_SCHEMA_OPTIONS.md` (101 lines) - Options analysis (DECIDED)
5. `strategy/hive-architecture.md` (117 lines) - Strategy duplicate

**Target:** 2 files
1. `architecture/HIVE_DATABASE_SCHEMA.md` - **The Schema** (expanded)
2. `strategy/hive-architecture.md` - **The Strategy** (consolidated)

### Consolidation Map:

#### `architecture/HIVE_DATABASE_SCHEMA.md` (Target: ~100 lines)
Merge from:
- Current `HIVE_DATABASE_SCHEMA.md` (keep all)
- `HIVE_ARCHITECTURE_STRATEGY.md` Section 2.1 (Schema Diagram)
- `hive-architecture.md` Section 2 (Table Definitions)

Content:
1. High-Level Schema Diagram
2. Table Definitions (assets, listings, etf_holdings, aliases, contributions)
3. RPC Functions (contribute_asset, resolve_ticker, etc.)
4. Indexes and Constraints

#### `strategy/hive-architecture.md` (Target: ~150 lines)
Merge from:
- Current `hive-architecture.md` (keep Sections 1, 3, 4)
- `HIVE_ARCHITECTURE_STRATEGY.md` Sections 1, 3 (Problem, Trade-offs)

Content:
1. The Core Problem ("One Asset, Many Faces")
2. Why Normalized Schema (Decision Rationale)
3. Data Governance (Staleness, Stubs, Trust)
4. Scalability & Risks
5. Link to schema: "See `architecture/HIVE_DATABASE_SCHEMA.md`"

### Tasks:
- [ ] **TASK-C05:** Expand `architecture/HIVE_DATABASE_SCHEMA.md` with full schema details
- [ ] **TASK-C06:** Consolidate `strategy/hive-architecture.md` with strategy content
- [ ] **TASK-C07:** Delete `strategy/HIVE_ARCHITECTURE_STRATEGY.md` (merged)
- [ ] **TASK-C08:** Archive `strategy/HIVE_EXTENSION_STRATEGY.md` (completed work)
- [ ] **TASK-C09:** Archive `strategy/HIVE_SCHEMA_OPTIONS.md` (decision made)

---

## Phase 3: Fix Internal Duplication

### 3.1 `data-architecture.md` Cleanup

**Problem:** Contains duplicate sections:
- Lines 359-385 and 520-535: Duplicate "Phase Summary"
- Lines 408-421: Duplicate "Strategic Storage Mapping"
- Lines 424-453: Duplicate "SaaS Evolution Strategy"
- Lines 456-506: Duplicate "Data Governance & Lifecycle"
- Lines 509-535: Duplicate "Performance Optimization"

**Action:** Remove the second occurrence of each duplicated section (lines ~387-589).

- [ ] **TASK-C10:** Remove duplicate sections from `data-architecture.md` (target: 350 lines from 589)

### 3.2 `ui-ux-strategy.md` Cleanup

**Problem:** Contains THREE identical "Implementation Timeline" sections:
- Lines 225-248
- Lines 273-298
- (Partial at end)

**Action:** Keep only one Implementation Timeline section.

- [ ] **TASK-C11:** Remove duplicate Implementation Timeline from `ui-ux-strategy.md`

---

## Phase 4: Update Stale Content

### 4.1 Streamlit References

Search and update all files mentioning Streamlit as current UI.

**Files to Update:**
- `analytics-engine.md` - Line 68 mentions Streamlit
- `architecture-overview.md` - Line 68 mentions Streamlit
- `language-stack.md` - Multiple references

**Action:** Change "Streamlit" to "React (Streamlit deprecated)" or remove.

- [ ] **TASK-C12:** Update Streamlit references across all strategy files

### 4.2 Legacy CSV References

Search and update all files mentioning `asset_universe.csv` or `USE_LEGACY_CSV`.

**Files to Update:**
- `architecture_strategy.md` (being archived)
- `data-architecture.md` - Line 20-21
- `external-integrations.md` - If any

**Action:** Remove or mark as "Removed in 2025-12-26".

- [ ] **TASK-C13:** Update legacy CSV references across all files

### 4.3 Phase/Status Updates

Update phase statuses to reflect current reality:

| File | Section | Current | Should Be |
|------|---------|---------|-----------|
| `analytics-engine.md` | Phase 1 | "Weeks 1-4" | "Complete" |
| `build-system.md` | Phase 1 | "Immediate" | "Complete" |
| `data-architecture.md` | Phase 1 | "Current Focus" | "Complete" |
| `ui-ux-strategy.md` | Phase 1-3 | "Weeks 1-12" | "Complete" |

- [ ] **TASK-C14:** Update phase statuses to reflect completed work

---

## Phase 5: Rename for Consistency

All files should use `kebab-case.md`.

| Current | New |
|---------|-----|
| `architecture/APP_ARCHITECTURE_OVERVIEW.md` | `architecture/app-architecture-overview.md` |
| `architecture/ECHO_SENTINEL_ARCHITECTURE.md` | `architecture/echo-sentinel-architecture.md` |
| `architecture/HIVE_DATABASE_SCHEMA.md` | `architecture/hive-database-schema.md` |

- [ ] **TASK-C15:** Rename SCREAMING_CASE files to kebab-case

---

## Phase 6: Create Index Files

### 6.1 `architecture/INDEX.md`
```markdown
# Architecture Documentation

Quick reference to system architecture documents.

| Document | Purpose | When to Read |
|----------|---------|--------------|
| `app-architecture-overview.md` | Full-stack architecture | Session start, new features |
| `echo-sentinel-architecture.md` | Error reporting system | Telemetry work |
| `hive-database-schema.md` | Community database schema | Hive/Supabase work |
| `analytics-pipeline.md` | Python pipeline architecture | Pipeline changes |
```

### 6.2 `strategy/INDEX.md`
```markdown
# Strategy Documentation

Quick reference to strategic decision documents.

| Document | Purpose | When to Read |
|----------|---------|--------------|
| `architecture-overview.md` | Master architecture strategy | Session start |
| `hive-architecture.md` | Community database strategy | Hive decisions |
| `data-architecture.md` | Storage strategy | Data layer changes |
| `build-system.md` | Build pipeline strategy | Build changes |
| `external-integrations.md` | API integration strategy | Integration work |
| `language-stack.md` | Language decisions | Tech stack questions |
| `analytics-engine.md` | Pipeline strategy | Pipeline optimization |
| `application-shell.md` | Tauri shell strategy | Shell changes |
| `telemetry.md` | Observability strategy | Logging/telemetry |
| `testing.md` | Testing strategy | Test infrastructure |
| `ui-ux-strategy.md` | UI/UX strategy | Frontend work |
```

- [ ] **TASK-C16:** Create `architecture/INDEX.md`
- [ ] **TASK-C17:** Create `strategy/INDEX.md`

---

## Phase 7: Cross-Reference Cleanup

### 7.1 Remove Excessive "Also Read" Headers

Many files have 5+ "Also read" references at the top. Reduce to max 2 most relevant.

**Rule:** Only include "Also read" if the document is REQUIRED context, not just related.

- [ ] **TASK-C18:** Trim "Also read" sections to max 2 references per file

### 7.2 Update Internal Links

After renames and consolidation, update all internal links.

- [ ] **TASK-C19:** Update internal links after file renames

---

## Final File Structure

### `keystone/architecture/` (4 files)
```
architecture/
├── INDEX.md                      # Quick reference
├── app-architecture-overview.md  # Full-stack architecture
├── echo-sentinel-architecture.md # Error reporting
├── hive-database-schema.md       # Community DB schema
└── analytics-pipeline.md         # Python pipeline
```

### `keystone/strategy/` (11 files + archive)
```
strategy/
├── INDEX.md                  # Quick reference
├── architecture-overview.md  # Master strategy (AUTHORITATIVE)
├── hive-architecture.md      # Hive strategy
├── data-architecture.md      # Storage strategy
├── build-system.md           # Build pipeline
├── external-integrations.md  # API integrations
├── language-stack.md         # Language decisions
├── analytics-engine.md       # Pipeline strategy
├── application-shell.md      # Tauri shell
├── telemetry.md              # Observability
├── testing.md                # Testing strategy
├── ui-ux-strategy.md         # UI/UX strategy
└── archive/                  # Completed/superseded docs
    ├── HIVE_SCHEMA_OPTIONS.md
    ├── architecture_strategy.md
    └── technical-components.md
```

### `keystone/plans/archive/` (add)
```
plans/archive/
├── HIVE_EXTENSION_STRATEGY.md  # Completed implementation plan
└── ... (existing archived plans)
```

---

## Metrics

### Before
| Metric | Value |
|--------|-------|
| Total files | 20 |
| Total lines | ~4,500 |
| Duplicate content | ~40% |
| Stale content | ~15% |

### After (Target)
| Metric | Value |
|--------|-------|
| Total files | 15 (+ 4 archived) |
| Total lines | ~2,000 |
| Duplicate content | <5% |
| Stale content | 0% |

### Token Savings
- **Before:** ~15,000 tokens to read all docs
- **After:** ~6,000 tokens to read all docs
- **Savings:** 60%

---

## Task Summary

| Phase | Tasks | Priority |
|-------|-------|----------|
| Phase 0 | Pre-work | FIRST |
| Phase 1 | Archive 4 files | High |
| Phase 2 | Consolidate Hive (5 tasks) | High |
| Phase 3 | Fix duplication (2 tasks) | High |
| Phase 4 | Update stale content (3 tasks) | Medium |
| Phase 5 | Rename files (1 task) | Medium |
| Phase 6 | Create indexes (2 tasks) | Medium |
| Phase 7 | Cross-reference cleanup (2 tasks) | Low |

**Total Tasks:** 19

---

## Execution Order

1. **TASK-C01 to C04:** Archive obsolete files
2. **TASK-C10, C11:** Fix internal duplication (quick wins)
3. **TASK-C05 to C09:** Consolidate Hive docs
4. **TASK-C12 to C14:** Update stale content
5. **TASK-C15:** Rename files
6. **TASK-C16, C17:** Create indexes
7. **TASK-C18, C19:** Cross-reference cleanup

---

## Rollback Plan

If consolidation causes issues:
1. All original files preserved in `archive/` directories
2. Git history preserves all changes
3. Can restore any file with `git checkout HEAD~N -- path/to/file`

---

## Success Criteria

- [ ] All 19 tasks completed
- [ ] No duplicate content across files
- [ ] All Streamlit references updated
- [ ] All legacy CSV references removed
- [ ] All files use kebab-case naming
- [ ] INDEX.md files created for both directories
- [ ] Total line count < 2,500
- [ ] Zero broken internal links
