# Thinking Directives (First Principles & Design)

> **PROGRESSIVE DISCLOSURE:**
> This file guides problem decomposition BEFORE implementation.
> The root file (`AGENTS.md`) references this file for thinking tasks.
> Read this when:
> - Starting a new project or feature
> - Undertaking a major refactor
> - Facing a complex bug with unclear root cause
> - Assumptions have proven wrong during execution

---

## When to Use This File

| Scenario | Action |
|----------|--------|
| New app idea / greenfield project | Full process (T1 → T2 → T3 → T4) |
| New feature design | Full process (T1 → T2 → T3 → T4) |
| Major refactor | Phases T1 and T3 |
| Complex bug (root cause unclear) | Phase T1-RCA only |
| Returning from failed execution | Phase T1 (reassess fundamentals) |

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  THINKING: Problem → Understanding → Options → Handoff         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  T1 (Decompose) ──→ T2 (Empathize) ──→ T3 (Explore) ──→ T4 ──→ EXECUTION
│       │                                      │                  │
│       └──→ T1-RCA (Complex Bugs) ────────────┘                  │
│                                                                 │
│  T-RFL (Reflect) ←── Called from EXECUTION Phase 4 (Epilogue)  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase T1: Problem Decomposition (First Principles)

> **Goal:** Strip the problem to its fundamental truths before building anything.

### T1.1: Strip to Fundamentals

Ask these questions explicitly:

1. **What is the USER actually trying to accomplish?**
   - Not what they asked for, but their underlying goal
   - What would success look like from their perspective?

2. **What are the CORE ENTITIES?** (The Nouns)
   - What are the fundamental "things" in this domain?
   - What properties do they have?
   - How do they relate to each other?

3. **What are the CORE INTERACTIONS?** (The Verbs)
   - What actions can be performed?
   - What triggers these actions?
   - What are the outcomes?

4. **What are the CONSTRAINTS?** (The Physics)
   - What cannot be changed?
   - What are the hard limits (technical, business, legal)?

### T1.2: Challenge Assumptions

Before proceeding, explicitly challenge:

- **"Why does the user think they need this?"**
  - Is there a simpler way to achieve their goal?
  
- **"What existing solutions exist?"**
  - Why aren't they sufficient?
  - What can we learn from them?

- **"Are we copying patterns blindly?"**
  - Is this solution based on first principles or analogy?
  - Would we design it this way if starting fresh?

- **"What would we build if we started fresh with zero legacy constraints?"**
  - Ignore what exists today—what's the ideal?

### T1.3: Identify the "Physics"

Document the fundamental truths:

- **Invariants:** What must ALWAYS be true?
- **Trade-offs:** What tensions exist? (Speed vs accuracy, flexibility vs simplicity)
- **Failure modes:** What would break if we got this wrong?

> **THE ELIMINATION TEST (Required before T2):**
> 1. **Who requested this?** Name a person, not a department. If "assumed"—challenge it.
> 2. **What can be removed entirely?** Not simplified—removed. If nothing, you haven't pushed hard enough.
> 3. **Ruthless prioritization:** What is the MINIMAL problem worth solving? Everything else is cut until proven essential.

**Output:** Document findings in `anamnesis/specs/problem.md` using the template.

---

## Phase T1-RCA: Root Cause Analysis (For Complex Bugs)

> **Use when:** Bug is not obviously locatable, has returned after "fixes", spans multiple modules, or defies initial assumptions.

### T1-RCA.1: Define Expected vs Actual

| Aspect | Expected | Actual |
|--------|----------|--------|
| Behavior | [What SHOULD happen] | [What IS happening] |
| Data | [Expected values] | [Observed values] |
| Timing | [When it should occur] | [When it occurs] |

- **When did this start?** Isolate the change window.
- **Is it reproducible?** Under what conditions?

### T1-RCA.2: Trace the Data Path

Map the flow explicitly:

```
INPUT → [Transform 1] → [Transform 2] → ... → OUTPUT
         ↑                ↑
         Where could the contract be violated?
```

- What is the INPUT to the system?
- What TRANSFORMATIONS occur?
- Where does the OUTPUT diverge from expectation?

### T1-RCA.3: Challenge the Obvious

Ask explicitly:

- **Is the error message telling the truth?**
  - Error in Module A might be caused by Module B
  
- **Is this really a bug, or a misunderstanding?**
  - Could the behavior be "correct" per the actual (not assumed) spec?

- **Could this be caused by something UPSTREAM?**
  - Bad data? Race condition? External dependency?

### T1-RCA.4: Formulate Root Cause Hypothesis

State explicitly:

- **Hypothesis:** "The root cause is [X] because [evidence]"
- **Evidence FOR:** What supports this hypothesis?
- **Evidence AGAINST:** What would disprove it?
- **Test:** How can we validate this hypothesis?

### T1-RCA.5: Decide on Approach

| Approach | When to Use |
|----------|-------------|
| Fix root cause | Preferred. Sustainable solution. |
| Fix symptom + document debt | Root cause fix is too risky right now. |
| Escalate to user | Architectural issue discovered. Needs decision. |

**Output:** Proceed to `anamnesis/directives/EXECUTION.md` with validated hypothesis.

---

## Phase T2: User Understanding (Design Thinking)

> **Goal:** Ensure we're solving the right problem for the right user.

### T2.1: Empathize

Document explicitly:

