# Content Security Policy (CSP) Configuration

Portfolio Prism uses separate CSP configurations for development and production to balance security with developer experience.

## Configuration Files

| File | Purpose | Used By |
|------|---------|---------|
| `src-tauri/tauri.conf.json` | Development CSP (relaxed) | `npm run tauri:dev`, `tauri dev` |
| `src-tauri/tauri.prod.conf.json` | Production CSP (strict) | `npm run tauri:build` |

## Development vs Production CSP

### Development (`tauri.conf.json`)

The development CSP includes relaxed directives needed for Vite HMR:

- `script-src 'unsafe-inline' 'unsafe-eval'` - Required for Vite hot module replacement
- `connect-src https://*.workers.dev` - Wildcard for easier local testing
- `connect-src https://localhost:* http://localhost:*` - Local dev servers

### Production (`tauri.prod.conf.json`)

The production CSP removes unsafe directives and restricts connections:

- `script-src 'self'` - No inline scripts or eval (XSS protection)
- `connect-src https://portfolio-prism-proxy.bold-unit-582c.workers.dev` - Specific worker only
- No localhost connections

## Building for Production

Always use the production build script to apply strict CSP:

```bash
npm run tauri:build
```

This applies `tauri.prod.conf.json` via Tauri's `--config` merge feature.

## CSP Directives Explained

| Directive | Dev Value | Prod Value | Why |
|-----------|-----------|------------|-----|
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval'` | `'self'` | Vite HMR needs eval; production doesn't |
| `style-src` | `'self' 'unsafe-inline'` | `'self' 'unsafe-inline'` | Google Fonts injects inline styles |
| `connect-src` | `https://*.workers.dev` | Specific worker URL | Prevent data exfiltration in prod |
| `font-src` | `'self' data: https://fonts.gstatic.com` | Same | Google Fonts CDN |

## Testing CSP

After building for production:

1. Open the app
2. Press `Cmd+Option+I` to open DevTools
3. Check Console for CSP violation errors
4. Verify all features work (API calls, fonts, images)

## Updating Worker Domain

If the Cloudflare Worker domain changes:

1. Update `src-tauri/tauri.prod.conf.json` `connect-src` directive
2. Update `.env.example` `WORKER_URL` comment
3. Update this document

Current worker: `https://portfolio-prism-proxy.bold-unit-582c.workers.dev`
