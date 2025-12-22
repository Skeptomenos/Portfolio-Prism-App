# Workstream Registry

> **Purpose:** Tracks active parallel sessions and their ownership.
> **Updated by:** AI Agents during session start/end.

| Workstream | Feature Plan | Session Name | Status | Last Heartbeat |
| :--- | :--- | :--- | :--- | :--- |
| `infrastructure` | `keystone/project/workstreams/infrastructure.md` | `root-session` | `Active` | 2025-12-21 |
| `data-engine` | `keystone/project/workstreams/data-engine.md` | `root-session` | `Active` | 2025-12-21 |
| `frontend` | `keystone/project/workstreams/frontend.md` | `root-session` | `Active` | 2025-12-21 |
| `sqlite-migration` | `keystone/project/workstreams/sqlite-migration.md` | `root-session` | `Active` | 2025-12-21 |

---

## Registry Rules
1. **Unique Names**: Workstream names must match their filename in `keystone/project/workstreams/`.
2. **Session Ownership**: Only one session should be `Active` per workstream at a time.
3. **Heartbeat**: Agents should update the `Last Heartbeat` when calling the `keystone-board` skill.
