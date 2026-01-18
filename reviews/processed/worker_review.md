# Code Review: infrastructure/cloudflare/worker.js

**Reviewed**: 2026-01-18  
**Reviewer**: Automated  
**Scope**: Rate limiting, CORS, API key injection, input validation, GitHub integration

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 3 |
| Low | 3 |
| Info | 2 |

**Overall**: The Cloudflare Worker is well-structured with appropriate API key injection and CORS handling. However, there is one high-severity issue with missing input validation on Finnhub endpoints that could allow abuse. Several medium-priority improvements for production robustness are recommended.

---

## Findings

### [HIGH] Missing Input Validation on Finnhub Endpoints

> Symbol and query parameters are passed directly to Finnhub without validation

**File**: `infrastructure/cloudflare/worker.js:260-269`  
**Category**: Security  
**Severity**: High

#### Description

The `/api/finnhub/profile`, `/api/finnhub/quote`, and `/api/finnhub/search` endpoints accept user-provided `symbol` or `q` parameters from the request body and pass them directly to the Finnhub API without any validation. While this doesn't directly expose secrets or enable injection (Finnhub handles its own validation), it allows:

1. **Resource abuse**: Attackers can use your API key allocation by sending arbitrary/malformed requests
2. **Cost implications**: Finnhub has rate limits per API key; unvalidated requests consume quota
3. **Potential SSRF-like abuse**: Malformed parameters could trigger unexpected Finnhub behavior

#### Current Code

```javascript
case '/api/finnhub/profile':
    data = await proxyFinnhub('stock/profile2', { symbol: body.symbol }, env);
    break;

case '/api/finnhub/quote':
    data = await proxyFinnhub('quote', { symbol: body.symbol }, env);
    break;

case '/api/finnhub/search':
    data = await proxyFinnhub('search', { q: body.q }, env);
    break;
```

#### Suggested Fix

```javascript
// Add validation helper at top of file
function validateSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') return null;
    // Stock symbols: 1-10 uppercase letters, may include dots (BRK.A) or hyphens
    const cleaned = symbol.trim().toUpperCase();
    if (!/^[A-Z]{1,10}(?:[.-][A-Z]{1,5})?$/.test(cleaned)) return null;
    return cleaned;
}

function validateSearchQuery(query) {
    if (!query || typeof query !== 'string') return null;
    const cleaned = query.trim().slice(0, 50); // Max 50 chars
    if (cleaned.length < 1) return null;
    return cleaned;
}

// In route handlers:
case '/api/finnhub/profile': {
    const symbol = validateSymbol(body.symbol);
    if (!symbol) {
        return new Response(JSON.stringify({ error: 'Invalid symbol format' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
    }
    data = await proxyFinnhub('stock/profile2', { symbol }, env);
    break;
}

case '/api/finnhub/quote': {
    const symbol = validateSymbol(body.symbol);
    if (!symbol) {
        return new Response(JSON.stringify({ error: 'Invalid symbol format' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
    }
    data = await proxyFinnhub('quote', { symbol }, env);
    break;
}

case '/api/finnhub/search': {
    const q = validateSearchQuery(body.q);
    if (!q) {
        return new Response(JSON.stringify({ error: 'Invalid search query' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
    }
    data = await proxyFinnhub('search', { q }, env);
    break;
}
```

#### Verification

1. Test with valid symbol: `{ "symbol": "AAPL" }` - should work
2. Test with invalid: `{ "symbol": "" }`, `{ "symbol": 123 }`, `{ "symbol": "../../etc" }` - should return 400
3. Test search with long query: truncated to 50 chars

---

### [MEDIUM] In-Memory Rate Limiting Resets on Worker Restart

> Rate limit state is lost on worker restarts or when requests hit different isolates

**File**: `infrastructure/cloudflare/worker.js:17-37`  
**Category**: Security  
**Severity**: Medium

#### Description

The rate limiting uses an in-memory `Map()` which:
1. Resets when the worker is restarted/redeployed
2. Is not shared across Cloudflare edge locations (isolates)
3. Can be bypassed by attackers who wait for isolate recycling

This is acknowledged in `wrangler.toml` as a known limitation, but should be addressed for production.

#### Current Code

```javascript
// In-memory rate limit store (use KV in production)
const rateLimitStore = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.windowMs;

    let entry = rateLimitStore.get(ip);
    if (!entry || entry.windowStart < windowStart) {
        entry = { windowStart: now, count: 0 };
    }

    entry.count++;
    rateLimitStore.set(ip, entry);

    return entry.count <= RATE_LIMIT.maxRequests;
}
```

#### Suggested Fix

