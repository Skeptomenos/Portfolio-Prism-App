# Review: src-tauri/Cargo.toml

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**Result**: PASSED (2M, 4L, 3I)

---

## Summary

The Cargo.toml configuration is minimal and follows security best practices. Direct dependencies are limited, version ranges are appropriately constrained, and the release profile is optimized for security (stripping symbols, LTO). No critical or high severity issues found.

---

## [MEDIUM] Loose Version Constraints on Dependencies

> Dependency version constraints allow minor/patch updates which could introduce breaking changes or vulnerabilities

**File**: `src-tauri/Cargo.toml:17-29`  
**Category**: Security  
**Severity**: Medium  

### Description

All dependencies use major version constraints (e.g., `"1"`, `"2"`, `"0.4"`) rather than exact versions or tighter constraints. While Cargo.lock pins exact versions, CI/CD rebuilds or new team members running `cargo update` could pull in newer minor versions with potential security issues or breaking changes.

Key dependencies with loose constraints:
- `tauri = "2"` - Major framework dependency
- `serde = "1"` - Serialization library handling user data
- `tokio = "1"` - Async runtime

### Current Code

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
tokio = { version = "1", features = ["sync", "time"] }
```

### Suggested Fix

Consider using more specific version constraints for security-critical dependencies:

```toml
[dependencies]
tauri = { version = "2.0", features = [] }  # At minimum, pin to minor
serde = { version = "1.0", features = ["derive"] }
tokio = { version = "1.0", features = ["sync", "time"] }
```

Or use exact pinning in CI:
```toml
# For maximum reproducibility
tauri = { version = "=2.0.0", features = [] }
```

### Verification

1. Run `cargo update --dry-run` to see what would change
2. Ensure Cargo.lock is committed to version control
3. Consider using `cargo deny` for supply chain security

---

## [MEDIUM] No cargo-deny or Dependency Audit Configuration

> No automated security scanning for Rust dependencies

**File**: `src-tauri/Cargo.toml` (missing configuration)  
**Category**: Security  
**Severity**: Medium  

### Description

The project lacks configuration for `cargo-deny` or `cargo-audit`, which are industry-standard tools for:
- Checking dependencies against the RustSec Advisory Database
- Detecting duplicate dependencies
- Enforcing license compliance
- Blocking unmaintained crates

Without automated auditing, vulnerable dependencies may go undetected.

### Suggested Fix

Add a `deny.toml` configuration file:

```toml
# deny.toml
[advisories]
db-path = "~/.cargo/advisory-db"
vulnerability = "deny"
unmaintained = "warn"
yanked = "deny"

[licenses]
unlicensed = "deny"
allow = ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"]

[bans]
multiple-versions = "warn"
wildcards = "deny"
```

Add to CI pipeline:
```yaml
- name: Security audit
  run: |
    cargo install cargo-audit
    cargo audit
