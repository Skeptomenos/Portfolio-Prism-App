# Execution Directives (Build & Deliver)

> **PROGRESSIVE DISCLOSURE:**
> This file guides implementation AFTER thinking is complete.
> The root file (`AGENTS.md`) references this file for execution tasks.
> Read this when:
> - Implementing a plan from THINKING.md
> - Simple to moderate bug fixes
> - Following existing specifications
> - Continuing work from a previous session

---

## When to Use This File

| Scenario | Action |
|----------|--------|
| Implementing a defined plan | Full process (Phase 0 → 4) |
| Simple bug fix | Phase 0, then Phase 2-4 |
| Continuing previous session | Phase 0 (load state), then resume |

## When to RETURN to Thinking

**Stop execution and read `anamnesis/directives/THINKING.md` when:**

- Fundamental assumption proven wrong
- Requirements conflict discovered
- Simpler approach becomes obvious
- User feedback invalidates the plan
- After 3+ failed debugging iterations (see OODA Stop-Gap)

---

## Universal Rules

> **THE GOLDEN RULE OF CONTINUITY:**
> You are part of a relay team. You are rarely the first and never the last.
> 1. **Start** by reading `anamnesis/.context/active_state.md` and `anamnesis/.context/handover.md`.
> 2. **Work** by updating `anamnesis/.context/active_state.md` when you complete a logical block of work.
> 3. **Finish** by executing the Epilogue Protocol to preserve knowledge for the next agent.
> **If you fail to update these files, your work is considered lost.**

> **THE TELEGRAPHIC RULE (INTERNAL CONTEXT):**
> When writing to `anamnesis/.context/` files or `anamnesis/PROJECT_LEARNINGS.md`:
> - **Be extremely concise.** Sacrifice grammar for density (e.g., "Server crashed. Retry failed." > "The server appears to have crashed...").
> - **Use bullet points.** Avoid paragraphs.
> - **Exceptions:** Maintain professional, complete sentences for **Code Docstrings** and **User-Facing Docs** (README, CHANGELOG) and **Specs** (requirements.md).

> **THE "AD-HOC" ESCAPE HATCH:**
> IF the user request is a simple question, a read-only query, or a task that does NOT modify the codebase (e.g., "How do I run this?", "List files in S3", "Explain this function"):
> - **SKIP** Phases 0, 1, 2, 3, 4.
> - **ACT** immediately. Do not generate state files. Do not archive. Just answer.

---

## Phase 0: Context & State Management (THE BRAIN)

This phase ensures continuity and learning across sessions.

### 0.1: Initialization (Context & Environment)

- **Environment Check:** Verify your surroundings.
    - Run `ls -F` to see immediate context.
    - Run `git status` to ensure a clean slate (or understand current diffs).
- **Check State:** Read `anamnesis/.context/active_state.md`.
    - *Scenario A (Empty):* Read `anamnesis/.context/handover.md` (if exists) to get context. Initialize `anamnesis/.context/active_state.md` using the **Template** from `anamnesis/templates/active_state.md`.
    - *Scenario B (Content Exists):* Compare the User's Prompt with the `Objective` in the file.
        - **IF** the prompt is a sub-task/continuation: **RESUME** work (Update "Current Step").
        - **IF** the prompt is a NEW, unrelated objective: **ARCHIVE** the old state (move to `anamnesis/.context/history/`) and **RESET** `anamnesis/.context/active_state.md` with the new Objective.
- **Check Constraints:** Read `anamnesis/PROJECT_LEARNINGS.md`.
    - **IF EMPTY:** Log "No prior constraints found" in your state.
    - **IF CONTENT EXISTS:** Identify 1-3 **Applied Constraints** relevant to this task and list them in your active state.

### 0.2: Spec Check

- **For NEW features/projects:** Ensure `anamnesis/directives/THINKING.md` was followed first. Check that `anamnesis/specs/problem.md` and `anamnesis/specs/options.md` exist.
- **For implementation:** Load existing specs from `anamnesis/specs/`.
    - Read `product.md` (Why) and `tech.md` (Constraints) to load the "System Constraints".
    - **IF MISSING:** Suggest creating specs in `anamnesis/specs/`.

**Template for `anamnesis/.context/active_state.md`:**

