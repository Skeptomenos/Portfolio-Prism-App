# Review: src-tauri/tauri.conf.json

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**Result**: PASSED (2 Medium, 3 Low, 2 Info)

---

## [MEDIUM] Unsafe CSP Directives for Scripts

> script-src includes 'unsafe-inline' and 'unsafe-eval' which weaken XSS protection

**File**: `src-tauri/tauri.conf.json:22`  
**Category**: Security  
**Severity**: Medium  

### Description

The Content Security Policy includes `'unsafe-inline'` and `'unsafe-eval'` in the `script-src` directive. These directives:
- `'unsafe-eval'`: Allows `eval()`, `Function()`, and similar dynamic code execution
- `'unsafe-inline'`: Allows inline `<script>` tags and event handlers

While these weaken XSS protection, they are commonly required for:
- Vite's Hot Module Replacement (HMR) during development
- React's development tooling
- Some bundler patterns

### Current Code

```json
"script-src 'self' 'unsafe-inline' 'unsafe-eval'"
```

### Suggested Fix

For production builds, consider a stricter CSP using nonces or hashes:

```json
"script-src 'self' 'nonce-${NONCE}'"
```

Or use Tauri's build-time CSP configuration to have different policies for development vs production:

```json
// In a production-specific config
"script-src 'self'"
```

**Note**: This requires testing to ensure the production build works without these directives.

### Verification

1. Build production bundle: `npm run tauri build`
2. Test all functionality works without `unsafe-*` directives
3. Check browser console for CSP violations

---

## [MEDIUM] Wildcard Subdomain in connect-src

> connect-src allows any *.workers.dev subdomain, not just the project's worker

**File**: `src-tauri/tauri.conf.json:22`  
**Category**: Security  
**Severity**: Medium  

### Description

The CSP `connect-src` directive includes `https://*.workers.dev` which allows connections to ANY Cloudflare Worker subdomain, not just the project's specific worker (`portfolio-prism-proxy.*.workers.dev`).

An attacker who could inject JavaScript could exfiltrate data to their own Cloudflare Worker.

### Current Code

```json
"connect-src 'self' https://*.workers.dev https://localhost:* http://localhost:* tauri://localhost"
```

### Suggested Fix

Restrict to the specific worker subdomain:

```json
"connect-src 'self' https://portfolio-prism-proxy.youraccount.workers.dev tauri://localhost"
```

Or use a pattern that matches only your workers:

```json
"connect-src 'self' https://portfolio-prism-*.workers.dev tauri://localhost"
```

### Verification

1. Update CSP with specific worker URL
2. Test proxy API calls still work
3. Verify other workers.dev domains are blocked

---

## [LOW] Unencrypted localhost Connections Allowed

> connect-src allows http://localhost:* which could leak data during development

**File**: `src-tauri/tauri.conf.json:22`  
**Category**: Security  
**Severity**: Low  

### Description

The CSP allows `http://localhost:*` (unencrypted) connections. While this is needed for development with Vite's dev server, it should ideally be removed or configured differently for production builds.

### Current Code

```json
"connect-src 'self' https://*.workers.dev https://localhost:* http://localhost:* tauri://localhost"
```

### Suggested Fix

Use environment-specific CSP configuration:

**Development** (current):
```json
"connect-src 'self' https://*.workers.dev https://localhost:* http://localhost:* tauri://localhost"
```

**Production**:
```json
"connect-src 'self' https://your-specific-worker.workers.dev tauri://localhost"
```

### Verification

1. Production build should not include localhost in CSP
2. Test production build connects only to allowed hosts

---

## [LOW] Data URIs Allowed in img-src and font-src

> data: URIs can be vectors for data exfiltration in edge cases

**File**: `src-tauri/tauri.conf.json:22`  
**Category**: Security  
**Severity**: Low  

### Description

The CSP allows `data:` URIs in `img-src` and `font-src`. While commonly needed for:
- Base64-encoded images
- Icon fonts
- Inline SVGs

In edge cases, data URIs can be used for data exfiltration when combined with other vulnerabilities.

### Current Code

```json
"img-src 'self' data: blob:; font-src 'self' data:"
```

### Suggested Fix

This is acceptable for the current use case. Document why data URIs are needed:

```json
// img-src: data: needed for base64 thumbnails, blob: for canvas exports
// font-src: data: needed for icon fonts
"img-src 'self' data: blob:; font-src 'self' data:"
```

### Verification

1. Audit codebase for data URI usage
2. Confirm they're necessary for functionality
3. No action required if justified

---

## [LOW] Long CSP String Lacks Documentation

> CSP is a complex single-line string without explaining each directive

**File**: `src-tauri/tauri.conf.json:22`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The CSP string is ~300 characters on a single line. While JSON doesn't support comments, the reasoning behind each directive should be documented elsewhere (e.g., in AGENTS.md or a security doc).

### Current Code

```json
"csp": "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; ..."
```

### Suggested Fix

Create a `docs/security/CSP.md` file documenting:
- Each directive and why it's needed
- Development vs production considerations
- Known trade-offs (unsafe-eval for HMR, etc.)

### Verification

1. Create documentation file
2. Reference it in AGENTS.md under security section

---

## [INFO] Global Tauri API Exposed

> withGlobalTauri: true exposes window.__TAURI__ to all scripts

**File**: `src-tauri/tauri.conf.json:13`  
**Category**: Security  
**Severity**: Info  

### Description

The `withGlobalTauri: true` setting exposes the Tauri API on `window.__TAURI__`. This is standard for Tauri apps but means any JavaScript (including injected scripts if XSS occurs) could access Tauri IPC commands.

This is mitigated by:
- Tauri's permission system (capabilities/default.json)
- CSP preventing script injection

### Current Code

```json
"withGlobalTauri": true
```

### Verification

No action required. Document this behavior in security documentation.

---

## [INFO] Bundled External Binaries

> Two external binaries are bundled - security depends on build process

**File**: `src-tauri/tauri.conf.json:28-31`  
**Category**: Security  
**Severity**: Info  

### Description

The app bundles two external binaries:
- `binaries/prism-headless` - Python analytics engine
- `binaries/tr-daemon` - Trade Republic daemon

Security considerations:
- Binaries should be built in CI with reproducible builds
- Paths should be validated before spawning
- Binaries inherit app permissions

### Current Code

```json
"externalBin": [
  "binaries/prism-headless",
  "binaries/tr-daemon"
]
```

### Verification

1. Verify binaries are built in CI, not committed
2. Check spawning code validates paths (see lib.rs review)
3. Ensure binaries follow least-privilege

---

## Summary

The configuration follows Tauri v2 best practices with appropriate security settings. The main concerns are:

1. **CSP could be stricter** - Consider environment-specific CSP for production
2. **Wildcard worker domain** - Should be restricted to specific worker subdomain
3. **Development settings in production** - Localhost permissions should be dev-only

No critical or high severity findings. The configuration is acceptable but has room for security hardening.
