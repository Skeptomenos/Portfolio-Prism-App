# TypeScript Standards

> **Read this when:** Writing or reviewing TypeScript/JavaScript code.
> **Also read:** `global.md`

---

## Code Style & Formatting

*   **Typing:** Use **TypeScript** strict mode. Avoid `any` at all costs. Use `unknown` if necessary.
*   **Variables:** Prefer `const` over `let`. Never use `var`.
*   **Async:** Prefer `async/await` over raw `.then()` chains.
*   **Naming:**
    *   `camelCase` for variables and functions
    *   `PascalCase` for Classes, Components, and Interfaces

## Validation

*   Use `Zod` for strict schema validation of external inputs.

---

## React Patterns

### Global UI Elements
Components with `backdrop-filter` or `overflow` rules create new stacking contexts. Child modals get clipped.
- **Rule:** Mount global UI (Modals, Dialogs, Toasts) at `App.tsx` root
- **Manage via:** Global state (Zustand)

### Store Property Renames
Renaming store properties silently breaks components using `getState()`. TypeScript only catches errors in type-checked files.
- **Rule:** After renaming store properties, grep for old names across ALL `.tsx` files