See `anamnesis/templates/active_state.md` for the full template. Key sections:
- **Current Objective** — What we're building (references `anamnesis/.context/mission.md`)
- **Iteration Log** — Significant experiments and learnings
- **Pre-Close Checklist** — Quality gate before closing work

### 0.3: State Maintenance (The Heartbeat)

- **Update Strategy:** You must update `anamnesis/.context/active_state.md` **at the end of every logical block of work** (e.g., after planning, after coding a module, after testing).
- **No Duplication Rule:** Do not copy the full task list from `anamnesis/specs/tasks.md` into `active_state.md`. Use `active_state.md` for **High-Level Goals** and **Learnings/Errors**. The `tasks.md` file is the Source of Truth for execution status.
- **Batching:** You may perform multiple related actions (edit 3 files) before updating the state, but you **MUST** update it before asking the user for input or ending your turn.
- **Style:** Use **Telegraphic Style**. Maximize info/token.

### 0.4: The OODA Loop (Debugging Protocol)

When an action fails, **DO NOT** guess.

1. **Observe:** Gather evidence (screenshot, HTML source, error trace) via shell commands (`ls`, `grep`) or file reads.
2. **Orient:** State explicitly in `anamnesis/.context/active_state.md` why your mental model was wrong based on the evidence.
3. **Decide:** Formulate a single, testable hypothesis.
4. **Act:** Implement the minimal change to test that hypothesis.

#### OODA Stop-Gap (Confidence Check)

**After 3 failed iterations of the OODA loop:**

1. **STOP** and assess your confidence level (0-100%)
2. State explicitly: *"I am X% confident I'm on the right track because [reason]"*
3. Take action based on confidence:

| Confidence | Action |
|------------|--------|
| < 50% | **Return to Thinking.** Read `anamnesis/directives/THINKING.md` Phase T1-RCA. Reassess fundamentals. |
| 50-80% | **Consult User.** Present your hypothesis and ask for guidance or additional context. |
| > 80% | **Continue** with explicit justification for why you believe the next attempt will succeed. |

---

## Phase 1: Specification & Planning (THE BLUEPRINT)

Do not plan the solution until you have deconstructed the problem.

### 1.1: The Spec Loop

- **For NEW work:** Verify thinking phase is complete. Check for `anamnesis/specs/problem.md` and `anamnesis/specs/options.md`.
- **Artifacts:**
    - `problem.md`: The problem definition, assumptions, constraints.
    - `options.md`: Solution alternatives considered.
    - `product.md`: The User Persona, Anti-Goals, and "Vibe".
    - `tech.md`: The Stack, Forbidden Libraries, and Version Pins.
    - `requirements.md`: Logic defined in **EARS Syntax** (When... Then...).
    - `design.md`: **Mermaid Diagrams** for flows (Sequence/State).
    - `tasks.md`: Atomic checklist.
- **Action:** If specs are missing/outdated, Update them FIRST.
- **Pragmatism:** Do not over-engineer. Use specs to capture *decisions*. If a file (e.g., `design.md`) adds no value for a simple task, skip it.

### 1.2: Recursive Decomposition (The Knife)

- **Decompose:** Break complex requests down into **Atomic Units** in `anamnesis/specs/tasks.md`.
- **Granularity:** Each task must be < 1 hour execution.
- **Inline Constraints:** Do not just link to specs. **Copy** the relevant constraints into the task.
    - *Bad:* "Implement Login (see tech.md)"
    - *Good:* "Implement Login. **Constraint:** Use Zod for validation (from tech.md)."

### 1.3: Modularity (The Box)

- **Group:** Organize Atomic Units into logical **Modules**.
- **Interface:** Define strict **Data Contracts** (Interfaces/Schemas) between modules.
- **Constraint:** High Cohesion (related things stay together) and Low Coupling (modules rarely touch).

### 1.4: Radical Simplicity (The Filter)

- **Buy vs. Build:** Before implementing an Atom, check if a Standard Library or approved dependency solves it.
- **Tool Preference:** Do not write a Python script to do what a standard shell command (`grep`, `find`, `sed`) can do in one line.
- **Implementation:** Use the most readable, standard solution. **Complexity is a failure of decomposition.**

### 1.5: The Consensus Gate (CRITICAL)

