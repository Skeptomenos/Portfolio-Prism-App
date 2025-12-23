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

## Logging & Observability

Every Python file must follow these standards to ensure "Beautiful Logs" and technical accuracy.

### 1. Logger Initialization
STRICTLY use `get_logger(__name__)` from the project's logging utility. This ensures the log line includes the full module path for instant triage.

```python
from portfolio_src.prism_utils.logging_config import get_logger

logger = get_logger(__name__)
```

### 2. Zero-Tolerance for `print()`
Raw `print()` statements are forbidden in the backend. They bypass log level controls and break the visual structure of the terminal.
- **Wrong:** `print("Syncing...")`
- **Right:** `logger.info("Syncing...")`

### 3. Contextual Enrichment
Logs inside loops or processing pipelines **must** include unique identifiers (ISIN, Name, or ID).
- **Wrong:** `logger.info("Decomposing ETF...")`
- **Right:** `logger.info(f"Decomposing ETF {isin} ({name})...")`

### 4. Error Handling & Tracebacks
Always use `logger.error` or `logger.exception` inside `except` blocks. Use `exc_info=True` to ensure the full traceback is captured for debugging while maintaining a beautiful red header.

```python
try:
    # logic
except Exception as e:
    logger.error(f"Failed to process {isin}: {e}", exc_info=True)
```

### 5. Summary over Spam
For repetitive tasks (e.g., fetching 30 days of history), log a single summary line instead of flooding the terminal with 30 individual lines.
- **Right:** `logger.info(f"History fetch complete. Processed {count} data points.")`
