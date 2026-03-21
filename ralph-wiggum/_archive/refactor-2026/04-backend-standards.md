# Spec: Backend API Standards & Observability

> **Goal**: Standardize the JSON API envelope and replace `print()` with structured logging in the Python sidecar.
> **Estimated Time**: 20-30 minutes.

## 1. Overview
The Python sidecar uses a non-compliant JSON envelope (`status` vs `success`) and unstructured `print()` statements. This breaks the contract defined in `rules/api_design.md`.

## 2. Implementation Steps

### 2.1 Standardize JSON Envelope
- [ ] Modify `src-tauri/python/portfolio_src/headless/responses.py`:
    - Change `ResponseSuccess` model:
        - Remove `status: "success"`
        - Add `success: Literal[True] = True`
    - Change `ResponseError` model:
        - Remove `status: "error"`
        - Add `success: Literal[False] = False`
    - Ensure `data` field is present in Success.
    - Ensure `error` object is present in Error.

### 2.2 Update Frontend Handler
- [ ] Update `src/lib/ipc.ts` (or `src/lib/tauri.ts`) to handle the new envelope structure.
    - Check `response.success === true` instead of `response.status === 'success'`.

### 2.3 Remove `print()` statements
- [ ] **Files to fix**:
    - `src-tauri/python/portfolio_src/headless/transports/stdin_loop.py`
    - `src-tauri/python/portfolio_src/headless/handlers/sync.py`
    - `src-tauri/python/portfolio_src/core/tr_daemon.py`
    - `src-tauri/python/diag_hive.py`
- [ ] **Action**:
    - Import `logger` from `portfolio_src.prism_utils.logging_config`.
    - Replace `print(...)` with `logger.info(...)` or `logger.debug(...)` or `logger.error(...)`.
    - For `stdin_loop.py` (protocol communication), ensure raw stdout writes are explicitly marked as "PROTOCOL" writes or use a dedicated method `_write_stdout` to distinguish from logs. Logs should go to stderr or a file, NOT stdout (which is the IPC channel).

## 3. Verification
- [ ] Run the app. Verify frontend still receives data (IPC contract matches).
- [ ] Check logs. No "print" output in the console unless it's the raw JSON protocol.
- [ ] Verify `headless/responses.py` matches `rules/api_design.md`.
