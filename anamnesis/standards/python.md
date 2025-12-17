# Python Standards

> **Read this when:** Writing or reviewing Python code.
> **Also read:** `global.md`

---

## Code Style & Formatting

- **Style:** Follow **PEP 8**.
- **Typing:** Use **Type Hints** (`typing` module) for all function signatures.
  - _Example:_ `def process(data: dict[str, Any]) -> list[int]:`
- **Imports:** STRICTLY use absolute imports rooted at `portfolio_src` (e.g. `from portfolio_src.data import ...`). Do NOT use relative imports (e.g. `from ..data`). Do NOT use implicit top-level imports that rely on `sys.path` hacks.
- **Naming:**
  - `snake_case` for functions and variables
  - `PascalCase` for Classes
  - `UPPER_CASE` for constants

## Validation

- Use `Pydantic` for strict schema validation of external inputs.

## Environment

- Load secrets from environment variables using `os.getenv` or `python-dotenv`.
