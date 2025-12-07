# Coding Standards

> **Progressive Disclosure:** This file is an index. See `anamnesis/standards/` for full standards.
> **Read this:** When you need to know which standards apply to your current task.

---

## Standards Files

| File | Scope |
|------|-------|
| `standards/global.md` | Language-agnostic rules (security, testing, git, docs, operational mandates) |
| `standards/python.md` | Python-specific conventions |
| `standards/typescript.md` | TypeScript/JavaScript conventions |
| `standards/rust.md` | Rust/Tauri conventions (sidecar, commands, async) |

---

## When to Read Which

| Task | Read These |
|------|------------|
| Any code work | `standards/global.md` |
| Python code | `standards/global.md` + `standards/python.md` |
| TypeScript/JS code | `standards/global.md` + `standards/typescript.md` |
| Rust/Tauri code | `standards/global.md` + `standards/rust.md` |
| Code review | `standards/global.md` + relevant language file |
| Documentation only | `standards/global.md` (Sections 7-8) |

---

## Adding New Standards

Create new files in `anamnesis/standards/` for additional domains:

- `api.md` — API design patterns, REST/GraphQL conventions
- `database.md` — Schema design, query patterns, migrations
- `testing.md` — Test-specific standards (if beyond global)

Each new file should include a header:
```markdown
# [Domain] Standards

> **Read this when:** [Context for when this applies]
> **Also read:** `global.md`
```
