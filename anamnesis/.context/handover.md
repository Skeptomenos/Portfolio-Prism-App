# Handover

> **Active Workstream:** `infrastructure`
> **Current Phase:** Phase 0 (Infrastructure & Migration)

---

## Where We Are
*   **Strategic Pivot:** We have officially shifted from a Streamlit-based POC to a **React-First MVP Strategy**.
*   **Foundation:** A comprehensive "Master Architecture" and detailed "Implementation Plan" have been created and committed.
*   **Safety Net:** The legacy Streamlit app is tagged (`legacy-streamlit-v1`) and the new plan is on `main`.

## Immediate Next Steps
1.  **Check out** branch `feat/react-foundation`.
2.  **Execute TASK-001:** Archive legacy dashboard code to `reference_dashboard`.
3.  **Execute TASK-003:** Scaffold the new React/Vite environment in `src/`.

## Critical Context
*   **Do Not Delete:** The old Python logic (`portfolio_src`) is the "Golden Master" for calculations. We refactor it, we don't trash it.
*   **Strangler Fig:** We are building the new system *alongside* the old logic.
*   **Throttling:** The new Python engine must be throttled (`Semaphore(5)`) to respect API limits.
