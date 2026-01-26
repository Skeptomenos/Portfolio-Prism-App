# Spec: Python Tooling Upgrade (Tach & Mypy)

> **Goal**: Implement static analysis and architecture enforcement for the Python sidecar to match the "2026 Mandate" of robustness and modularity.
> **Estimated Time**: 20 minutes.

## 1. Overview
The Python sidecar currently lacks static type checking (`mypy`) and architectural boundary enforcement (`tach`). We also lack a fast linter (`ruff`). We will add these tools to `pyproject.toml` and configure them.

## 2. Implementation Steps

### 2.1 Install Tools
- [ ] Add dev dependencies using `uv`:
    ```bash
    cd src-tauri/python
    uv add --dev mypy ruff tach
    ```

### 2.2 Configure Mypy (Type Safety)
- [ ] Add `[tool.mypy]` section to `pyproject.toml`:
    ```toml
    [tool.mypy]
    python_version = "3.12"
    strict = true
    ignore_missing_imports = true  # For some untyped libs like pytr?
    disallow_untyped_defs = true
    files = ["portfolio_src"]
    ```
- [ ] Run `mypy portfolio_src` and fix (or suppress) initial errors.
    - *Note*: If too many errors, set `strict = false` initially and ramp up.

### 2.3 Configure Ruff (Linting & Formatting)
- [ ] Add `[tool.ruff]` section to `pyproject.toml`:
    ```toml
    [tool.ruff]
    line-length = 100
    target-version = "py312"
    
    [tool.ruff.lint]
    select = ["E", "F", "I", "B", "UP"] # pycodestyle, pyflakes, isort, bugbear, pyupgrade
    ```

### 2.4 Configure Tach (Architecture)
- [ ] Initialize Tach: `tach init`
- [ ] Define modules in `tach.toml` to enforce the 3-Layer Architecture:
    - `portfolio_src.headless` (Presentation) -> Can import `core`. Cannot import `data` directly.
    - `portfolio_src.core` (Service) -> Can import `data`. Cannot import `headless`.
    - `portfolio_src.data` (Data) -> Cannot import `core` or `headless`.
- [ ] Enforce strict boundaries:
    ```toml
    [[modules]]
    path = "portfolio_src.headless"
    depends_on = ["portfolio_src.core", "portfolio_src.models"]
    
    [[modules]]
    path = "portfolio_src.core"
    depends_on = ["portfolio_src.data", "portfolio_src.models", "portfolio_src.adapters"]
    
    [[modules]]
    path = "portfolio_src.data"
    depends_on = ["portfolio_src.models"]
    ```

## 3. Verification
- [ ] Run `uv run mypy portfolio_src` -> Reports type errors (or clean).
- [ ] Run `uv run tach check` -> Reports architecture violations (we expect some until Phase 2 refactor is done).
- [ ] Run `uv run ruff check .` -> Reports lint issues.
