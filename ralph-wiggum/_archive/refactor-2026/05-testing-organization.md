# Spec: Testing Organization & Co-location

> **Goal**: Move Python unit tests from the centralized `tests/` directory to be co-located with the source code they test, as mandated by `rules/testing.md`.
> **Estimated Time**: 20 minutes.

## 1. Overview
Currently, all Python tests are in `src-tauri/python/tests/`. The mandate requires unit tests to be next to the file they test (e.g., `pipeline.py` -> `pipeline.test.py` or `test_pipeline.py`).

## 2. Implementation Steps

### 2.1 Move Tests
Move the following files:

| Current Location | Target Location |
|------------------|-----------------|
| `tests/test_adapters.py` | `portfolio_src/adapters/test_adapters.py` |
| `tests/test_data_cleaner.py` | `portfolio_src/core/test_data_cleaner.py` |
| `tests/test_pipeline_*.py` | `portfolio_src/core/test_pipeline_*.py` |
| `tests/test_tr_auth_unit.py` | `portfolio_src/core/test_tr_auth.py` |
| `tests/headless/test_handlers_*.py` | `portfolio_src/headless/handlers/test_*.py` |
| `tests/headless/test_state.py` | `portfolio_src/headless/test_state.py` |

*Note: Keep Integration and E2E tests in `tests/`.*

### 2.2 Update Pytest Config
- [ ] Check `src-tauri/python/pyproject.toml` or `pytest.ini`.
- [ ] Ensure `testpaths` includes `portfolio_src`.
- [ ] Ensure python file discovery pattern includes `test_*.py` inside the source tree.

### 2.3 Refactor Imports in Tests
- [ ] When moving tests, relative imports might break.
- [ ] Update imports in moved tests to be absolute `from portfolio_src...` or correct relative paths.

## 3. Verification
- [ ] Run `pytest src-tauri/python/portfolio_src`.
- [ ] Verify all moved tests are discovered and pass.
