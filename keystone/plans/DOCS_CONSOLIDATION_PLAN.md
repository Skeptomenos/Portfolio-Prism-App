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

---

## Critical Risk Assessment

### Content Loss Risk Analysis

| File to Archive | Unique Valuable Content | Risk | Mitigation |
|-----------------|------------------------|------|------------|
| `HIVE_EXTENSION_STRATEGY.md` | **Decision Log (lines 519-538)** - 15 dated decisions with rationale | **MEDIUM** | Extract Decision Log to `DECISION_LOG.md` before archiving |
| `HIVE_EXTENSION_STRATEGY.md` | **Files to Modify table** - Implementation checklist | **LOW** | Work is done, checklist no longer needed |
| `HIVE_EXTENSION_STRATEGY.md` | **Success Criteria** - Metrics targets | **LOW** | Already achieved, can reference in retrospective |
| `HIVE_SCHEMA_OPTIONS.md` | **Options analysis** - Why we chose normalized schema | **LOW** | Already captured in `hive-architecture.md` |
| `architecture_strategy.md` | **Gatekeeper Proxy diagram** - Mermaid sequence diagram | **MEDIUM** | Merge into `external-integrations.md` before archiving |
| `technical-components.md` | **Component flexibility ratings** - Assessment framework | **MEDIUM** | Framework is useful but content is stale; update and keep OR archive with note |

### High-Value Content at Risk (MUST PRESERVE)

1. **Decision Log from `HIVE_EXTENSION_STRATEGY.md`** (lines 519-538)
   - Contains 15 architectural decisions with dates and rationale
   - **Action:** Append to `keystone/DECISION_LOG.md` before archiving

2. **Gatekeeper Proxy Pattern from `architecture_strategy.md`**
   - Mermaid diagram showing API key protection flow
   - **Action:** Merge into `external-integrations.md` Section 1

3. **Component Flexibility Framework from `technical-components.md`**
   - Useful assessment methodology (HIGH/MEDIUM/LOW flexibility)
   - **Action:** Consider updating and keeping, OR archive with clear note that methodology is valuable

---

## Complexity Assessment

### Will AI Agents Follow the New Structure?

| Concern | Assessment | Mitigation |
|---------|------------|------------|
| **Fewer files = harder to find specific info** | LOW RISK | INDEX.md files provide clear navigation |
| **Merged content = longer files** | LOW RISK | Files stay under 200 lines each; still scannable |
| **Archive folder = confusion about what's current** | MEDIUM RISK | Clear naming: `archive/` folder, files marked with "ARCHIVED" header |
| **Renamed files = broken mental models** | LOW RISK | kebab-case is standard; SCREAMING_CASE was the anomaly |
| **Cross-references break** | MEDIUM RISK | Phase 7 explicitly updates all internal links |

### AI Agent Readability Improvements

| Before | After | Improvement |
|--------|-------|-------------|
| 5 Hive files, unclear which is authoritative | 2 files: schema + strategy | Clear separation of concerns |
| Duplicate sections in same file | Single occurrence of each section | No confusion about which version is correct |
| Mixed naming conventions | Consistent kebab-case | Predictable file discovery |
| No index files | INDEX.md in each directory | Quick orientation for new sessions |
| Stale Streamlit references | Updated to React | Accurate current state |

---

## Effort, Risk, and Confidence Assessment

### Per-Phase Assessment

| Phase | Effort | Risk | Confidence | Notes |
|-------|--------|------|------------|-------|
| **Phase 0: Pre-Work** | 5 min | None | 100% | Git checkpoint is trivial |
| **Phase 1: Archive Files** | 15 min | LOW | 95% | Simple moves, git preserves history |
| **Phase 2: Consolidate Hive** | 45 min | MEDIUM | 80% | Merging requires careful content selection |
| **Phase 3: Fix Duplication** | 20 min | LOW | 95% | Mechanical deletion of duplicate sections |
| **Phase 4: Update Stale Content** | 30 min | LOW | 90% | Search-and-replace with verification |
| **Phase 5: Rename Files** | 10 min | LOW | 95% | `git mv` handles cleanly |
| **Phase 6: Create Indexes** | 15 min | None | 100% | New files, no risk |
| **Phase 7: Cross-References** | 30 min | MEDIUM | 85% | Must verify all links work |

### Overall Assessment

| Metric | Value |
|--------|-------|
| **Total Effort** | ~3 hours |
| **Overall Risk** | LOW-MEDIUM |
| **Confidence in Success** | 85% |
| **Confidence in Token Savings** | 90% (60% reduction achievable) |
| **Confidence in AI Readability** | 90% (clearer structure) |

### Risk Breakdown

| Risk Level | Count | Items |
|------------|-------|-------|
| **HIGH** | 0 | None |
| **MEDIUM** | 3 | Hive consolidation, Decision Log preservation, Cross-reference updates |
| **LOW** | 16 | All other tasks |

---

## Revised Recommendations

### Before Executing: Add These Safeguards

1. **TASK-C00 (NEW):** Extract Decision Log from `HIVE_EXTENSION_STRATEGY.md` → append to `DECISION_LOG.md`
2. **TASK-C03 (REVISED):** Extract Gatekeeper Proxy section → merge into `external-integrations.md` BEFORE archiving
3. **TASK-C04 (REVISED):** Add "ARCHIVED - See current docs" header to `technical-components.md` instead of silent archive

### Consider NOT Doing

| Task | Reconsider? | Reason |
|------|-------------|--------|
| **Phase 5: Rename files** | Maybe defer | Low value, some risk of breaking external references |
| **Phase 7.1: Trim "Also read"** | Maybe skip | Low impact, some value in cross-references |

### Definitely Do

| Task | Why Critical |
|------|--------------|
| **Phase 1: Archive obsolete** | Removes confusion about what's current |
| **Phase 2: Consolidate Hive** | Biggest token savings, clearest win |
| **Phase 3: Fix duplication** | Removes literal copy-paste errors |
| **Phase 4: Update stale** | Prevents AI from giving wrong advice |
| **Phase 6: Create indexes** | Huge discoverability improvement |

---

## Final Verdict

| Question | Answer |
|----------|--------|
| **Are we risking losing valuable content?** | **MEDIUM RISK** - Decision Log and Gatekeeper Proxy must be preserved. Added TASK-C00 to address. |
| **Are we making things more complicated?** | **NO** - Fewer files, clearer structure, better indexes. Complexity decreases. |
| **Will AI be able to follow the new structure?** | **YES (90% confidence)** - INDEX.md files, consistent naming, and single source of truth per topic will improve AI navigation. |
| **Is the effort worth it?** | **YES** - 3 hours of work for 60% ongoing token savings and clearer documentation. |

### Go/No-Go Recommendation

**GO** - with the following conditions:
1. Execute TASK-C00 first (preserve Decision Log)
2. Verify Gatekeeper Proxy content is merged before archiving
3. Consider deferring Phase 5 (renames) to a separate PR if time-constrained
4. Run link verification after Phase 7
