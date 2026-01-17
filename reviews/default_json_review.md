# Code Review: src-tauri/capabilities/default.json

**Reviewed:** 2026-01-18  
**Reviewer:** Automated  
**Result:** PASSED (2 Medium, 2 Low, 1 Info)

---

## [MEDIUM] Shell Permissions Lack Explicit Sidecar Scoping

> Shell permissions are granted without explicit scope constraints

**File**: `src-tauri/capabilities/default.json:8-15`  
**Category**: Security  
**Severity**: Medium

### Description

The capability file grants broad shell permissions (`shell:allow-spawn`, `shell:allow-execute`) without explicit scoping to specific sidecars. While Tauri v2's sidecar system inherently restricts execution to bundled binaries declared in `tauri.conf.json`, best practice is to use scoped permissions that explicitly enumerate allowed commands.

Current configuration relies on implicit security from bundled binary restrictions, but explicit scoping provides defense-in-depth and clearer security intent.

### Current Code

```json
{
  "permissions": [
    "core:default",
    "shell:default",
    "shell:allow-spawn",
    "shell:allow-execute",
    "shell:allow-kill",
    "shell:allow-stdin-write"
  ]
}
```

### Suggested Fix

Use scoped permissions in Tauri v2 to explicitly name allowed sidecars:

```json
{
  "permissions": [
    "core:default",
    "shell:default",
    {
      "identifier": "shell:allow-spawn",
      "allow": [
        { "sidecar": true, "name": "prism-headless" },
        { "sidecar": true, "name": "tr-daemon" }
      ]
    },
    {
      "identifier": "shell:allow-execute",
      "allow": [
        { "sidecar": true, "name": "prism-headless" },
        { "sidecar": true, "name": "tr-daemon" }
      ]
    },
    "shell:allow-kill",
    "shell:allow-stdin-write"
  ]
}
```

### Verification

1. Update the capability file with scoped permissions
2. Test that `prism-headless` sidecar still spawns correctly
3. Verify that attempting to spawn non-whitelisted commands fails
4. Run `npm run tauri dev` and confirm analytics engine connects

### References

- [Tauri v2 Shell Plugin Scoping](https://tauri.app/plugin/shell/)
- [Tauri Capability Scopes](https://tauri.app/reference/config/#permissions)

---

## [MEDIUM] CSP Contains unsafe-inline and unsafe-eval

> Content Security Policy in tauri.conf.json weakens XSS protections

**File**: `src-tauri/tauri.conf.json:22`  
**Category**: Security  
**Severity**: Medium

### Description

The CSP includes `'unsafe-inline'` for both scripts and styles, and `'unsafe-eval'` for scripts. This weakens XSS protections by allowing inline scripts and `eval()` execution. While common during development (Vite's HMR requires it), production builds should use stricter CSP.

Additionally, the current CSP already properly restricts:
- `frame-src 'none'` - Prevents iframe embedding
- `object-src 'none'` - Prevents plugin-based attacks
- `connect-src` limited to specific domains

### Current Code

```json
"csp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; ..."
```

### Suggested Fix

For production builds, consider using nonce-based CSP or separate dev/prod configurations:

```json
// Production-ready CSP (after removing Vite HMR requirements)
"csp": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.workers.dev tauri://localhost; frame-src 'none'; object-src 'none'; base-uri 'self'"
```

Alternatively, use build-time CSP generation with nonces for inline scripts.

### Verification

1. Build production app: `npm run tauri build`
2. Verify app loads correctly with stricter CSP
3. Check browser console for CSP violations
4. Test all features work without inline scripts

### References

- [CSP Best Practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Tauri Security CSP](https://tauri.app/reference/config/#csp)

---

## [LOW] Missing Capability Description Detail

> Capability description doesn't document security rationale

**File**: `src-tauri/capabilities/default.json:4`  
**Category**: Maintainability  
**Severity**: Low

### Description

The capability description is generic ("Capability for the main window"). For security-critical configurations, documentation should explain:
- Why each permission is needed
- What functionality depends on each permission
- Any security considerations

### Current Code

```json
{
  "description": "Capability for the main window"
}
```

### Suggested Fix

```json
{
  "description": "Main window capability for Portfolio Prism. Shell permissions enable Python analytics sidecar (prism-headless) and Trade Republic daemon (tr-daemon) communication. stdin-write enables IPC command sending. kill enables clean process shutdown."
}
```

### Verification

Review the updated description for accuracy and completeness.

---

## [LOW] No Explicit Denial of Dangerous Permissions

> Configuration doesn't explicitly deny potentially dangerous permissions

**File**: `src-tauri/capabilities/default.json`  
**Category**: Security  
**Severity**: Low

### Description

While not required by Tauri v2 (permissions are deny-by-default), explicitly denying dangerous permissions provides defense-in-depth and documents security intent. This is especially valuable for:
- `shell:allow-open` - Could open arbitrary URLs/files
- `fs:*` permissions - File system access
- `http:*` permissions - Network requests

### Suggested Fix

Add a comment or separate denial capability file for documentation:

```json
{
  "identifier": "security-denials",
  "description": "Explicitly denied permissions for security",
  "windows": ["main"],
  "permissions": []
}
```

Or document in the capability file with comments (if JSON5 is supported).

### Verification

No action required - this is informational for defense-in-depth.

---

## [INFO] withGlobalTauri Enabled

> Global Tauri API exposure increases attack surface slightly

**File**: `src-tauri/tauri.conf.json:13`  
**Category**: Security  
**Severity**: Info

### Description

The `withGlobalTauri: true` setting exposes `window.__TAURI__` globally, making Tauri APIs accessible from any JavaScript context. While necessary for the current architecture, it marginally increases attack surface if XSS occurs.

This is documented for awareness - the CSP restrictions and capability system provide primary security controls.

### Current Code

```json
{
  "app": {
    "withGlobalTauri": true
  }
}
```

### Verification

No action required - this is architectural awareness.

### References

- [Tauri Frontend Security](https://tauri.app/security/frontend/)

---

## Summary

| Severity | Count | Categories |
|----------|-------|------------|
| Critical | 0 | - |
| High | 0 | - |
| Medium | 2 | Security |
| Low | 2 | Security, Maintainability |
| Info | 1 | Security |

**Verdict:** PASSED - No blocking issues. Medium findings are best-practice improvements for defense-in-depth. The current configuration is functional and reasonably secure due to Tauri v2's deny-by-default model and sidecar restrictions.
