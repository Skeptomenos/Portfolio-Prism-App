# Documentation Standards (2026)

> **Mandate:** "Why", not "What". Docs must be living artifacts.

## 1. Code Comments
- **The Golden Rule:** Comment the *Intent*, not the *Syntax*.
  - ❌ `i++; // Increment i`
  - ✅ `// Retry backoff logic to prevent API throttling`
- **Complex Logic:** If a block is complex, summarize the "Algorithm Strategy" above it.
- **Hacks:** Mark workarounds with `// FIXME: [Reason]`.

## 2. README.md (The Front Page)
Every project/module MUST have a `README.md` containing:
1.  **Purpose:** One sentence on what this does.
2.  **Quick Start:** Commands to install/run (`npm install && npm start`).
3.  **Env Vars:** List of required `.env` keys (copied from `.env.example`).
4.  **Architecture:** A brief ASCII diagram of data flow.

## 3. API Documentation
- **Auto-Gen:** Use Swagger/OpenAPI (FastAPI/NestJS) to generate docs from code.
- **Examples:** Provide one valid `curl` or JSON request example for every endpoint.

## 4. Commit Messages (Git Docs)
- **Context:** If a change is non-trivial, the commit body must explain *why* the change was made.
- **Links:** Reference Issue IDs (`Fixes #123`).

## 5. ⚠️ Negative Patterns (Don'ts)
- **NO** commented-out code. Delete it. Git has history.
- **NO** stale comments. If you change code, update the comment.
- **NO** generated comments ("Created by AI"). Remove them.
