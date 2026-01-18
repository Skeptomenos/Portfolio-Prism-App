# Code Review: vite.config.ts

**File**: `vite.config.ts`  
**Reviewer**: Automated  
**Date**: 2026-01-18  
**Result**: PASSED

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 2 |
| Info | 2 |

---

## [MEDIUM] Hardcoded Production Worker URL as Fallback

> Production URL embedded in source code; should be externalized

**File**: `vite.config.ts:14-16`  
**Category**: Maintainability  
**Severity**: Medium  

### Description

The production Cloudflare Worker URL is hardcoded as a fallback value. While this is not a security issue (the URL is public), it creates maintenance burden:
- URL changes require code changes
- Different environments (staging, production) cannot be easily configured
- Makes it harder to test against different worker instances

### Current Code

```typescript
const WORKER_URL =
  process.env.WORKER_URL ||
  "https://portfolio-prism-proxy.bold-unit-582c.workers.dev";
```

### Suggested Fix

Consider requiring the environment variable or using a more explicit default strategy:

```typescript
const WORKER_URL = process.env.WORKER_URL;

if (!WORKER_URL && process.env.NODE_ENV === 'production') {
  throw new Error('WORKER_URL environment variable is required for production builds');
}

// Use empty string for dev (allows mock/offline mode)
const resolvedWorkerUrl = WORKER_URL || '';
```

Alternatively, document clearly in `.env.example` that this default exists and when to override.

### Verification

1. Build without WORKER_URL set - verify behavior
2. Build with WORKER_URL set - verify override works
3. Check that `feedback.ts` handles missing URL gracefully (it does - line 38-41)

---

## [MEDIUM] No Source Maps Configuration for Production

> Missing explicit sourcemap configuration for production builds

**File**: `vite.config.ts:19-51`  
**Category**: Security  
**Severity**: Medium  

### Description

The Vite configuration does not explicitly configure source maps for production builds. By default, Vite may expose source maps in production, which can:
- Reveal application logic to users
- Make it easier to find vulnerabilities
- Expose internal file paths and structure

For a Tauri app, this is lower risk since the code runs locally, but it's still a good practice to be explicit.

### Current Code

No `build.sourcemap` configuration present.

### Suggested Fix

```typescript
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false, // or 'hidden' for internal debugging
    // Consider also:
    // minify: 'terser',
    // terserOptions: { compress: { drop_console: true } }
  },
  define: {
    // ...existing
  },
  // ...rest
});
```

### Verification

1. Run `npm run build`
2. Check `dist/` for `.map` files
3. Verify bundle size is reasonable

---

## [LOW] TAURI_DEV_HOST Environment Variable Not Validated

> Development server host binding from env var without validation

**File**: `vite.config.ts:6`  
**Category**: Correctness  
**Severity**: Low  

### Description

The `TAURI_DEV_HOST` environment variable is used directly without validation. While this is only used in development, an invalid value could cause confusing errors.

### Current Code

```typescript
const host = process.env.TAURI_DEV_HOST;
```

### Suggested Fix

This is acceptable as-is for a development-only configuration. Vite will fail with a clear error if the host is invalid. No change required, but documentation in `.env.example` would be helpful.

### Verification

1. Set `TAURI_DEV_HOST=invalid` and run `npm run tauri dev`
2. Verify error message is understandable

---

## [LOW] Path Alias Could Use Constants

> Path alias uses relative path resolution

**File**: `vite.config.ts:46-49`  
**Category**: Maintainability  
**Severity**: Low  

### Description

The `@` path alias is standard practice and correctly implemented. The use of `fileURLToPath` and `path.dirname` to get `__dirname` in ESM is correct.

### Current Code

```typescript
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ...
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
},
```

### Suggested Fix

No change required. This is the correct pattern for ESM modules in Node.js.

### Verification

1. Import using `@/` prefix works in components
2. TypeScript understands the alias (check `tsconfig.json` has matching `paths`)

---

## [INFO] Vite Configuration is Minimal and Focused

> Configuration follows best practices for Tauri integration

**File**: `vite.config.ts`  
**Category**: Maintainability  
**Severity**: Info  

### Description

The configuration is well-structured:
- Fixed port (1420) for Tauri integration
- HMR properly configured for mobile development
- Ignores `src-tauri` directory to avoid unnecessary rebuilds
- Single `define` for environment variable injection

This follows the standard Tauri + Vite pattern.

---

## [INFO] Environment Variable Exposure is Correct

> Only safe, non-secret values exposed to client

**File**: `vite.config.ts:21-23`  
**Category**: Security  
**Severity**: Info  

### Description

The only value exposed via `define` is `VITE_WORKER_URL`, which is:
- A public URL (not a secret)
- The Cloudflare Worker endpoint that acts as a proxy
- Correctly prefixed with `VITE_` for Vite's security model

The pattern correctly avoids exposing sensitive environment variables like `FINNHUB_API_KEY`, `GITHUB_TOKEN`, or `SUPABASE_SERVICE_KEY` to the client.

### Verification

1. Grep for `import.meta.env` usage - only `VITE_WORKER_URL` and `VITE_APP_VERSION` found
2. Both are safe to expose (public URL, version string)
3. Secrets are managed in Cloudflare Worker via `wrangler secret`

---

## Security Checklist

- [x] **Input Validation**: N/A (build config)
- [x] **Injection Prevention**: N/A
- [x] **Secrets & Sensitive Data**: No secrets exposed to client bundle
- [x] **Environment Variables**: Only safe values (WORKER_URL) exposed with VITE_ prefix

## Correctness Checklist

- [x] **Logic**: Configuration is valid for Tauri + Vite
- [x] **Edge Cases**: Falls back correctly when WORKER_URL not set
- [x] **Error Handling**: Vite handles invalid configs with clear errors

## Performance Checklist

- [ ] **Build Optimization**: Source maps not explicitly disabled (Medium finding)
- [x] **Watch Configuration**: Correctly ignores src-tauri

## Maintainability Checklist

- [x] **Code Style**: Clean, readable configuration
- [x] **Structure**: Single responsibility
- [ ] **Hardcoded Values**: Production URL hardcoded (Medium finding)
- [x] **Comments**: Helpful comments explaining Tauri integration

---

## Conclusion

The `vite.config.ts` file is well-structured and follows Tauri + Vite best practices. The two medium findings are maintainability concerns rather than security issues. The environment variable handling correctly exposes only safe values to the client bundle.

**Recommendation**: PASSED - No blocking issues. Medium findings are improvements for future consideration.
