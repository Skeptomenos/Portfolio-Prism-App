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