- **Who is the user?**
  - Role, context, technical level
  
- **What is their current pain?**
  - How do they solve this today?
  - What frustrates them?

- **What does success look like?**
  - How will they know the problem is solved?
  - What would delight them?

### T2.2: Define the Problem

Craft a clear problem statement:

> **[User]** needs a way to **[action]** so that **[outcome]**, but currently **[obstacle]**.

Example:
> **A busy developer** needs a way to **track project context across AI sessions** so that **they don't lose progress**, but currently **each session starts fresh with no memory**.

**Anti-Goals:** Explicitly state what we are NOT solving.

**Output:** Document in `anamnesis/specs/problem.md`.

---

## Phase T3: Solution Exploration

> **Goal:** Generate and evaluate options before committing.

### T3.1: Generate Options

Propose 2-3 different approaches:

For each option, document:
- **Description:** How would this work?
- **Pros:** What's good about it?
- **Cons:** What's problematic?
- **Complexity:** Low / Medium / High
- **Risk:** Low / Medium / High

**Rule:** Do not evaluate while generating. First diverge, then converge.

### T3.2: Evaluate Against Constraints

For each option, check:

- [ ] Does it solve the CORE problem (from T1)?
- [ ] Does it fit USER needs (from T2)?
- [ ] Does it respect CONSTRAINTS (technical, business)?
- [ ] Is it the SIMPLEST solution that works?

### T3.3: Consensus Gate (CRITICAL)

**Before proceeding to execution:**

1. Present a summary to the user:
   - Problem definition
   - Options considered
   - Recommended approach
   - Trade-offs accepted
   - Assumptions made

2. Ask explicitly:
   > "Does this framing match your understanding? Should we proceed with this approach?"

3. **STOP** and await confirmation.

**Output:** Document chosen option in `anamnesis/specs/options.md`.

---

## Phase T4: Transition to Execution

> **Goal:** Hand off cleanly to execution phase.

### T4.1: Required Artifacts

Before coding, ensure these exist:
- `anamnesis/specs/problem.md` — User, pain, success criteria
- `anamnesis/specs/options.md` — Chosen approach, trade-offs
- `anamnesis/specs/requirements.md` — EARS syntax specs
- `anamnesis/specs/tech.md` — Stack, forbidden patterns

### T4.2: Task Generation (AI-Assisted)

> **Purpose:** Generate tasks from requirements with user approval.

**Process:**

1. **Extract Requirements:** Read `anamnesis/specs/requirements.md` and identify all "When... Then..." statements
2. **Generate Tasks:** Create one task per requirement or logical grouping
3. **Identify Dependencies:** Determine which tasks depend on others based on requirement relationships
4. **Assign Workstreams:** Group related tasks into workstreams if applicable
5. **Set Initial Status:** All new tasks start as `Backlog`
6. **Present for Approval:** Show generated task list to user

**Task Generation Template:**

```markdown
From REQ-XXX: "[requirement text]"

- [ ] **TASK-XXX:** [Derived task title]
    - **Dependencies:** [Identified dependencies or "None"]
    - **Status:** Backlog
    - **Workstream:** [workstream-name or "main"]
    - **Context/Constraints:** From REQ-XXX: [key constraint]
```

7. **User Approval Required:**
   > "I've generated [N] tasks from the requirements. Here's the proposed task list:
   > [task list]
   > Does this breakdown look correct? Should I adjust any tasks or dependencies?"

8. **STOP** and await user confirmation before writing to `anamnesis/specs/tasks.md`.

### T4.3: Transition Checklist

- [ ] Problem defined, assumptions validated, approach approved
- [ ] Specs created/updated
- [ ] Tasks generated and approved (see T4.2)
- [ ] Ready for `anamnesis/directives/EXECUTION.md`

### T4.4: The Handshake (MANDATORY STOP)

> **CRITICAL:** You cannot transition from Thinking to Execution in the same response.
> 1. Summarize the plan.
> 2. Ask "Ready to build?"
> 3. **STOP.** Wait for the user's explicit "Go".

**Next:** Read `anamnesis/directives/EXECUTION.md` to begin implementation.

---

## Phase T-RFL: Reflection (Epilogue Synthesis)

> **Use when:** Called from EXECUTION_DIRECTIVES Phase 4, after T3 completion, or at session end. This is reflective thinking, not mechanical documentation.

### T-RFL.1: Session Review

- What was the objective? Was it achieved?
- What worked? What didn't?
- What was surprising or unexpected?

### T-RFL.2: Pattern Extraction

Ask: "What ONE reusable insight emerged from this work?"

- **If pattern:** How can it be applied to future work?
- **If anti-pattern:** What caused it? How to prevent recurrence?

**Output:** Add to `anamnesis/PROJECT_LEARNINGS.md` using format:
```
### X.X. [Title]
- **Learning:** [What we discovered]
- **Mandate:** [What to do/not do going forward]
- **Outcome:** [How this changes behavior]
```

### T-RFL.3: Decision Distillation

If any of these occurred, formulate an ADR for `anamnesis/DECISION_LOG.md`:

- Dependency added or removed
- Schema or data structure changed
- Pattern or approach deprecated
- Significant trade-off made (chose X over Y with consequences)

### T-RFL.4: Handover Synthesis

Distill for the next agent (`anamnesis/.context/handover.md`):
- **Where are we?** (3 bullets max)
- **What's next?** (Concrete next steps)
