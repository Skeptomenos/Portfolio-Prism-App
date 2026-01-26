# Architecture Standards (2026)

> **Mandate:** Modular, Isolated, Type-Safe.

## 1. The 3-Layer Pattern (Backend/CLI)
Strictly separate concerns. Dependencies flow **Down** (Layer 1 -> 2 -> 3).

1.  **Presentation (Input/Output):**
    - `controllers/`, `cli/`, `routes/`.
    - **Job:** Parse input, validate (Zod/Pydantic), call Service, format output.
    - ❌ **NO** business logic. ❌ **NO** database calls.
2.  **Service (Domain Logic):**
    - `services/`, `core/`.
    - **Job:** Business rules, calculations, decisions.
    - ✅ **Pure:** Receives Typed DTOs, returns Typed DTOs.
    - ❌ **NO** IO knowledge (doesn't know it's a CLI or Web App).
3.  **Data (Repository):**
    - `db/`, `repos/`, `external/`.
    - **Job:** SQL queries, API fetch, File IO.
    - ✅ **Only** layer allowed to touch `fs` or `fetch`.

## 2. Feature-Sliced Design (Frontend)
Group by **Feature**, not File Type.

```text
src/features/
  ├── auth/           # Feature Name
  │   ├── components/ # UI specific to Auth
  │   ├── api.ts      # Queries
  │   └── types.ts    # Zod Schemas
```
- **Shared UI:** `src/components/ui` (Buttons, Inputs).
- **Global Lib:** `src/lib` (Utils, Helpers).

## 3. Data Contracts
- **DTOs:** Define strict schemas (Zod/Pydantic) for ALL data moving between layers.
- **Mapping:** Map "Raw DB Rows" to "Clean Domain Objects" in the Repository layer.
