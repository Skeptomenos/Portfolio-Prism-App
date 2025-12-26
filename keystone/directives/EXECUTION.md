# Execution Directives (Build & Deliver)

> **Protocol Version:** 4.7.0

> **PROGRESSIVE DISCLOSURE:**
> This file guides implementation AFTER thinking is complete.
> The root file (`AGENTS.md`) references this file for execution tasks.

---

## When to Use This File

| Scenario | Action |
|----------|--------|
| Implementing a defined plan | Full process (Phase 0 → 4) |
| Simple bug fix | Phase 0, then Phase 2-4 |
| Continuing previous session | Phase 0 (load state), then resume |

## When to RETURN to Thinking

**Stop execution and read `keystone/directives/THINKING.md` when:**

- Fundamental assumption proven wrong
- Requirements conflict discovered
- Simpler approach becomes obvious
- User feedback invalidates the plan
- After 3+ failed debugging iterations (see OODA Stop-Gap)

---

## Universal Rules

> **THE GOLDEN RULE OF CONTINUITY:**
> You are part of a relay team. You are rarely the first and never the last.
> 1. **Start** by reading your workstream's `[name].md` file in `keystone/project/workstreams/`.
> 2. **Work** by updating the `## 🧠 Active State` section in that file when you complete a logical block of work.
> 3. **Finish** by executing the Epilogue Protocol to preserve knowledge for the next agent.
> **If you fail to update these files, your work is considered lost.**

> **THE TELEGRAPHIC RULE (INTERNAL CONTEXT):**
> When writing to `keystone/project/` files or `keystone/PROJECT_LEARNINGS.md`:
> - **Be extremely concise.** Sacrifice grammar for density.
> - **Use bullet points.** Avoid paragraphs.

> **THE DISTRIBUTED WORKSTREAM RULE (ISOLATION):**
> To support parallel AI sessions, Keystone uses a distributed task model.
> 1. **Ownership**: You own exactly ONE workstream file: `keystone/project/workstreams/[name].md`.
> 2. **Write Access**: You are strictly forbidden from editing workstream files in other directories.
> 3. **Identity Anchor**: At session start, identify your workstream from `registry.md` or ask the user.
> 4. **Prefixed IDs**: For NEW tasks, use your workstream name as a prefix (e.g., `AUTH-001`) to prevent global ID collisions.

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  EXECUTION: Context → Plan → Build → Verify → Deliver          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4       │
│  (Context)   (Plan)      (Build)     (Verify)   (Epilogue)     │
│     │           │           │                       │           │
│     │           │           └── OODA Loop ──────────┤           │
│     │           │               (if stuck)          │           │
│     │     └───────────┴─── Return to THINKING ←───────────┘           │
│                      (if fundamentals wrong)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Context & State Management (THE BRAIN)

### 0.1: Initialization (Context & Environment)

- **Environment Check:** Verify your surroundings (`ls -F`, `git status`).
- **Identify Identity:** 
    - Read `keystone/project/workstreams/registry.md`.
    - If multiple workstreams are active, ask: *"Which workstream is this session focused on?"*
    - Once identified, read the local `[name].md` file in `keystone/project/workstreams/`.
- **Check Constraints:** Read `keystone/PROJECT_LEARNINGS.md`.
- **Generate Board:** Call `skills_keystone_board` to see the global project status.

### 0.2: Spec Check

- **For NEW features/projects:** Ensure `keystone/directives/THINKING.md` was followed first.
- **Load existing specs** from `keystone/specs/` or the `Driving Plan` linked in your workstream file.

---

## Phase 1: Specification & Planning (THE BLUEPRINT)

### 1.1: Recursive Decomposition (The Knife)

- **Decompose:** Break complex requests down into **Atomic Units** in your workstream file under `## 📋 Tasks`.
- **Prefixed IDs**: Use your workstream prefix for all new tasks.
- **Task Lifecycle Dates**:
    - **Created**: Set to current date (`YYYY-MM-DD`) when task is first added.
    - **Started**: Set to current date when work begins (Status: `In Progress`).
    - **Completed**: Set to current date when task is finished (Status: `Done`).
- **AI Fallback**: If you don't know the current date, ask the user: *"What is today's date for task tracking?"*

### 1.2: The Consensus Gate (CRITICAL)

- **Rule:** Before writing code, you must **Present a Plan Summary** in the chat.
- **STOP** and await user confirmation.

---

## Phase 2: Build & Implement (THE STOP-AND-WAIT)

### 2.1: The Protocol

1. **Read** your workstream file. Identify the next **OPEN** task.
2. **Implement** ONLY that single task.
3. **Verify** (Unit Test / Manual Check).
4. **Mark** as `[x]` and update Status to `Done`.
5. **Update Board**: Call `skills_keystone_board` to reflect changes globally.
6. **STOP** to plan the next step or Proceed if clear.

---

## Phase 3: Verify & Secure (TWO-TIERED)

### 3.1: Drift Detection (Reverse-Sync)

- **Check:** Does the implemented code contradict `keystone/specs/requirements.md`?
- **Action:** Fix Code or Update Spec.

---

## Phase 4: Delivery & Epilogue (DEFINITION OF DONE)

> **EPILOGUE IS MANDATORY.**

### 4.1: Documentation Sync

- [ ] **Spec Check:** Ensure `keystone/specs/*` reflect reality.
- [ ] **Changelog (MANDATORY):** Update `CHANGELOG.md` with all changes from this session. **CRITICAL: Always append new entries to the top (under the header), never overwrite existing history.** No commit without a corresponding changelog entry.
- [ ] **Decision Record:** Update `keystone/DECISION_LOG.md`.

### 4.2: Reflective Learning (T-RFL)

- [ ] **Engage T-RFL:** Read `keystone/directives/THINKING.md` Phase T-RFL.
- [ ] **Commit:** Update `keystone/PROJECT_LEARNINGS.md`.

### 4.3: Archival Rotation

- [ ] **Archive Completed Tasks**: Move `Done` tasks to the `Archive` section in your workstream file.
- [ ] **Logging Audit**: Run `skills_keystone_log_audit` on modified files to enforce standards.
- [ ] **Update Board**: Call `skills_keystone_board`.
- [ ] **Handover**: Update your workstream file -> `## 💾 Context for Resume`.
- [ ] **Registry**: Update your status to `Paused` or `Done` in `registry.md`.

---

## User Commands

| Command | Action |
|---------|--------|
| "Create workstream [name]" | Call `skills_keystone_init` to scaffold a new workstream |
| "Generate board" | Call `skills_keystone_board` |
| "Next task" | Identify and start the next `Open` task in active workstream |
| "Switch to [workstream]" | Change active workstream focus |
| "Archive done tasks" | Move all `Done` tasks to Archive section |