Option 1: Use Cloudflare KV (simple):
```javascript
async function checkRateLimit(ip, env) {
    const now = Date.now();
    const key = `ratelimit:${ip}`;
    
    const stored = await env.RATE_LIMIT_KV.get(key, 'json');
    const windowStart = now - RATE_LIMIT.windowMs;
    
    let entry = stored && stored.windowStart > windowStart ? stored : { windowStart: now, count: 0 };
    entry.count++;
    
    // KV has eventual consistency, but good enough for rate limiting
    await env.RATE_LIMIT_KV.put(key, JSON.stringify(entry), { 
        expirationTtl: 120 // 2 minutes, auto-cleanup
    });
    
    return entry.count <= RATE_LIMIT.maxRequests;
}
```

Option 2: Use Cloudflare Rate Limiting product (recommended for production):
- Configure in Cloudflare dashboard: Security > WAF > Rate limiting rules
- Remove custom rate limiting code

#### Verification

1. Deploy with KV binding configured
2. Test rate limit persists across requests to different edge locations
3. Verify TTL cleanup works (wait 2+ minutes, check key is gone)

---

### [MEDIUM] Feedback/Report Endpoints Lack Input Length Validation

> User-provided message and metadata fields are not length-limited

**File**: `infrastructure/cloudflare/worker.js:155-178, 272-283`  
**Category**: Security  
**Severity**: Medium

#### Description

The `/feedback` and `/report` endpoints accept user-provided `message`, `title`, and `metadata` without validating their size. An attacker could:
1. Submit extremely large payloads, consuming worker CPU/memory
2. Create GitHub issues with massive bodies (GitHub API may reject, but wastes resources)
3. Exhaust GitHub API rate limits with large payloads

#### Current Code

```javascript
case '/feedback':
    const feedbackTitle = formatFeedbackTitle(body.type, body.message);
    const feedbackBody = formatFeedbackBody(body.message, body.metadata || {});
    // No size validation on body.message or body.metadata
```

#### Suggested Fix

```javascript
// Add validation helper
function validateFeedbackInput(body) {
    const errors = [];
    
    const validTypes = ['functional', 'feature', 'ui_ux', 'critical'];
    if (!body.type || !validTypes.includes(body.type)) {
        errors.push('Invalid feedback type');
    }
    
    if (!body.message || typeof body.message !== 'string') {
        errors.push('Message is required');
    } else if (body.message.length > 10000) {
        errors.push('Message exceeds 10,000 character limit');
    }
    
    if (body.metadata && JSON.stringify(body.metadata).length > 5000) {
        errors.push('Metadata exceeds 5KB limit');
    }
    
    return errors;
}

// In route handler:
case '/feedback': {
    const errors = validateFeedbackInput(body);
    if (errors.length > 0) {
        return new Response(JSON.stringify({ error: errors.join(', ') }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
        });
    }
    // ... rest of handler
}
```

#### Verification

1. Test with normal feedback - should work
2. Test with 15,000 char message - should return 400
3. Test with massive metadata object - should return 400

---

### [MEDIUM] CORS Allows Development Origins in Production

> Production worker accepts requests from localhost origins

**File**: `infrastructure/cloudflare/worker.js:43-48`  
**Category**: Security  
**Severity**: Medium

#### Description

The allowed CORS origins include development URLs (`http://localhost:1420`, `http://localhost:8501`) which should not be allowed in production deployments. This could allow malicious local scripts to access the API if a user is running something on those ports.

#### Current Code

```javascript
const allowedOrigins = [
    'tauri://localhost',
    'http://localhost:1420',
    'http://localhost:8501',
    'https://localhost'
];
```

#### Suggested Fix

Use environment-based origin configuration:

```javascript
function corsHeaders(origin, env) {
    // Production origins
    const prodOrigins = ['tauri://localhost'];
    
    // Development origins (only in dev environment)
    const devOrigins = env.ENVIRONMENT === 'development' 
        ? ['http://localhost:1420', 'http://localhost:8501', 'https://localhost']
        : [];
    
    const allowedOrigins = [...prodOrigins, ...devOrigins];
    const corsOrigin = allowedOrigins.includes(origin) ? origin : prodOrigins[0];

    return {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    };
}
```

Add to `wrangler.toml`:
```toml
[vars]
ENVIRONMENT = "production"

[env.dev.vars]
ENVIRONMENT = "development"
```

#### Verification

1. Deploy with `ENVIRONMENT=production`
2. Test from `http://localhost:1420` - should be rejected (no matching origin header)
3. Deploy dev environment, test localhost - should work

---

### [LOW] Error Responses May Leak Internal Details

> Catch-all error handler exposes raw error messages

**File**: `infrastructure/cloudflare/worker.js:311-318`  
**Category**: Security  
**Severity**: Low

#### Description

The catch block returns `error.message` directly to the client, which could leak internal implementation details, API error messages, or stack traces in some cases.

#### Current Code

```javascript
} catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
        },
    });
}
```

#### Suggested Fix

