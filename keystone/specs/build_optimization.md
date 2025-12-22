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