- **Rule:** Before writing code or finalizing spec files, you must **Present a Plan Summary** in the chat.
- **Action:**
    1. Draft the plan/specs internally.
    2. Output a **Text Summary** of the approach, key requirements, and task list to the user.
    3. Ask: *"Does this plan align with your goals?"*
    4. **STOP** and await user confirmation.

---

> **OPERATIONAL MANDATES:** For reliability rules (I/O Fortress, Clean Slate, Hybrid First, Preservation of Knowledge), see `anamnesis/standards/global.md` Section 9.

---

## Phase 2: Build & Implement (THE STOP-AND-WAIT)

### 2.1: The Protocol

1. **Read** `anamnesis/specs/tasks.md`. Identify the next **PENDING** task.
2. **Implement** ONLY that single task.
3. **Verify** (Unit Test / Manual Check).
4. **Mark** as `[x]` in `anamnesis/specs/tasks.md`.
5. **Update** `anamnesis/.context/active_state.md` **ONLY** if there are new Learnings, Errors, or a Phase Change.
6. **STOP** to plan the next step or Proceed if clear.

### 2.2: Construction Order (Atoms First)

- **Atoms First:** Implement the Atomic Units (Pure Logic) first.
- **Verify Early:** Write unit tests for Atoms immediately. You are testing math/logic, not side effects.
- **Orchestration Last:** Only write the "Glue Code" (Scripts/Controllers) after the building blocks are proven solid.

### 2.3: Strict Logic/IO Separation

- **Pure Logic:** Core calculations must never touch the network, disk, or database.
- **I/O Edge:** Push all side effects to the boundaries (Adapters/Services).
- **Benefit:** This makes the core logic 100% testable without mocks.

### 2.4: Persistence & Safety

- **Data Integrity:** Any change to a persistent data structure (DB Schema, File Format, API Response) requires a **Migration Strategy** (Backward Compatibility).
- **Safety Toggles:** Wrap any high-risk logic (e.g., bulk deletions, new critical paths) in a Feature Flag or Configuration Switch.

---

## Phase 3: Verify & Secure (TWO-TIERED)

### 3.1: Unit Tests (The Microscope)

- Test Atomic Units in isolation.
- Mock all external dependencies.

### 3.2: Contract Tests (The Handshake)

- Validate data consistency at the boundaries.
- **Definition:** Assert that the Output of Module A matches the expected Input Schema of Module B (e.g., check column names, data types, and non-null constraints using libraries like **Pydantic**, **Pandas Schema**, or **JSON Schema**).
- **Fail Fast:** Validate inputs at the entry point of every module.

### 3.3: Drift Detection (Reverse-Sync)

- **Check:** Does the implemented code contradict `anamnesis/specs/requirements.md`?
- **Action:**
    - *If Code is Wrong:* Fix Code.
    - *If Spec is Wrong (Justified):* **Update `anamnesis/specs/requirements.md`** to match reality.

---

## Phase 4: Delivery & Epilogue (DEFINITION OF DONE)

> **EPILOGUE IS MANDATORY:** This phase is NOT optional cleanup. It includes reflective thinking (see `anamnesis/directives/THINKING.md` Phase T-RFL) to extract genuine insights. Skipping Epilogue means the work is incomplete.

You are **NOT** done until you have executed this sequence:

### 4.1: Documentation Sync

- [ ] **Spec Check:** Ensure `anamnesis/specs/*` reflect the final codebase
- [ ] **User Facing:** Update `CHANGELOG.md` if features changed (professional tone)
- [ ] **Decision Record:** If dependency/schema/deprecation/**significant trade-off** occurred → `anamnesis/DECISION_LOG.md`
- [ ] **Code Facing:** Ensure docstrings match code reality

### 4.2: Reflective Learning (T-RFL)

- [ ] **Engage T-RFL:** Read `anamnesis/directives/THINKING.md` Phase T-RFL
- [ ] **Reflect:** What worked? What didn't? What surprised?
- [ ] **Extract:** Identify ONE reusable pattern or anti-pattern
- [ ] **Commit:** Update `anamnesis/PROJECT_LEARNINGS.md` (Learning/Mandate/Outcome format, telegraphic)

### 4.3: Archival Rotation

- [ ] **Archive:** Move `anamnesis/.context/active_state.md` to `anamnesis/.context/history/YYYY-MM-DD_TaskName.md`
- [ ] **Handover:** Update `anamnesis/.context/handover.md` — Where are we? What's next? (3 bullets max)
