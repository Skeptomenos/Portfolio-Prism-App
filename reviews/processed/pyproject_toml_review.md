# Review: src-tauri/python/pyproject.toml

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**Category**: Configuration - Python Dependency Security  
**Result**: PASSED (2 Medium, 4 Low, 3 Info)

---

## [MEDIUM] Outdated pytr Package Version

> pytr package is pinned to old version, missing potential security fixes

**File**: `src-tauri/python/pyproject.toml:23`  
**Category**: Maintainability  
**Severity**: Medium  

### Description

The `pytr` package (Trade Republic API client) is pinned to `>=0.4.2` but the latest version is `0.4.5`. While not a critical security issue, this package handles authentication and sensitive financial data. Keeping it updated ensures any security patches are applied.

### Current Code

```toml
"pytr>=0.4.2",
```

### Suggested Fix

```toml
"pytr>=0.4.5",
```

### Verification

1. Run `uv lock --upgrade-package pytr`
2. Test Trade Republic authentication flow
3. Verify portfolio sync still works

---

## [MEDIUM] Missing Dependency Vulnerability Scanning

> No automated vulnerability scanning configured for Python dependencies

**File**: `src-tauri/python/pyproject.toml`  
**Category**: Security  
**Severity**: Medium  

### Description

The project lacks automated dependency vulnerability scanning. While a `uv.lock` file exists for reproducible builds, there's no evidence of:
- GitHub Dependabot configuration for Python
- `pip-audit` or `safety` integration
- Pre-commit hooks for dependency checking

Given that this application handles financial credentials and portfolio data, automated vulnerability scanning is strongly recommended.

### Suggested Fix

Option 1: Add pip-audit to dev dependencies:
```toml
[dependency-groups]
dev = [
    "pytest>=9.0.2",
    "pip-audit>=2.7.0",
]
```

Option 2: Configure GitHub Dependabot (create `.github/dependabot.yml`):
```yaml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/src-tauri/python"
    schedule:
      interval: "weekly"
```

### Verification

1. Run `pip-audit` or `uv pip compile --check`
2. Verify no known vulnerabilities in current dependencies

---

## [LOW] PyInstaller in Production Dependencies

> PyInstaller should be a dev-only dependency

**File**: `src-tauri/python/pyproject.toml:21`  
**Category**: Maintainability  
**Severity**: Low  

### Description

PyInstaller is a build tool, not a runtime dependency. Including it in main dependencies bloats the dependency tree and could introduce unnecessary attack surface.

### Current Code

```toml
dependencies = [
    ...
    "pyinstaller>=6.0",
    ...
]
```

### Suggested Fix

```toml
dependencies = [
    # Remove pyinstaller from here
]

[dependency-groups]
dev = [
    "pytest>=9.0.2",
    "pyinstaller>=6.0",
]
```

### Verification

1. Verify build process uses dev dependencies: `uv sync --group dev`
2. Confirm `.spec` file still works for bundling

---

## [LOW] yfinance Major Version Available

> yfinance has a major version update (0.2.x -> 1.0)

**File**: `src-tauri/python/pyproject.toml:28`  
**Category**: Maintainability  
**Severity**: Low  

### Description

yfinance has released version 1.0, a major version upgrade from the pinned `>=0.2.66`. Major version updates may include security improvements and breaking changes that should be evaluated.

### Current Code

```toml
"yfinance>=0.2.66",
```

### Suggested Fix

Evaluate and test yfinance 1.0 for compatibility:
```toml
"yfinance>=1.0",
```

### Verification

1. Review yfinance 1.0 changelog for breaking changes
2. Test all yfinance usage in the codebase
3. Update any deprecated API calls

---

## [LOW] Dual HTTP Client Libraries

> Both requests and httpx are dependencies

**File**: `src-tauri/python/pyproject.toml:24-25`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The project includes both `requests` and `httpx` as dependencies. While this may be intentional (httpx for async, requests for sync), maintaining two HTTP client libraries increases the attack surface and maintenance burden.

### Current Code

```toml
"requests>=2.32.5",
"httpx>=0.28.0",
```

### Suggested Fix

Consolidate on `httpx` which supports both sync and async:
```python
# Instead of: requests.get(url)
# Use: httpx.get(url) (sync) or await httpx.AsyncClient().get(url) (async)
```

Note: This may require code changes if `requests` is used by upstream dependencies (like `pytr` or `yfinance`).

### Verification

1. Identify which modules use `requests` vs `httpx`
2. Verify if requests is a transitive dependency requirement
3. If consolidating, test all HTTP operations

---

## [LOW] Broad Version Constraints

> Some dependencies use very loose version constraints

**File**: `src-tauri/python/pyproject.toml:7-32`  
**Category**: Maintainability  
**Severity**: Low  

### Description

Several dependencies use `>=X.Y.Z` constraints without upper bounds. While the `uv.lock` file pins exact versions for reproducibility, loose constraints in `pyproject.toml` could lead to unexpected behavior if the lock file is regenerated.

Notable examples:
- `pandas>=2.0.0` (current: 2.x, allows any future major version)
- `numpy>=1.24.0` (current: 2.x is available)
- `fastapi>=0.126.0` (fast-moving, frequent breaking changes)

### Suggested Fix

Consider adding upper bounds for stability:
```toml
"pandas>=2.0.0,<3.0.0",
"numpy>=1.24.0,<3.0.0",
"fastapi>=0.126.0,<1.0.0",
```

### Verification

1. Lock file regeneration should respect constraints
2. Test suite should catch any compatibility issues

---

## [INFO] Lock File Present and Recent

> uv.lock file exists and is actively maintained

**File**: `src-tauri/python/uv.lock`  
**Category**: Security  
**Severity**: Info  

### Description

The project uses `uv` as the package manager with a lock file dated January 10, 2026. This is good practice for:
- Reproducible builds
- Consistent dependency resolution
- Supply chain security

The lock file includes SHA256 hashes for all packages, which helps prevent tampering.

**Positive finding - no action required.**

---

## [INFO] Security-Critical Dependencies Are Current

> cryptography, pydantic, and keyring are at latest versions

**File**: `src-tauri/python/pyproject.toml:9,17,20`  
**Category**: Security  
**Severity**: Info  

### Description

The most security-critical dependencies are at their latest versions:
- `cryptography>=46.0.3` (latest: 46.0.3) - handles encryption
- `pydantic>=2.12.5` (latest: 2.12.5) - handles data validation
- `keyring>=25.7.0` (latest: 25.7.0) - handles credential storage

**Positive finding - no action required.**

---

## [INFO] Python Version Constraint is Reasonable

> Requires Python 3.10+, which is still supported

**File**: `src-tauri/python/pyproject.toml:6`  
**Category**: Security  
**Severity**: Info  

### Description

The project requires `python >= 3.10`, which:
- Receives security updates until October 2026
- Supports modern async/await patterns
- Has good type annotation support

**Positive finding - no action required.**

---

## Summary

| Severity | Count | Description |
|----------|-------|-------------|
| Critical | 0 | - |
| High | 0 | - |
| Medium | 2 | Outdated pytr, missing vulnerability scanning |
| Low | 4 | PyInstaller in prod deps, yfinance major update, dual HTTP clients, loose constraints |
| Info | 3 | Lock file present, security deps current, Python version reasonable |

### Recommendations

1. **Add pip-audit to CI/CD** - Automate vulnerability scanning
2. **Move PyInstaller to dev dependencies** - Clean separation of build vs runtime
3. **Evaluate yfinance 1.0** - Test for compatibility with major version update
4. **Keep pytr updated** - Financial API client should track latest patches
