# Code Review: infrastructure/cloudflare/wrangler.toml

**Reviewed:** 2026-01-18
**Reviewer:** Automated
**Result:** PASSED (2 Medium, 3 Low, 2 Info)

---

## [MEDIUM] Observability May Log Sensitive Data

> Invocation logs enabled with persistence could capture sensitive API responses

**File**: `infrastructure/cloudflare/wrangler.toml:17-22`
**Category**: Security
**Severity**: Medium

### Description

The observability configuration enables `invocation_logs = true` and `persist = true`. While useful for debugging, this could inadvertently log sensitive data from API responses (e.g., user portfolio data, GitHub issue contents, error messages containing PII).

The worker handles:
- Finnhub API responses (stock data - low risk)
- GitHub issue creation (user feedback - may contain PII)
- Error reports (may contain system details)

### Current Code

```toml
[observability.logs]
enabled = true
head_sampling_rate = 1
persist = true
invocation_logs = true
```

### Suggested Fix

Either reduce sampling rate for production or ensure worker sanitizes responses before they're logged:

```toml
[observability.logs]
enabled = true
head_sampling_rate = 0.1  # Sample 10% of requests
persist = true
invocation_logs = false   # Disable in production, enable for debugging
```

Or add environment-specific config:

```toml
[env.production.observability.logs]
enabled = true
head_sampling_rate = 0.1
persist = true
invocation_logs = false

[env.development.observability.logs]
enabled = true
head_sampling_rate = 1
persist = true
invocation_logs = true
```

### Verification

1. Check Cloudflare dashboard logs for any PII leakage
2. Review what data is captured in traces/logs
3. Verify compliance with data retention policies

---

## [MEDIUM] Rate Limiting Resets on Worker Restart

> In-memory rate limiting provides no protection against distributed attacks

**File**: `infrastructure/cloudflare/wrangler.toml:29-35`
**Category**: Security
**Severity**: Medium

### Description

The configuration acknowledges that rate limiting uses in-memory storage and resets on worker restart. This means:
- Rate limits are not shared across worker instances (Cloudflare may run multiple)
- A determined attacker could exhaust API quota by triggering worker restarts
- Deployment causes rate limit reset

The KV namespace for persistent rate limiting is commented out.

### Current Code

```toml
# Rate limiting can be enhanced with Cloudflare's Rate Limiting product
# For now, we use in-memory limiting (resets on worker restart)

# KV namespace for persistent rate limiting (optional)
# [[kv_namespaces]]
# binding = "RATE_LIMIT_KV"
# id = "your-kv-namespace-id"
```

### Suggested Fix

Consider one of these approaches:

**Option A:** Enable Cloudflare's built-in Rate Limiting (paid feature)
```toml
# Add rate limiting rules in Cloudflare dashboard
# No config needed here
```

**Option B:** Enable KV namespace for cross-instance persistence
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "create-via-wrangler-kv-namespace-create"
```

**Option C:** Use Durable Objects for precise distributed rate limiting (most robust)

### Verification

1. Create KV namespace: `wrangler kv:namespace create "RATE_LIMIT_KV"`
2. Update worker.js to use KV for rate limit storage
3. Test rate limiting persists across deployments

---

## [LOW] Compatibility Date May Be Outdated

> Compatibility date of 2024-01-01 may miss newer Cloudflare features

**File**: `infrastructure/cloudflare/wrangler.toml:3`
**Category**: Maintainability
**Severity**: Low

### Description

The `compatibility_date` is set to `2024-01-01`. While this ensures stable behavior, it means the worker may not have access to newer Cloudflare features and improvements.

### Current Code

```toml
compatibility_date = "2024-01-01"
```

### Suggested Fix

Consider updating to a more recent date during the next scheduled update:

```toml
compatibility_date = "2024-06-01"  # Or current date when deploying
```

### Verification

1. Review [Cloudflare changelog](https://developers.cloudflare.com/workers/platform/compatibility-dates/) for breaking changes
2. Test worker with new compatibility date in staging
3. Update during scheduled maintenance window

---

## [LOW] Missing Environment-Specific Configurations

> No staging/production environment separation in wrangler config

**File**: `infrastructure/cloudflare/wrangler.toml`
**Category**: Maintainability
**Severity**: Low

### Description

The configuration lacks environment-specific sections for staging and production. This makes it harder to:
- Test changes safely before production
- Use different secrets/variables per environment
- Apply stricter logging/observability in production

### Current Code

```toml
name = "portfolio-prism-proxy"
main = "worker.js"
# ... single environment config
```

### Suggested Fix

Add environment-specific configurations:

```toml
name = "portfolio-prism-proxy"
main = "worker.js"
compatibility_date = "2024-01-01"

