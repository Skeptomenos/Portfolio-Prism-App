# Hybrid Thinking Directives (First Principles & Structured Analysis)

> **Protocol Version:** 4.6.1

> **PROGRESSIVE DISCLOSURE:**
> This file guides problem decomposition BEFORE implementation using a hybrid approach that combines first-principles thinking with structured six-question analysis.
> The root file (`AGENTS.md`) references this file for thinking tasks.

---

## When to Use This File

| Scenario | Action |
|----------|--------|
| New app idea / greenfield project | Full process (Phase 1 → 2 → 3 → 4) |
| New feature design | Full process (Phase 1 → 2 → 3 → 4) |
| Major refactor | Phases 1 and 3 (Focus on fundamentals and risks) |
| Complex bug (root cause unclear) | Phase T1-RCA only |
| Returning from failed execution | Phase 1 (reassess fundamentals) |
| High-risk technical decision | Phases 1, 2, 3 (Skip user empathy if clear) |
| Requirement validation | Phases 2-3 (Focus on assumptions and risks) |

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  HYBRID THINKING: Fundamentals → Assumptions → Options → Handoff │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: Fundamentals ──→ Phase 2: Assumptions ──→ Phase 3: Risk & Options ──→ EXECUTION
│         │                              │                              │              │
│         └──→ T1-RCA (Complex Bugs) ─────┴──→ Validation & Consensus ─────┘              │
│                                                                 │
│  T-RFL (Reflect) ←── Called from EXECUTION Phase 4 (Epilogue)  │
└─────────────────────────────────────────────────────────────────┘
```

## The Six Core Questions

This hybrid approach integrates six fundamental questions throughout the phases:

1. **What are we actually trying to achieve?** (User + System goals)
2. **What are the fundamental components?** (Entities + Interactions)  
3. **What assumptions are we making?** (Explicit identification)
4. **How can we validate each assumption?** (Testability planning)
5. **What's the confidence level for each part?** (Quantified uncertainty)
6. **What are the risks?** (Structured assessment)

---

## Phase 1: Fundamentals (First Principles)

> **Goal:** Strip the problem to its fundamental truths before building anything.

### 1.1: Define Objectives & Components

Ask these questions explicitly:

1. **What are we actually trying to achieve?** (Q1)
2. **What are the fundamental components?** (Q2)
3. **What are the constraints?** (Part of Q6)

### 1.2: Identify Fundamental Truths

Document the core "physics" of the problem:

- **Invariants:** What must ALWAYS be true?
- **Failure Modes:** What would break if we got this wrong?

> **THE ELIMINATION TEST:**
> 1. **Who requested this?**
> 2. **What can be removed entirely?**
> 3. **Ruthless prioritization:** What is the MINIMAL problem worth solving?

---

## Phase 2: Assumption Analysis & Validation

> **Goal:** Identify, challenge, and validate all assumptions.

### 2.1: Identify All Assumptions (Q3)

### 2.2: Validation Planning (Q4)

### 2.3: Confidence Assessment (Q5)

---

## Phase 3: Risk Assessment & Solution Exploration

> **Goal:** Generate options, evaluate risks, and plan for parallel execution.

### 3.1: Comprehensive Risk Assessment (Q6)

### 3.2: Generate Solution Options

### 3.3: Delegation Planning (NEW)

> **Purpose:** Design the solution so it can be executed by parallel AI sessions.

1. **Modular Decomposition**: Can this feature be split into independent workstreams (e.g., API vs UI)?
2. **Contract Definition**: Define the strict interfaces (schemas, APIs) between workstreams.
3. **Dependency Mapping**: Identify which workstream must finish first.
4. **Prefix Assignment**: Assign unique prefixes for each workstream's tasks (e.g., `AUTH`, `UI`).

### 3.4: Consensus Gate (CRITICAL)

- **Present Comprehensive Summary**
- **STOP** and await confirmation.

---

## Phase 4: Validation & Handoff to Execution

### 4.1: Final Validation Checklist

### 4.2: Required Artifacts

### 4.3: Task Generation with Prefixes

- Create tasks in `keystone/specs/tasks.md` or directly in workstream folders.
- **MANDATORY**: Use the assigned prefix for all task IDs.

### 4.4: The Handshake (MANDATORY STOP)

---

## Phase T-RFL: Reflection & Learning Synthesis

### T-RFL.1: Six-Question Review
### T-RFL.2: Session Review
### T-RFL.3: Pattern Extraction
### T-RFL.4: Decision Distillation
### T-RFL.5: Handover Synthesis