```javascript
} catch (error) {
    // Log full error for debugging (visible in Cloudflare dashboard)
    console.error('Worker error:', error.message, error.stack);
    
    // Return generic message to client
    return new Response(JSON.stringify({ 
        error: 'Internal server error',
        // Optionally include request ID for support
        requestId: crypto.randomUUID()
    }), {
        status: 500,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders(origin),
        },
    });
}
```

#### Verification

1. Trigger an error (e.g., missing env var)
2. Verify response shows generic message, not internal details
3. Check Cloudflare logs show full error

---

### [LOW] Missing Request Body Size Limit

> No explicit limit on request body size

**File**: `infrastructure/cloudflare/worker.js:256`  
**Category**: Performance  
**Severity**: Low

#### Description

While Cloudflare Workers have a default body size limit (100MB for bundled workers), the code doesn't enforce a stricter limit appropriate for this API. Extremely large JSON bodies could slow down parsing.

#### Current Code

```javascript
const body = request.method === 'POST' ? await request.json() : {};
```

#### Suggested Fix

```javascript
// Add at start of fetch handler
const contentLength = parseInt(request.headers.get('Content-Length') || '0', 10);
const MAX_BODY_SIZE = 100 * 1024; // 100KB - more than enough for any valid request

if (contentLength > MAX_BODY_SIZE) {
    return new Response(JSON.stringify({ error: 'Request body too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
    });
}
```

#### Verification

1. Send request with 50KB body - should work
2. Send request with 200KB body - should return 413

---

### [LOW] Rate Limit Store Cleanup Missing

> Expired rate limit entries are never cleaned up from the Map

**File**: `infrastructure/cloudflare/worker.js:23-37`  
**Category**: Performance  
**Severity**: Low

#### Description

When using in-memory rate limiting, expired entries are replaced but never deleted, causing the Map to grow unbounded. While isolates are recycled frequently, long-running isolates could accumulate stale entries.

#### Current Code

```javascript
let entry = rateLimitStore.get(ip);
if (!entry || entry.windowStart < windowStart) {
    entry = { windowStart: now, count: 0 };
}
// Old entry is overwritten but never deleted
```

#### Suggested Fix

```javascript
function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT.windowMs;

    // Periodic cleanup (every 100 requests)
    if (rateLimitStore.size > 0 && Math.random() < 0.01) {
        for (const [key, val] of rateLimitStore) {
            if (val.windowStart < windowStart) {
                rateLimitStore.delete(key);
            }
        }
    }

    let entry = rateLimitStore.get(ip);
    if (!entry || entry.windowStart < windowStart) {
        entry = { windowStart: now, count: 0 };
    }

    entry.count++;
    rateLimitStore.set(ip, entry);

    return entry.count <= RATE_LIMIT.maxRequests;
}
```

#### Verification

1. Note that this is less critical if KV is used instead
2. Monitor worker memory usage over time

---

### [INFO] GitHub API Token Permissions Should Be Minimal

> Ensure GitHub token has only necessary permissions

**File**: `infrastructure/cloudflare/wrangler.toml:6-8`  
**Category**: Security  
**Severity**: Info

#### Description

The worker uses `GITHUB_TOKEN` to create issues and add comments. This token should be a fine-grained personal access token with minimal permissions:
- Repository access: Single repository only
- Permissions: Issues (Read and write) only

Documented for operational awareness.

#### Verification

1. Review GitHub token settings
2. Ensure it's fine-grained, not classic
3. Ensure scope is limited to single repo + issues only

---

### [INFO] Consider Adding Request Logging

> No structured logging for debugging/auditing

**File**: `infrastructure/cloudflare/worker.js`  
**Category**: Maintainability  
**Severity**: Info

#### Description

While observability is enabled in `wrangler.toml`, there's no structured logging in the code. Adding request logging would help with debugging and security auditing.

#### Suggested Improvement

```javascript
// At start of fetch handler
console.log(JSON.stringify({
    event: 'request',
    path: url.pathname,
    method: request.method,
    ip: ip,
    origin: origin,
    timestamp: new Date().toISOString(),
}));

// On error
console.error(JSON.stringify({
    event: 'error',
    path: url.pathname,
    error: error.message,
    stack: error.stack,
    ip: ip,
}));
```

---

## Positive Observations

1. **API key injection is correct**: Finnhub API key is added server-side, never exposed to client
2. **CORS implementation is reasonable**: Uses allowlist approach, validates origin
3. **Rate limiting exists**: Even if imperfect, it provides basic protection
4. **Error deduplication is clever**: Using error hashes to update existing issues prevents spam
5. **Observability configured**: Logs and traces enabled in wrangler.toml
6. **Modular code structure**: Functions are well-separated and readable

---

## Recommendations Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | Add input validation on Finnhub endpoints | Low |
| 2 | Add feedback input size validation | Low |
| 3 | Environment-based CORS origins | Low |
| 4 | Migrate to KV or Cloudflare Rate Limiting | Medium |
| 5 | Add request body size limit | Low |
| 6 | Improve error response handling | Low |
