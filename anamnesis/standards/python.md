# Python Standards

> **Read this when:** Writing or reviewing Python code.
> **Also read:** `global.md`

---

## Code Style & Formatting

*   **Style:** Follow **PEP 8**.
*   **Typing:** Use **Type Hints** (`typing` module) for all function signatures.
    *   *Example:* `def process(data: dict[str, Any]) -> list[int]:`
*   **Imports:** Use absolute imports (`from project.module import x`) over relative imports (`from ..module import x`) for clarity.
*   **Naming:**
    *   `snake_case` for functions and variables
    *   `PascalCase` for Classes
    *   `UPPER_CASE` for constants

## Validation

*   Use `Pydantic` for strict schema validation of external inputs.

## Environment

*   Load secrets from environment variables using `os.getenv` or `python-dotenv`.
