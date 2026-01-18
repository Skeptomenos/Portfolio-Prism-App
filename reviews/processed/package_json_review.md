# Code Review: package.json

**File**: `package.json`
**Category**: Configuration - Dependency Security
**Reviewer**: Automated
**Date**: 2026-01-18

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 3 |
| Info | 2 |

**Result**: PASSED (2M, 3L, 2I)

---

## [MEDIUM] Version Range Specifiers Allow Minor/Patch Upgrades

> Caret (^) version specifiers could introduce breaking changes from transitive dependency updates

**File**: `package.json:26-70`
**Category**: Maintainability
**Severity**: Medium

### Description

All dependencies use caret (`^`) version specifiers which allow automatic updates to minor and patch versions. While this is common practice, it can lead to unexpected behavior when transitive dependencies introduce breaking changes. The `package-lock.json` mitigates this for direct installs, but CI/CD environments or fresh clones may get different versions if the lockfile is not properly committed.

### Current Code

```json
"dependencies": {
  "@tanstack/react-query": "^5.90.12",
  "@tauri-apps/api": "^2",
  ...
}
```

### Suggested Fix

For production applications, consider:
1. Ensure `package-lock.json` is always committed (VERIFIED: exists, 326KB)
2. For critical dependencies like `@tauri-apps/api`, consider using exact versions: `"@tauri-apps/api": "2.9.1"`
3. Implement automated dependency update testing via Dependabot or Renovate

### Verification

1. Verify `package-lock.json` is in version control: `git ls-files package-lock.json`
2. Run `npm ci` instead of `npm install` in CI to enforce lockfile versions

---

## [MEDIUM] No Automated Dependency Update Strategy Documented

> No configuration for automated security updates visible in the project

**File**: `package.json`
**Category**: Security
**Severity**: Medium

### Description

There is no visible Dependabot, Renovate, or similar automated dependency update configuration. This means security vulnerabilities in dependencies may go unpatched unless manually monitored.

### Suggested Fix

Add one of the following:

**Option A: Dependabot (.github/dependabot.yml)**
```yaml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 5
```

**Option B: Renovate (renovate.json)**
```json
{
  "extends": ["config:base"],
  "packageRules": [
    {
      "matchUpdateTypes": ["patch", "minor"],
      "automerge": true
    }
  ]
}
```

### Verification

1. Check for existing config: `ls -la .github/dependabot.yml renovate.json`
2. Set up GitHub Dependabot alerts in repository settings

---

## [LOW] Several Packages Have Newer Versions Available

> Multiple packages are behind latest versions, though no security issues detected

**File**: `package.json:26-70`
**Category**: Maintainability
**Severity**: Low

### Description

`npm outdated` shows several packages with updates available:

| Package | Current | Latest | Risk |
|---------|---------|--------|------|
| `@vitejs/plugin-react` | 4.7.0 | 5.1.2 | Major version |
| `framer-motion` | 11.18.2 | 12.26.2 | Major version |
| `lucide-react` | 0.456.0 | 0.562.0 | Minor updates |
| `@types/react` | 18.3.27 | 19.2.8 | React 19 types |

### Suggested Fix

1. For patch/minor updates within same major: Update regularly
2. For major version updates: Schedule dedicated upgrade sprints
3. React 19 types should only be updated when upgrading React itself

### Verification

Run `npm outdated` periodically and evaluate updates

---

## [LOW] TypeScript Pinned to Patch Version Range

> TypeScript uses tilde (~) which is more restrictive but limits patch updates

**File**: `package.json:66`
**Category**: Maintainability
**Severity**: Low

### Description

TypeScript is pinned with `~5.6.2` (allows 5.6.x only). This is appropriate for TypeScript since minor versions can introduce breaking changes, but it means security patches in newer minor versions won't be automatically applied.

### Current Code

```json
"typescript": "~5.6.2"
```

### Suggested Fix

This is actually a reasonable choice for TypeScript. Consider periodic manual review of TypeScript updates (currently at 5.8.x) for new features and security fixes.

### Verification

Check TypeScript release notes: https://github.com/microsoft/TypeScript/releases

---

## [LOW] devDependencies Devtools Included

> React Query devtools are in dependencies, should be devDependencies for production builds

**File**: `package.json:28`
**Category**: Performance
**Severity**: Low

### Description

`@tanstack/react-query-devtools` is listed in `dependencies` instead of `devDependencies`. While React Query devtools are typically tree-shaken in production builds when `NODE_ENV=production`, placing them in dependencies is technically incorrect.

### Current Code

```json
"dependencies": {
  "@tanstack/react-query-devtools": "^5.91.1",
  ...
}
```

### Suggested Fix

Move to devDependencies if devtools are only used in development:

```json
"devDependencies": {
  "@tanstack/react-query-devtools": "^5.91.1",
  ...
}
```

Note: Verify devtools are conditionally imported in code before moving.

### Verification

1. Check how devtools are imported in `src/`
2. Verify production bundle doesn't include devtools code

---

## [INFO] No Known Vulnerabilities Detected

> npm audit reports 0 vulnerabilities across 649 dependencies

**File**: `package.json`
**Category**: Security
**Severity**: Info

### Description

`npm audit` reports clean results:

```json
{
  "vulnerabilities": {
    "info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0
  },
  "dependencies": {
    "prod": 57, "dev": 589, "optional": 61, "total": 649
  }
}
```

This is excellent for a project with 649 total dependencies.

### Verification

Run `npm audit` regularly, especially before releases.

---

## [INFO] License Compliance Verified

> All 568 unique packages have compatible open-source licenses

**File**: `package.json`
**Category**: Legal
**Severity**: Info

### Description

License breakdown:
- MIT: 478 packages
- ISC: 37 packages
- Apache-2.0: 23 packages
- BSD-3-Clause: 9 packages
- BSD-2-Clause: 8 packages
- Other OSI-approved: 12 packages
- UNLICENSED: 1 (the project itself, `portfolio-prism`)

All third-party dependencies use permissive open-source licenses compatible with commercial use.

### Verification

Run `npx license-checker --summary` to verify

---

## Checklist Results

### Security
- [x] npm audit clean (0 vulnerabilities)
- [x] No deprecated packages with known exploits
- [x] License compliance verified
- [ ] Automated dependency updates configured (MISSING)

### Correctness
- [x] Lock file present and properly formatted (lockfileVersion: 3)
- [x] All dependencies resolve correctly
- [x] No peer dependency conflicts

### Performance
- [x] No obviously heavy dependencies for the use case
- [ ] devDependencies vs dependencies properly separated (minor issue)

### Maintainability
- [x] Scripts are well-organized
- [x] Project is marked as private (prevents accidental publishing)
- [ ] Version ranges could be more explicit for critical deps

### Testing
- [x] Test framework configured (vitest)
- [x] Coverage tooling present (@vitest/coverage-v8)
- [x] E2E testing configured (@playwright/test)
