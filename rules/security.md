# Security Standards (2026)

> **Mandate:** Trust No One. Verify Everything.

## 1. Input Validation (The Firewall)
- **Edge Validation:** EVERY external input (API body, Query param, WebSocket message) MUST be validated with Zod/Pydantic.
- **Strict Mode:** Strip unknown fields. Do not allow "pollution" of extra data.
- **Type Casting:** Never cast user input (`input as User`). Validate it (`UserSchema.parse(input)`).

## 2. Authentication & Authorization
- **No Custom Crypto:** Use standard libraries (bcrypt, Argon2, WebCrypto API). NEVER implement hashing yourself.
- **Least Privilege:** API Tokens should be scoped (Read-Only vs Admin).
- **Broken Object Level Authorization (BOLA):** Always check ownership.
  - ❌ `SELECT * FROM items WHERE id = ?`
  - ✅ `SELECT * FROM items WHERE id = ? AND owner_id = ?`

## 3. Data Protection
- **Secrets:** NO secrets in code. NO secrets in Docker images. Load from ENV.
- **Logs:** Redact PII (Emails, Phones) and Credentials from logs.
- **Output:** Never return full user objects. Use a DTO to strip `password`, `salt`, `2fa_secret`.

## 4. Web Security (OWASP)
- **XSS:** React handles this mostly. Avoid `dangerouslySetInnerHTML`.
- **CSRF:** Use `SameSite=Strict` cookies.
- **Headers:** Set `Helmet` (Express) or equivalent:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Strict-Transport-Security`

## 5. ⚠️ Negative Patterns (Don'ts)
- **NO** sending Sensitive PII in URL params (`/login?token=secret`).
- **NO** committing `.env` files.
- **NO** disabling SSL verification in HTTP clients.
