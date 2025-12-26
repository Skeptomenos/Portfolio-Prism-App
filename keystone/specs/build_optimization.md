# Spec: Build System Optimization

> **Status:** Draft
> **Owner:** Sisyphus
> **Related Workstream:** `infrastructure`
> **Target:** Reduce Python sidecar build time by >80% for incremental runs.

## 1. Problem Statement

The current Python build process (`prism_headless.spec`) takes several minutes because:
1. It uses `--clean`, forcing a full re-analysis of all dependencies (including heavy ones like pandas/numpy).
2. It builds all `.spec` files sequentially.
3. It rebuilds everything even if no Python source files have changed.

## 2. Proposed Solution

### 2.1 Incremental Builds
Remove the `--clean` flag from `pyinstaller` commands in `scripts/build-python.sh`. This allows PyInstaller to use its cache in the `build/` directory.

### 2.2 Parallelization
Modify the build loop in `scripts/build-python.sh` to run `pyinstaller` in the background for each spec file and wait for all to complete.

### 2.3 Change Detection (Smart Build)
Implement a hashing mechanism to skip the build if the `src-tauri/python/` directory hasn't changed.
- Generate a hash of all `.py`, `.spec`, and config files in the python directory.
- Compare with a stored hash from the last successful build.

## 3. Implementation Details

### 3.1 `scripts/build-python.sh` Updates
- Add `calculate_hash` function.
- Add logic to check/update `.last_build_hash`.
- Update the build loop to use `&` for background execution.
- Remove `--clean` from the `pyinstaller` command.

### 3.2 `prism_headless.spec` Refinement
- Audit `excludes` list to ensure no unnecessary heavy packages are being pulled in.

## 4. Success Criteria
- [ ] Total build time for no-change scenario: < 5 seconds.
- [ ] Total build time for incremental change: < 60 seconds (down from ~3-5 mins).
- [ ] Binaries pass the existing smoke test.

## 5. Risks & Mitigations
- **Risk:** Stale cache causes import errors.
- **Mitigation:** Provide a `--force` flag to the build script to trigger a clean build if needed.
- **Risk:** Parallel builds exceed system memory.
- **Mitigation:** Only 2 specs are currently built; most modern systems can handle this.

---

## 6. PyInstaller Constraints

### 6.1 Bundle Size
- Target: <100MB binary
- Exclude unused libs via `excludes` list in spec file

### 6.2 Build All Sidecars
Build scripts MUST compile ALL executables in `tauri.conf.json`. Running `pyinstaller prism.spec` alone misses other sidecars.

### 6.3 Frozen Import Errors
Relative imports fail in PyInstaller binaries. Embed small shared modules directly or use absolute imports.

### 6.4 Spec File Safety
NEVER modify `.spec` files without version control diff check. Symptom of corruption: binary hangs before Python executes (dyld deadlock).

### 6.5 macOS ARM64 Requirements
- Use `collect_submodules()` for: pandas, numpy, pyarrow, pydantic, keyring, pytr
- Set `strip=False, upx=False`
- Missing modules cause bootloader hang, not import error

---

## 7. Implementation Plan

### Phase 1: Script Enhancement (`scripts/build-python.sh`)

1. **Add Hashing Logic**:
   - Implement `get_python_hash()` using `find` and `md5` (or `shasum`).
   - Include `.py`, `.spec`, `pyproject.toml`, and `uv.lock` in the hash.

2. **Implement Skip Logic**:
   - Read `.last_build_hash`.
   - If current hash matches, exit with message "Python source unchanged, skipping build."

3. **Parallelize PyInstaller**:
   - Refactor the `for spec in *.spec` loop.
   - Remove `--clean` from the command.
   - Run commands in background: `uv run pyinstaller "$spec" --noconfirm &`.
   - Add `wait` to ensure all builds finish before the smoke test.

4. **Add Force Flag**:
   - Support `-f` or `--force` to bypass hash check and add `--clean` back to PyInstaller.

### Phase 2: Spec Audit (`prism_headless.spec`)

1. **Review Excludes**: Verify `matplotlib`, `PIL`, `tkinter` are fully excluded.
2. **Verify ARM64 Flags**: Ensure `strip=False` and `upx=False` remain set.

### Phase 3: Verification

1. **Smoke Test**: Run the existing verification logic in `build-python.sh`.
2. **Timing Benchmark**:
   - Cold Build (with `--force`)
   - No-change Build (should be < 2s)
   - Incremental Build (change one `.py` file)

### Success Metrics
- **Cold Build**: No regression in time.
- **No-change Build**: >99% reduction in time.
- **Incremental Build**: >60% reduction in time.

### Rollback Plan
- Revert `scripts/build-python.sh` to the previous version using `git checkout`.
- Delete `.last_build_hash` to force a clean state.