# Shared vars
[vars]

# Production (default)
[env.production]
name = "portfolio-prism-proxy"

[env.production.vars]
ENVIRONMENT = "production"

# Staging for testing
[env.staging]
name = "portfolio-prism-proxy-staging"

[env.staging.vars]
ENVIRONMENT = "staging"
```

Deploy with: `wrangler deploy --env staging` or `wrangler deploy --env production`

### Verification

1. Create staging worker with separate secrets
2. Test new features in staging before production
3. Document deployment process in CONTRIBUTING.md

---

## [LOW] Empty vars Section

> Non-secret variables section is present but empty

**File**: `infrastructure/cloudflare/wrangler.toml:10-11`
**Category**: Maintainability
**Severity**: Low

### Description

The `[vars]` section is documented but empty. Consider adding useful non-secret variables or removing the section to reduce configuration noise.

### Current Code

```toml
[vars]
# Non-secret variables can go here
```

### Suggested Fix

Either add useful variables or document intent:

```toml
[vars]
# Version for debugging (auto-updated by CI/CD)
VERSION = "dev"
# Feature flags
ENABLE_DEDUP = "true"
```

Or if intentionally empty, consider removing with a comment in commit message explaining it's added on-demand.

### Verification

1. Decide if environment variables are needed
2. Add useful debugging variables if applicable

---

## [INFO] Secrets Management Best Practice

> Good practice: Secrets properly documented and not hardcoded

**File**: `infrastructure/cloudflare/wrangler.toml:5-8`
**Category**: Security
**Severity**: Info

### Description

The configuration correctly documents secrets without hardcoding them:
- `FINNHUB_API_KEY` - External API access
- `GITHUB_TOKEN` - GitHub API access
- `GITHUB_REPO` - Target repository

All are set via `wrangler secret put`, which is the correct approach.

### Recommendation

Ensure the following are documented in the project's secure setup guide:
1. Required secrets list
2. Minimum permission scopes for GITHUB_TOKEN
3. Secret rotation procedure

---

## [INFO] KV Namespace Ready for Upgrade

> Rate limiting KV namespace is pre-configured, just needs enabling

**File**: `infrastructure/cloudflare/wrangler.toml:32-35`
**Category**: Maintainability
**Severity**: Info

### Description

The configuration has KV namespace bindings ready but commented out. This is good planning - when the project scales or faces abuse, enabling persistent rate limiting is straightforward.

### Recommendation

Create a GitHub issue or task to track enabling KV-based rate limiting when:
- User base grows significantly
- API abuse is detected
- Compliance requires audit trails

---

## Summary

| Severity | Count | Categories |
|----------|-------|------------|
| Critical | 0 | - |
| High | 0 | - |
| Medium | 2 | Security (observability, rate limiting) |
| Low | 3 | Maintainability |
| Info | 2 | Best practices |

**Overall Assessment:** The wrangler.toml configuration follows good security practices for secret management. The medium findings around observability and rate limiting are worth addressing for production hardening but are not blockers. The configuration is production-ready with the noted improvements for future consideration.
