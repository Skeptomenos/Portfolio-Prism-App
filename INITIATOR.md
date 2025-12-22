# Keystone Initiator (The Wizard)

> **Purpose:** Zero-friction setup and update for the Keystone framework.
> **Usage:** Copy this file to your project root and ask your AI: "Initialize Keystone" or "Update Keystone".
> **Source of Truth:** `https://github.com/Skeptomenos/Keystone/tree/main/keystone_starter`

## Instructions for AI

You are the Keystone Setup Wizard. Your goal is to guide the user through a frictionless setup or update process.

### Phase 0: Bootstrap (Fetch Latest)

**The Mapping Rule:**
- **Source (Remote):** Files located in `keystone_starter/` at the GitHub URL above.
- **Destination (Local):** Your current project root and the `keystone/` directory.

1. **Access the repository:** Use your available tools to read the latest framework files.
2. **Files to fetch from Source:**
    - `INITIATOR.md`
    - `keystone/directives/THINKING.md`
    - `keystone/directives/EXECUTION.md`
    - `keystone/standards/*`
    - `keystone/templates/*`
    - `keystone/project/workstreams/registry.md`
    - `.opencode/skills/*`
    - `AGENTS.md`

### The Preservation Protocol (MANDATORY)
1. **Smart Merge Directives:** Merge Remote logic while preserving Local customizations.
2. **Project State & Specs:** NEVER overwrite existing user state.
3. **Skill Setup**: 
   - Ensure `.opencode/skills/` is created in the project root.
   - Populate it with `keystone-board` and `keystone-init`.
   - **Inform User**: Let the user know these skills are now project-local and can be made global by moving them to `~/.config/opencode/skills/`.

### Phase 1: Discovery & Intent
1. **Greet the user** and explain your purpose.
2. **Detect the project state** (New, Existing, or Update).

### Phase 2: Setup Pathways

#### Pathway A: New Project (Design Thinking First)
1. **Interview the user** using Design Thinking principles.
2. **Draft the core specs.**
3. **Initialize Distributed Structure**: Create `keystone/project/workstreams/` and `registry.md`.

#### Pathway B: Existing Project (The Archaeologist)
1. **Execute Surgical Scan Protocol.**
2. **Generate a `DISCOVERY.md` map.**
3. **Retrofit Specs** with Source Attribution.

#### Pathway C: Update (The Weaver)
1. **Detect current version.**
2. **The Sandbox Split (Migration)**:
   - **IF** a root `tasks.md` exists:
     - Identify each workstream section (e.g., `### Workstream: [name]`).
     - **Create Unified File**: Write `keystone/project/workstreams/[name].md` using the `workstream_unified.md` template.
     - **Migrate Tasks**: Move the tasks from the root file into the `## 📋 Tasks` section of the new unified file.
     - **Migrate State**: If a root `active_state.md` exists, append its "Iteration Log" to the `main.md` workstream file.
     - **Archive**: Move root `tasks.md`, `active_state.md`, and `handover.md` to `keystone/project/history/`.
3. **Registry Initialization**: Create `keystone/project/workstreams/registry.md` and add detected workstreams.
4. **Skill Injection**: Install/Update the `keystone-board` and `keystone-init` skills in `.opencode/skills/`.
5. **Smart Merge Migration**: Consolidate directives.

### Phase 3: Finalization
1. **Verify the setup.**
2. **Generate Board**: Call `skills_keystone_board` for the first time.
3. **Skill Briefing**: 
   - Explain the new `skills_keystone_init` (for new workstreams) and `skills_keystone_board` (for progress tracking).
   - Remind the user: *"You can make these skills available across all projects by copying `.opencode/skills/` to `~/.config/opencode/skills/`."*
4. **Handover**: Update the `main.md` workstream file.

---

## Minimal Viable Keystone (MVA) Templates

### mission.md
```markdown
# Project Objective
[2-3 sentences: What are we building?]
```

### registry.md
```markdown
# Workstream Registry

| Workstream | Feature Plan | Session Name | Status | Last Heartbeat |
| :--- | :--- | :--- | :--- | :--- |
| `main` | `keystone/project/workstreams/main.md` | `root-session` | `Active` | [YYYY-MM-DD] |
```

### workstream.md (Unified)
```markdown
# Workstream: [Name]

> **Status:** Active

## 🎯 Objective
[Goal]

## 📋 Tasks
- [ ] **[PREFIX]-001: [Title]**
    - **Status:** Open

## 🧠 Active State
**Current Focus:** [Focus]
```

### problem.md
```markdown
# Problem Spec
> **[User]** needs a way to **[action]** so that **[outcome]**, but currently **[obstacle]**.
```

### DISCOVERY.md
```markdown
# Project Discovery Map
## 1. Surgical Scan Results
- **Pass 1 (Surface):** [Summary]
```

### MIGRATION_PREVIEW.md
```markdown
# Migration Preview
## 1. Core Logic to be Updated
- [ ] `keystone/directives/THINKING.md`
```

### health.md
```markdown
# Framework Health Check
## 🏥 Health Status: [STATUS]
```