```

### Verification

1. Install cargo-audit: `cargo install cargo-audit`
2. Run: `cargo audit`
3. Add to CI/CD pipeline

---

## [LOW] fs2 Crate is Unmaintained

> The fs2 crate has not been updated since 2019

**File**: `src-tauri/Cargo.toml:29`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The `fs2` crate (version 0.4.3, last updated 2019) is used for file locking. While functional, it's effectively unmaintained. Consider alternatives like `fd-lock` or `fs4` which are actively maintained.

### Current Code

```toml
fs2 = "0.4"
```

### Suggested Fix

Consider migrating to `fs4` (a maintained fork):

```toml
fs4 = "0.8"
```

The API is largely compatible.

### Verification

1. Check usage in `lib.rs` for single-instance locking
2. Test file locking functionality after migration

---

## [LOW] env_logger Version Pinned to 0.10

> env_logger 0.11 is available with improvements

**File**: `src-tauri/Cargo.toml:28`  
**Category**: Maintainability  
**Severity**: Low  

### Description

`env_logger` version 0.10.2 is used, but 0.11.x is available with performance improvements and bug fixes. While not a security issue, keeping dependencies current is good practice.

### Current Code

```toml
env_logger = "0.10"
```

### Suggested Fix

```toml
env_logger = "0.11"
```

### Verification

1. Check for any API changes between 0.10 and 0.11
2. Run tests after upgrade

---

## [LOW] Tokio Features Could Be More Minimal

> Only `sync` and `time` features are enabled, but consider if both are needed

**File**: `src-tauri/Cargo.toml:26`  
**Category**: Security  
**Severity**: Low  

### Description

The tokio dependency enables `sync` and `time` features. This is relatively minimal, which is good. However, if only one feature is actually used, removing the other would reduce attack surface slightly.

### Current Code

```toml
tokio = { version = "1", features = ["sync", "time"] }
```

### Suggested Fix

Verify actual usage in `lib.rs` and `python_engine.rs`:
- `sync` provides channels and mutexes
- `time` provides delays and intervals

If only one is needed, remove the other.

### Verification

1. Grep for `tokio::sync` and `tokio::time` usage
2. Remove unused features
3. Build and test

---

## [LOW] No explicit Rust edition or MSRV

> Consider documenting minimum supported Rust version

**File**: `src-tauri/Cargo.toml:6`  
**Category**: Maintainability  
**Severity**: Low  

### Description

While `edition = "2021"` is set, there's no `rust-version` field to specify the minimum supported Rust version (MSRV). This helps ensure reproducible builds and documents compatibility.

### Current Code

```toml
edition = "2021"
```

### Suggested Fix

```toml
edition = "2021"
rust-version = "1.70"  # Or appropriate MSRV for tauri v2
```

### Verification

1. Determine minimum Rust version required by dependencies
2. Add to Cargo.toml
3. Test with specified version

---

## [INFO] Release Profile is Well-Configured

**File**: `src-tauri/Cargo.toml:31-36`  
**Category**: Security  
**Severity**: Info  

### Description

The release profile is well-configured for security and binary size:

```toml
[profile.release]
lto = true           # Link-time optimization (helps remove dead code)
codegen-units = 1    # Single codegen unit for better optimization
panic = "abort"      # No unwinding (smaller binary, prevents some exploitation)
strip = true         # Strips debug symbols (reduces info leakage)
opt-level = "z"      # Optimize for size
```

This is excellent for a desktop application. `panic = "abort"` prevents stack unwinding exploitation, and `strip = true` removes potentially sensitive debug information.

---

## [INFO] Minimal Feature Usage is Good

**File**: `src-tauri/Cargo.toml:21-22`  
**Category**: Security  
**Severity**: Info  

### Description

Tauri and tauri-build are configured with minimal/no extra features:

```toml
tauri-build = { version = "2", features = [] }
tauri = { version = "2", features = [] }
```

This reduces attack surface by not including unnecessary functionality. Good practice.

---

## [INFO] Direct Dependency Count is Low

**File**: `src-tauri/Cargo.toml`  
**Category**: Security  
**Severity**: Info  

### Description

The project has only 9 direct dependencies, which is very low for a Tauri application. This is positive for security as it reduces the supply chain attack surface. The transitive dependencies are mostly well-maintained Tauri ecosystem crates.

Direct dependencies:
- `tauri` + `tauri-build` + `tauri-plugin-shell` (core framework)
- `serde` + `serde_json` (serialization)
- `chrono` (time handling)
- `tokio` (async runtime)
- `log` + `env_logger` (logging)
- `fs2` (file locking)

---

## Dependency Security Analysis

### Cargo.lock Observations

From the Cargo.lock analysis:
- **tauri** ecosystem is up to date (v2.x)
- **serde** at v1.x (well-maintained, no known vulnerabilities)
- **tokio** at v1.x (actively maintained)
- **chrono** at v0.4.42 (recent, no known critical issues)

### Known Vulnerabilities

Without `cargo-audit` available, a manual check against RustSec advisory database shows:
- No known vulnerabilities in direct dependencies at current versions
- `fs2` has no advisories but is unmaintained

### Recommended Actions

1. Add `cargo-audit` to CI pipeline
2. Consider `cargo-deny` for comprehensive supply chain security
3. Monitor RustSec advisories for transitive dependencies

---

## Checklist Summary

### Security
- [x] No hardcoded secrets
- [x] Minimal feature flags
- [x] Release profile strips debug info
- [ ] No automated vulnerability scanning (Medium finding)

### Correctness
- [x] Valid TOML syntax
- [x] Dependencies resolve correctly
- [x] Edition and package metadata correct

### Maintainability
- [x] Low direct dependency count
- [ ] Some dependencies could be updated (Low findings)
- [x] Clear organization

### Testing
- [x] N/A for manifest file

---

**Total Findings**: 9 (0 Critical, 0 High, 2 Medium, 4 Low, 3 Info)
