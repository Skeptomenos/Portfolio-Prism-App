# Global Standards

> **Read this when:** Writing or reviewing any code, regardless of language.

---

## 1. Code Style & Formatting

### 1.1 Language Agnostic

*   **Linters are Law:** If a linter (`ruff`, `eslint`, `rubocop`) is configured, its output is non-negotiable. Fix all warnings.
*   **Comments:**
    *   **Tone:** Use **Standard English**. Do **NOT** use "Telegraphic Style" here. Write complete, professional sentences.
    *   **Good:** Explain *Why* (Intent/Business Logic). ` # Using retry with backoff because API is rate-limited`
    *   **Bad:** Explain *What* (Syntax). ` # Increment i by 1`
    *   **Docstrings:** Every public function/class MUST have a docstring describing:
        1.  Purpose (1 sentence).
        2.  Args (Name & Type).
        3.  Returns (Type & Meaning).
        4.  Raises (Exceptions).

---

## 2. Security & Secrets

### 2.1 Zero Trust

*   **Secrets:** NEVER hardcode API Keys, Passwords, or Tokens.
    *   *Correct:* Load from Environment Variables (`os.getenv`, `dotenv`).
    *   *Incorrect:* `API_KEY = "sk-123..."`
*   **Input Validation:** Sanitize all external inputs (User args, API responses, File reads) before processing.
    *   Use libraries like `Pydantic` (Python) or `Zod` (JS/TS) for strict schema validation.

### 2.2 Dependency Management

*   **Locking:** Always use a lock file (`poetry.lock`, `package-lock.json`, `requirements.txt` with versions).
*   **Vetting:** Do not add a new dependency without checking:
    1.  Is it maintained? (Last commit < 6 months ago).
    2.  Is it widely used? (Github Stars/Downloads).

---

## 3. Error Handling (Resilience)

### 3.1 Exceptions

*   **Specificity:** Catch specific errors (`ValueError`, `NetworkError`). NEVER catch bare `Exception` unless logging a crash at the top level.
*   **Context:** When re-raising an error, wrap it with context.
    *   *Example:* `raise DataParseError(f"Failed to parse row {i}: {original_error}") from original_error`

### 3.2 Logging

*   **Levels:**
    *   `ERROR`: Action failed, human intervention needed.
    *   `WARNING`: Action failed but handled/skipped (Graceful degradation).
    *   `INFO`: High-level flow (Start/Stop/Milestone).
    *   `DEBUG`: Variable states for development.
*   **No Print:** Do not use `print()` (or `console.log`) in production code. Use the configured logger.

---

## 4. Testing Standards

### 4.1 Hierarchy

*   **Unit Tests:** Test logic in isolation (Mock I/O). fast (< 10ms).
*   **Integration Tests:** Test 2+ modules together. Slower.
*   **E2E Tests:** Test the full binary/app. Slowest.

### 4.2 Mocking

*   **Contract:** Mocks must return data that strictly matches the real object's schema.
*   **Scope:** Only mock the *immediate* boundary. Don't mock a mock.

---

## 5. Project Structure (Modularity)

*   **Collocation:** Keep related code/tests/assets close.
*   **No Cycles:** Module A depends on B. B cannot depend on A. Circular dependencies are forbidden.
*   **Config:** Configuration lives in `config/` or `settings.py`, decoupled from logic.

---

## 6. Version Control (Git)

### 6.1 Commit Messages

*   **Format:** Use **Conventional Commits**.
    *   `feat: add user login`
    *   `fix: handle null pointer in parser`
    *   `docs: update README`
    *   `refactor: simplify validation logic`
*   **Tone:** Use **Standard English**. Do **NOT** use "Telegraphic Style" in commit messages.
*   **Granularity:** Atomic commits. One feature/fix per commit.

---

## 7. Documentation Standards

### 7.1 Markdown

*   **Headers:** Use standard `#`, `##` hierarchy.
*   **Code Blocks:** Always specify the language (e.g., ```python).

### 7.2 Changelog

*   **Format:** Follow "Keep a Changelog" principles.
*   **Sections:** `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
*   **Audience:** Write for the **User**, not the Developer.

---

## 8. Specification Standards (SDD)

### 8.1 Requirements Syntax (EARS)

*   **Usage:** All functional requirements in `requirements.md` MUST use **EARS** (Easy Approach to Requirements Syntax).
*   **Patterns:**
    *   **Ubiquitous:** "The system shall [response]." (Always true).
    *   **Event-Driven:** "When [trigger], the system shall [response]."
    *   **State-Driven:** "While [state], the system shall [behavior]."
    *   **Unwanted:** "If [trigger], the system shall NOT [response]."
*   **Benefit:** Reduces ambiguity and hallucination by forcing explicit conditions.

### 8.2 Visual Architecture

*   **Tool:** Use **Mermaid.js** for all diagrams in `design.md`.
*   **Required Diagrams:**
    *   **Sequence Diagram:** For any multi-step interaction (User -> API -> DB).
    *   **State Diagram:** For any entity with complex lifecycle (e.g., Order Status: Pending -> Paid -> Shipped).

### 8.3 Pragmatic Spec Rule

*   **Zero Waste:** Do not create empty spec files. If a spec (like `design.md`) is not needed for the specific task, do not create it.
*   **Inline Context:** When writing code, if a constraint is critical (e.g., "No Redux"), add it as a comment in the file header.

---

## 9. Operational Mandates (Reliability)

These are existential rules for agent reliability. Violations cause systemic failures.

### 9.1 The "Hybrid First" Rule

*   **Context:** Automation tasks can be brittle with hostile data sources.
*   **Rule:** If automation takes >1 hour to debug, **STOP**. Implement a "Manual Escape Hatch" (file drop, manual input) instead.
*   **Priority:** Getting the data > automating the process.

### 9.2 The "I/O Fortress" Rule

*   **Context:** External APIs and network calls are flaky and rate-limited.
*   **Rule:** All external I/O MUST be:
    1.  **Cached** (with TTL)
    2.  **Throttled** (client-side delays)
    3.  **Validated** (contract tests at boundary)
*   **Mandate:** Never trust external input. Fail fast at the boundary.

### 9.3 The "Clean Slate" Rule

*   **Context:** "Ghost" assets appear when stale state mixes with new data.
*   **Rule:** Pipelines MUST be destructive. Wipe cache/database before full runs, or use strict upsert logic.
*   **Mandate:** Assume the database is dirty. State-based snapshots > event-based replays.

### 9.4 The "Preservation of Knowledge" Rule

*   **Context:** AI agents often truncate or overwrite documentation, losing history.
*   **Rule:** When updating documentation (README, specs, learnings):
    *   **APPEND** or **REFINE**—never delete without permission
    *   **NEVER** rewrite a file from scratch if only one section changed
    *   If content is obsolete, mark it `> **Deprecated:** ...` rather than deleting
