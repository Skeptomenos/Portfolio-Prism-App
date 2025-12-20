# Implementation Plan: Build Optimization

> **Spec:** `anamnesis/specs/build_optimization.md`
> **Workstream:** `infrastructure`
> **Status:** Ready for Implementation

## 1. Tactical Steps

### Phase 1: Script Enhancement (`scripts/build-python.sh`)
1.  **Add Hashing Logic**:
    *   Implement `get_python_hash()` using `find` and `md5` (or `shasum`).
    *   Include `.py`, `.spec`, `pyproject.toml`, and `uv.lock` in the hash.
    *   **Confidence:** 95% | **Risk:** Low | **Impact:** High (Enables skipping entire build).
2.  **Implement Skip Logic**:
    *   Read `.last_build_hash`.
    *   If current hash matches, exit with message "Python source unchanged, skipping build."
    *   **Confidence:** 95% | **Risk:** Low | **Impact:** High (Reduces build time to <2s).
3.  **Parallelize PyInstaller**:
    *   Refactor the `for spec in *.spec` loop.
    *   Remove `--clean` from the command.
    *   Run commands in background: `uv run pyinstaller "$spec" --noconfirm &`.
    *   Add `wait` to ensure all builds finish before the smoke test.
    *   **Confidence:** 85% | **Risk:** Medium | **Impact:** Medium (Reduces total time when building multiple specs).
4.  **Add Force Flag**:
    *   Support `-f` or `--force` to bypass hash check and add `--clean` back to PyInstaller.
    *   **Confidence:** 100% | **Risk:** Low | **Impact:** Low (Safety valve for edge cases).

### Phase 2: Spec Audit (`prism_headless.spec`)
1.  **Review Excludes**:
    *   Verify if `matplotlib`, `PIL`, `tkinter` are fully excluded.
    *   Check for other heavy libraries that might be pulled in by `pandas` or `yfinance`.
    *   **Confidence:** 90% | **Risk:** Low | **Impact:** Medium (Reduces binary size and scan time).
2.  **Verify ARM64 Flags**:
    *   Ensure `strip=False` and `upx=False` remain as they are critical for stability.
    *   **Confidence:** 100% | **Risk:** Low | **Impact:** Critical (Prevents broken binaries on macOS ARM64).

### Phase 3: Verification
1.  **Smoke Test**: Run the existing verification logic in `build-python.sh`.
2.  **Timing Benchmark**:
    *   Measure "Cold Build" (with `--force`).
    *   Measure "No-change Build" (should be < 2s).
    *   Measure "Incremental Build" (change one `.py` file).

## 2. Success Metrics
- **Cold Build**: No regression in time.
- **No-change Build**: >99% reduction in time.
- **Incremental Build**: >60% reduction in time.

## 3. Rollback Plan
- Revert `scripts/build-python.sh` to the previous version using `git checkout`.
- Delete `.last_build_hash` to force a clean state.
