# API & Interface Standards (2026)

> **Mandate:** Predictable, Versioned, Safe.

## 1. RESTful API Rules
- **Resources:** Nouns only (`/users`, `/orders`).
- **Methods:**
  - `GET`: Read (Idempotent).
  - `POST`: Create (Return 201 + Resource).
  - `PUT`: Replace. `PATCH`: Update.
  - `DELETE`: Remove.
- **Status:** Use 200, 201, 400 (Bad Request), 401 (Auth), 403 (Perms), 404 (Missing), 500 (Bug).

## 2. JSON Response Contract
All endpoints MUST return this envelope:

```json
{
  "success": true, // or false
  "data": { ... }, // The resource (or null on error)
  "error": {       // Present only if success=false
    "code": "INVALID_INPUT",
    "message": "User friendly message",
    "details": { ... }
  },
  "meta": {        // Pagination info
    "page": 1,
    "limit": 20
  }
}
```

## 3. Pagination
- **Mandatory** for lists > 50 items.
- **Default:** `limit=20`. **Max:** `limit=100`.
- **Query Params:** `?page=1&limit=20` OR `?cursor=xyz`.

## 4. Interface Safety
- **Validation:** Validate ALL inputs (Body, Query, Params) with Zod/Pydantic.
- **Filtering:** Strip unknown fields from inputs (`strict` mode).
- **Output:** Sanitize response data (remove `password_hash`) before sending.
